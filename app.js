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
let animState = null; // { glyphs: [{coeffs, color}], t-phase }

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize);
resize();

function showGlyphs(glyphs) {
  // glyphs: [{coeffs, label}] -> animate epicycles+traces for all
  stopAnim();
  animState = { glyphs, t: 0 };
  loop();
}

function stopAnim() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  animState = null;
}

function loop() {
  const st = animState;
  if (!st) return;
  const W = innerWidth, H = innerHeight;
  ctx.clearRect(0, 0, W, H);

  const n = st.glyphs.length;
  const per = Math.min(W, H) * 0.16;

  // fade past letters (already-traced glyphs)
  for (let i=0;i<n;i++){
    const g = st.glyphs[i];
    const cx = W/2 + (i - (n-1)/2) * (W*0.20);
    const cy = H/2;
    const s = EPI.fitScale(g.coeffs, per);
    const prog = Math.min(1.0, (n === 1 ? st.t : (n*st.t - i) * 3));
    if (prog <= 0) continue;
    ctx.globalAlpha = i === n-1 ? 1 : 0.55;
    EPI.drawClosedGlyph(ctx, g.coeffs, cx, cy, s, i === n-1 ? '#00FFFF' : '#ffffff', 0, prog);
  }

  // live rotating chain on the active (last) letter
  const last = st.glyphs[n-1];
  if (last) {
    const cx = W/2 + ((n-1) - (n-1)/2)*W*0.20;
    const cy = H/2;
    const s = EPI.fitScale(last.coeffs, per);
    ctx.globalAlpha = 1;
    EPI.drawEpicycles(ctx, last.coeffs, st.t % 1, cx, cy, s, '#00FFFF');
  }
  ctx.globalAlpha = 1;

  st.t += 0.0025;
  raf = requestAnimationFrame(loop);
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