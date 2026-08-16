// SGF browser entry. Wires the two stages:
//  Stage 1 "Weave & Download" — text -> composite WAV (+ auto preview decoding)
//  Stage 2 "Upload & See"      — .wav file -> epicycles

import { SGFConfig } from './js/config.js';
import { weaveBlocks } from './js/weaver.js';
import { encodeWav, wavBlobUrl } from './js/wavEncoder.js';
import { analyzeBlocks } from './js/seer.js';
import * as EPI from './js/epicycles.js';

const alphabet = await fetch('./js/alphabet.json').then(r => r.json());

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const btnWeave = document.getElementById('btn-weave');
const btnSee = document.getElementById('btn-see');
const msgEl = document.getElementById('msg');
const fileEl = document.getElementById('file');

let raf = null;
let animState = null; // { glyphs: [{coeffs, trace}], start }
let animStart = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize);
resize();

function showGlyphs(glyphs, onDone) {
  stopAnim();
  const gs = glyphs.map(g => {
    const coeffs = (g.coeffs||[]).slice(0, HARM_VIS);
    return { coeffs, trace: EPI.tracePoints(coeffs, 300) };
  });
  animState = { glyphs: gs, start: performance.now(), onDone: onDone || null };
  animStart = animState.start;
  loop();
}

function stopAnim() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  animState = null;
}

// Each letter revolves once (drawMs) then holds as a dimmed trace.
const DRAW_MS = 1200;      // one full epicycle revolution per letter
const PER_LETTER = 1300;
const CELL_FRAC = 0.85;
const HARM_VIS = 10;       // harmonics used for the visual (matches tuner sweet spot)

function loop() {
  const st = animState;
  if (!st) return;
  const W = innerWidth, H = innerHeight;
  const n = st.glyphs.length;
  const margin = Math.min(W,H)*0.09;
  const elapsed = performance.now() - st.start;

  // adaptive layout: wrap letters into rows that fit width
  const cellBox = Math.min(W, H)*0.20;
  const fitsPerRow = Math.max(1, Math.floor((W-2*margin) / (cellBox*1.7)));
  const rows = Math.ceil(n / Math.max(1, fitsPerRow));
  const rowH = (H - 2*margin) / rows;
  const box = Math.min(cellBox, rowH*CELL_FRAC);

  ctx.clearRect(0,0,W,H);

  // each letter i has its own revolution window [i, i+1]*PER_LETTER
  for (let i=0;i<n;i++){
    const g = st.glyphs[i];
    const ws = i*PER_LETTER;                 // reveal start
    if (elapsed < ws) continue;
    const prog = (elapsed - ws) / DRAW_MS;   // 0..1 during its revolution
    const frac = Math.min(1, prog);
    const t = frac % 1;                       // revolution phase [0,1) — the rotating chain

    const row = Math.min(rows-1, Math.floor(i / fitsPerRow));
    const col = i % fitsPerRow;
    const lettersInRow = Math.min(fitsPerRow, n - row*fitsPerRow);
    const rowW = lettersInRow * (box*1.7);
    const rowX0 = W/2 - rowW/2;
    const cx = rowX0 + col*box*1.7 + box/2;
    const cy = margin + row*rowH + rowH/2;

    // TRUE Fourier frame: rotating chain + the trace its tip is laying down.
    const color = frac < 1 ? '#00FFFF' : '#ffffff';
    EPI.drawEpicycleFrame(ctx, g.coeffs, g.trace, t, cx, cy, box, color, frac);
  }

  ctx.globalAlpha = 1;
  const done = elapsed > (n-1)*PER_LETTER + DRAW_MS + 800;
  if (!done) {
    raf = requestAnimationFrame(loop);
  } else {
    const cb = st.onDone;
    animState = null;
    if (cb) cb();
  }
}

function setStatus(s) { statusEl.textContent = `— ${s}`; }

// ---- Stage 1: Weave & Download ----
btnWeave.addEventListener('click', () => {
  const text = (msgEl.value || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!text) { setStatus('nothing to weave'); return; }
  const missing = [...text].filter(c => !alphabet[c]);
  if (missing.length) { setStatus(`unsupported: ${missing.join('')}`); return; }

  // build the WAV now (pure), but do NOT download yet — visualize first
  const { samples } = weaveBlocks(text, alphabet);
  const buf = encodeWav(samples, SGFConfig.sampleRate);

  // render the proven glyphs (each letter draws itself), THEN download on done
  const glyphs = [...text].map(c => ({ coeffs: alphabet[c], trace: null }));
  btnWeave.disabled = true;
  setStatus('weaving · drawing…');
  showGlyphs(glyphs, () => {
    triggerDownload(buf);
    btnWeave.disabled = false;
    setStatus('weaved → downloaded · message drawn');
  });
});

function triggerDownload(buf) {
  const url = wavBlobUrl(buf);
  const a = document.createElement('a');
  a.href = url; a.download = 'sgf_signal.wav';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ---- Stage 2: Upload & See ----
btnSee.addEventListener('click', () => fileEl.click());
fileEl.addEventListener('change', async () => {
  const f = fileEl.files[0];
  if (!f) return;
  setStatus('reading signal…');
  const buf = await f.arrayBuffer();
  const samples = decodeWavToFloat32(buf);
  const { blocks } = analyzeBlocks(samples);
  setStatus(`${blocks.length} block${blocks.length===1?'':'s'} decoded`);
  showGlyphs(blocks.map(b => ({ coeffs: b.coeffs, trace: null })));
});

// Minimal WAV -> Float32Array (PCM16 mono, 48k). Handles our export format.
function decodeWavToFloat32(buf) {
  const dv = new DataView(buf);
  let off = 12, dataStart = -1, dataLen = 0, sr = 48000, bits = 16, ch = 1;
  const toStr = (o,l) => String.fromCharCode(...new Uint8Array(buf, o, l));
  while (off + 8 <= buf.byteLength) {
    const id = toStr(off, 4);
    const sz = dv.getUint32(off+4, true);
    if (id === 'fmt ') {
      ch = dv.getUint16(off+8+2, true);
      sr = dv.getUint32(off+8+4, true);
      bits = dv.getUint16(off+8+14, true);
    } else if (id === 'data') { dataStart = off+8; dataLen = sz; }
    off += 8 + sz + (sz % 2);
  }
  const nframes = dataLen / (bits/8 * ch);
  const out = new Float32Array(nframes);
  for (let i=0;i<nframes;i++){
    const v = dv.getInt16(dataStart + i*2*ch, true);
    out[i] = v / 32768;
  }
  void sr;
  return out;
}

// expose for tests/debug
window.SGF = { alphabet, weaveBlocks, encodeWav, analyzeBlocks, decodeWavToFloat32 };