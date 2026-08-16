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

function showGlyphs(glyphs) {
  stopAnim();
  const gs = glyphs.map(g => ({ coeffs: g.coeffs, trace: EPI.tracePoints(g.coeffs, 200) }));
  animState = { glyphs: gs, start: performance.now() };
  animStart = animState.start;
  loop();
}

function stopAnim() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  animState = null;
}

// Reveal ~1 letter / 900ms; each letter animates ~drawMs then holds.
const DRAW_MS = 700;
const PER_LETTER = 850;
const CELL_FRAC = 0.85;

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

  // each letter i has its own reveal window [i, i+1]*PER_LETTER
  for (let i=0;i<n;i++){
    const g = st.glyphs[i];
    const ws = i*PER_LETTER;            // reveal start
    if (elapsed < ws) continue;
    const prog = (elapsed - ws) / DRAW_MS;   // 0..1 while drawing
    const frac = Math.min(1, prog);
    const row = Math.min(rows-1, Math.floor(i / fitsPerRow));
    const col = i % fitsPerRow;
    const lettersInRow = Math.min(fitsPerRow, n - row*fitsPerRow);
    const rowW = lettersInRow * (box*1.7);
    const rowX0 = W/2 - rowW/2;
    const cx = rowX0 + col*box*1.7 + box/2;
    const cy = margin + row*rowH + rowH/2;

    ctx.globalAlpha = frac >= 1 ? 0.6 : 1;
    const color = frac < 1 ? '#00FFFF' : '#ffffff';
    EPI.tracePath(ctx, g.trace, cx, cy, box, color, frac);
  }

  ctx.globalAlpha = 1;
  const done = elapsed > (n-1)*PER_LETTER + DRAW_MS + 800;
  if (!done) {
    raf = requestAnimationFrame(loop);
  } else {
    animState = null; // hold message on screen until next action clears canvas
  }
}

function setStatus(s) { statusEl.textContent = `— ${s}`; }

// ---- Stage 1: Weave & Download ----
btnWeave.addEventListener('click', () => {
  const text = (msgEl.value || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!text) { setStatus('nothing to weave'); return; }
  const missing = [...text].filter(c => !alphabet[c]);
  if (missing.length) { setStatus(`unsupported: ${missing.join('')}`); return; }

  const { samples } = weaveBlocks(text, alphabet);
  const buf = encodeWav(samples, SGFConfig.sampleRate);
  const url = wavBlobUrl(buf);

  const a = document.createElement('a');
  a.href = url; a.download = 'sgf_signal.wav';
  document.body.appendChild(a); a.click(); a.remove();

  // chained decode preview: rebuild coefficients from our own samples
  const { blocks } = analyzeBlocks(samples);
  showGlyphs(blocks.map(b => ({ coeffs: b.coeffs, label: '' })));
  setStatus('weaved → downloaded · decoding');
});

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
  showGlyphs(blocks.map(b => ({ coeffs: b.coeffs, label: '' })));
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