// SIGNATONE browser entry. Two stages:
//  Stage 1 "Weave & Download" — text -> composite WAV (auto preview decoding)
//  Stage 2 "Upload & See"      — .wav file -> epicycles
//
// Fast rendering: settled letters are composited once onto an offscreen layer
// and blitted each frame; only the currently-drawing letter + hovered cell are
// redrawn live, so long messages stay smooth.
//
// Stealth: pasted PGP armor is detected, woven to WAV and downloaded WITHOUT
// any epicycle drawing — a quiet confirmation only.

import { SGFConfig } from './js/config.js';
import { weaveBlocks } from './js/weaver.js';
import { encodeWav, wavBlobUrl } from './js/wavEncoder.js';
import { analyzeBlocks } from './js/seer.js';
import * as EPI from './js/epicycles.js';
import { computeLayout, isPGP } from './js/layout.js';

const alphabet = await fetch('./js/alphabet.json').then(r => r.json());

const OS = '#EAE2D4';              // settled-trace bone white
const BASE_DRAW = 1250;            // ms per letter revolution (scaled by speed)
const BASE_PER = 1300;             // ms stagger between letters (scaled by speed)

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const persistCanvas = document.createElement('canvas');
const pctx = persistCanvas.getContext('2d');
const statusEl = document.getElementById('status');
const btnWeave = document.getElementById('btn-weave');
const btnSee = document.getElementById('btn-see');
const msgEl = document.getElementById('msg');
const fileEl = document.getElementById('file');
const stealthEl = document.getElementById('stealth');

let dpr = 1;
let raf = null;
let animState = null;
let hoverIdx = -1;
let persistDirty = true;

const SETTINGS_KEY = 'sgf.settings.v2';
const settings = loadSettings();

function loadSettings() {
  const def = { harmonics: 10, noise: 0, seed: 12345, speed: 1, spacing: 1.7, single: 14, accent: '#E8A33D', glow: true };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
  catch { return def; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  persistCanvas.width = innerWidth * dpr;
  persistCanvas.height = innerHeight * dpr;
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (animState) { recomputeLayout(); persistDirty = true; }
}
window.addEventListener('resize', resize);
resize();

function showGlyphs(glyphs, onDone) {
  stopAnim();
  const harmos = Math.min(settings.harmonics || 10, 64);
  const gs = glyphs.map(g => {
    const coeffs = (g.coeffs || []).slice(0, harmos);
    return { coeffs, trace: EPI.tracePoints(coeffs, 300) };
  });
  const sp = Math.max(0.25, settings.speed || 1);
  animState = {
    glyphs: gs,
    start: performance.now(),
    onDone: onDone || null,
    drawMs: BASE_DRAW / sp,
    per: BASE_PER / sp,
    prevSettled: -1,
  };
  recomputeLayout();
  persistDirty = true;
  loop();
}

function stopAnim() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  animState = null;
}

function recomputeLayout() {
  const n = animState.glyphs.length;
  animState.layout = computeLayout(n, innerWidth, innerHeight, {
    margin: 0.09,
    spacing: settings.spacing || 1.7,
    maxBox: 0.30,
    singleMax: settings.single || 14,
  });
}

// Offscreen layer holding all fully-drawn (settled) letters. Repainted only when
// a new letter settles or the viewport changes — cheap for long messages.
function repaintPersist(st, settled) {
  pctx.clearRect(0, 0, innerWidth, innerHeight);
  pctx.lineWidth = 0.6;
  pctx.strokeStyle = OS;
  pctx.globalAlpha = 0.5;
  for (let i = 0; i < settled; i++) {
    const g = st.glyphs[i], L = st.layout[i];
    if (!g || !L) continue;
    const tr = g.trace;
    pctx.beginPath();
    for (let j = 0; j < tr.length; j++) {
      const dx = L.cx + tr[j][0] * (L.box * 0.85 / (traceSpan(tr) || 1));
      const dy = L.cy + tr[j][1] * (L.box * 0.85 / (traceSpan(tr) || 1));
      if (j === 0) pctx.moveTo(dx, dy); else pctx.lineTo(dx, dy);
    }
    pctx.closePath();
    pctx.stroke();
  }
  pctx.globalAlpha = 1;
}

function traceSpan(tr) {
  let mx = 1e9, Mx = -1e9, my = 1e9, My = -1e9;
  for (const [x, y] of tr) { if (x < mx) mx = x; if (x > Mx) Mx = x; if (y < my) my = y; if (y > My) My = y; }
  return Math.max(Mx - mx, My - my);
}

function drawLive(g, L, t, frac, color) {
  ctx.save();
  if (settings.glow) { ctx.shadowColor = 'rgba(232,163,61,0.35)'; ctx.shadowBlur = 10; }
  EPI.drawEpicycleFrame(ctx, g.coeffs, g.trace, t, L.cx, L.cy, L.box, color, frac);
  ctx.restore();
}

canvas.addEventListener('mousemove', (e) => {
  if (!animState) return;
  const L = animState.layout || [];
  hoverIdx = -1;
  for (let i = 0; i < L.length; i++) {
    const p = L[i];
    if (Math.hypot(e.clientX - p.cx, e.clientY - p.cy) < p.box * 0.5) { hoverIdx = i; break; }
  }
  if (!raf) loop();
});
canvas.addEventListener('mouseleave', () => { hoverIdx = -1; });

function loop() {
  const st = animState;
  if (!st) return;
  const W = innerWidth, H = innerHeight;
  const elapsed = performance.now() - st.start;
  const n = st.glyphs.length;

  // how many letters are fully drawn (contiguous, reveal in order)
  let settled = 0;
  while (settled < n && elapsed >= settled * st.per + st.drawMs) settled++;

  ctx.clearRect(0, 0, W, H);

  if (persistDirty || settled !== st.prevSettled) {
    repaintPersist(st, settled);
    st.prevSettled = settled;
    persistDirty = false;
  }
  ctx.drawImage(persistCanvas, 0, 0, W, H);

  // live drawing letters (the ones currently revolving) + hovered settled cell
  const L = st.layout || [];
  for (let i = 0; i < n; i++) {
    if (elapsed < i * st.per) continue;
    const frac = Math.min(1, (elapsed - i * st.per) / st.drawMs);
    if (frac < 1) {
      drawLive(st.glyphs[i], L[i], frac % 1, frac, settings.accent);
    }
  }
  if (hoverIdx >= 0 && hoverIdx < n && st.prevSettled > hoverIdx) {
    // overlay the living chain on the hovered settled letter
    const ht = ((performance.now()) / 1600) % 1;
    drawLive(st.glyphs[hoverIdx], L[hoverIdx], ht, 1, settings.accent);
  }

  const done = elapsed >= (n - 1) * st.per + st.drawMs;
  if (!st._cbFired && done) {
    st._cbFired = true;
    if (st.onDone) st.onDone();
  }
  raf = requestAnimationFrame(loop);
}

function setStatus(s) { statusEl.textContent = `— ${s}`; }

// ---- stealth toast ----
let stealthTimer = null;
function showStealth(ok, line) {
  stealthEl.innerHTML = `<span class="ok">${ok}</span>${line}`;
  stealthEl.hidden = false;
  requestAnimationFrame(() => stealthEl.classList.add('show'));
  clearTimeout(stealthTimer);
  stealthTimer = setTimeout(() => {
    stealthEl.classList.remove('show');
    setTimeout(() => { stealthEl.hidden = true; }, 320);
  }, 2800);
}

// ---- Stage 1: Weave & Download ----
btnWeave.addEventListener('click', () => {
  const raw = msgEl.value || '';
  const stealth = isPGP(raw);                      // hidden PGP detection
  const text = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (!text) { setStatus('nothing to weave'); return; }
  const missing = [...text].filter(c => !alphabet[c]);
  if (missing.length) { setStatus(`unsupported: ${missing.join('')}`); return; }

  const { samples } = weaveBlocks(text, alphabet, { harmonics: settings.harmonics, noise: settings.noise, seed: settings.seed });
  const buf = encodeWav(samples, SGFConfig.sampleRate);

  if (stealth) {
    // conversion WITHOUT visualization — quiet confirmation only
    btnWeave.disabled = true;
    setStatus('sealed · no trace left');
    showStealth('◈', `signal sealed · ${text.length} blocks · no trace left`);
    triggerDownload(buf);
    setTimeout(() => { btnWeave.disabled = false; }, 400);
    return;
  }

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
  a.href = url; a.download = 'signatone_signal.wav';
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
  setStatus(`${blocks.length} block${blocks.length === 1 ? '' : 's'} decoded`);
  showGlyphs(blocks.map(b => ({ coeffs: b.coeffs, trace: null })));
});

// Minimal WAV -> Float32Array (PCM16 mono, 48k). Handles our export format.
function decodeWavToFloat32(buf) {
  const dv = new DataView(buf);
  let off = 12, dataStart = -1, dataLen = 0, bits = 16, ch = 1;
  const toStr = (o, l) => String.fromCharCode(...new Uint8Array(buf, o, l));
  while (off + 8 <= buf.byteLength) {
    const id = toStr(off, 4);
    const sz = dv.getUint32(off + 4, true);
    if (id === 'fmt ') { ch = dv.getUint16(off + 8 + 2, true); bits = dv.getUint16(off + 8 + 14, true); }
    else if (id === 'data') { dataStart = off + 8; dataLen = sz; }
    off += 8 + sz + (sz % 2);
  }
  const nframes = dataLen / (bits / 8 * ch);
  const out = new Float32Array(nframes);
  for (let i = 0; i < nframes; i++) out[i] = dv.getInt16(dataStart + i * 2 * ch, true) / 32768;
  return out;
}

// ---- adaptive text field (grows for large text / PGP armor) ----
function autoResize() {
  msgEl.style.height = 'auto';
  msgEl.style.height = Math.min(msgEl.scrollHeight, innerHeight * 0.34) + 'px';
  const longest = (msgEl.value || '').split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  const cw = Math.max(220, Math.min(innerWidth * 0.46, longest * 12));
  msgEl.style.width = cw + 'px';
  msgEl.style.maxWidth = '44vw';
}
msgEl.addEventListener('input', autoResize);
autoResize();

// ---- settings panel ----
const panel = document.getElementById('settings');
const titleTrig = document.getElementById('titleTrig');
const btnClose = document.getElementById('btn-close-settings');
const btnSettings = document.getElementById('btn-settings');
const els = {
  harmo: { range: document.getElementById('set-harmo'), out: document.getElementById('o-harmo') },
  noise: { range: document.getElementById('set-noise'), out: document.getElementById('o-noise') },
  seed: { range: document.getElementById('set-seed'), out: document.getElementById('o-seed') },
  speed: { range: document.getElementById('set-speed'), out: document.getElementById('o-speed') },
  spacing: { range: document.getElementById('set-spacing'), out: document.getElementById('o-spacing') },
  single: { range: document.getElementById('set-single'), out: document.getElementById('o-single') },
  accent: { range: document.getElementById('set-accent'), out: document.getElementById('o-accent') },
  glow: { range: document.getElementById('set-glow'), out: null },
};

function applyControls() {
  els.harmo.out.textContent = settings.harmonics; els.harmo.range.value = settings.harmonics;
  els.noise.out.textContent = settings.noise.toFixed(2); els.noise.range.value = settings.noise;
  els.seed.out.textContent = settings.seed; els.seed.range.value = settings.seed;
  els.speed.out.textContent = (+settings.speed).toFixed(2); els.speed.range.value = settings.speed;
  els.spacing.out.textContent = (+settings.spacing).toFixed(2); els.spacing.range.value = settings.spacing;
  els.single.out.textContent = settings.single; els.single.range.value = settings.single;
  els.accent.out.textContent = settings.accent; els.accent.range.value = settings.accent;
  els.glow.range.checked = !!settings.glow;
}

function applyLive() {
  if (animState) { recomputeLayout(); persistDirty = true; }
}

els.harmo.range.addEventListener('input', () => { settings.harmonics = +els.harmo.range.value; els.harmo.out.textContent = settings.harmonics; });
els.noise.range.addEventListener('input', () => { settings.noise = +els.noise.range.value; els.noise.out.textContent = settings.noise.toFixed(2); });
els.seed.range.addEventListener('input', () => { settings.seed = +els.seed.range.value; els.seed.out.textContent = settings.seed; });
els.speed.range.addEventListener('input', () => { settings.speed = +els.speed.range.value; els.speed.out.textContent = settings.speed.toFixed(2); });
els.spacing.range.addEventListener('input', () => { settings.spacing = +els.spacing.range.value; els.spacing.out.textContent = settings.spacing.toFixed(2); applyLive(); });
els.single.range.addEventListener('input', () => { settings.single = +els.single.range.value; els.single.out.textContent = settings.single; applyLive(); });
els.accent.range.addEventListener('input', () => { settings.accent = els.accent.range.value; els.accent.out.textContent = settings.accent; applyLive(); });
els.glow.range.addEventListener('change', () => { settings.glow = els.glow.range.checked; });

for (const k of ['harmo', 'noise', 'seed', 'speed', 'spacing', 'single', 'accent']) {
  els[k].range.addEventListener('change', saveSettings);
}
els.glow.range.addEventListener('change', saveSettings);

let titleClicks = 0, lastTap = 0;
titleTrig.addEventListener('click', () => {
  const now = Date.now();
  if (now - lastTap > 500) titleClicks = 0;
  titleClicks++; lastTap = now;
  if (titleClicks >= 3) { panel.hidden = !panel.hidden; titleClicks = 0; if (!panel.hidden) applyControls(); }
});
btnClose.addEventListener('click', () => { panel.hidden = true; saveSettings(); });
btnSettings.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) applyControls(); saveSettings(); });

applyControls();

// expose for tests/debug
window.SGF = { alphabet, weaveBlocks, encodeWav, analyzeBlocks, decodeWavToFloat32, settings, isPGP };