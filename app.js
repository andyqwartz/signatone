// SIGNATONE browser entry.
//  ENCODE view: text -> WAV (audio player + audio settings, decode-safe shaping).
//  DECODE view: WAV -> epicycles (audio player + audio settings).
// Full character set is woven. Heavy DSP (weave + decode) runs in a Web Worker
// so long messages never freeze the UI. A header-marked pasted block is
// captured quietly. A discreet .txt transcription is always offered.

import { SGFConfig } from './js/config.js';
import { encodeWav, wavBlobUrl } from './js/wavEncoder.js';
import * as EPI from './js/epicycles.js';
import { computeLayout, isSealed } from './js/layout.js';
import { normalizeText } from './js/normalize.js';

const alphabet = await fetch('./js/alphabet.json').then(r => r.json());

const OS = '#EAE2D4';
const BASE_DRAW = 1250;
const BASE_PER = 1300;
const WEAVE_CAP = 4000;       // chars
const DECODE_CAP = 4000;      // blocks

const $ = (id) => document.getElementById(id);
const canvas = $('stage'), ctx = canvas.getContext('2d');
const persistCanvas = document.createElement('canvas'), pctx = persistCanvas.getContext('2d');
const statusEl = $('status');
const btnWeave = $('btn-weave'), btnSee = $('btn-see');
const btnTxt = $('btn-txt'), btnTxt2 = $('btn-txt2');
const msgEl = $('msg'), fileEl = $('file');
const sealEl = $('seal');
const viewEncode = $('view-encode'), viewDecode = $('view-decode');
const btnModeEnc = $('btn-mode-encode'), btnModeDec = $('btn-mode-decode');

const audioEncode = $('audio-encode'), playEncode = $('play-encode'),
      scrubEncode = $('scrub-encode'), timeEncode = $('time-encode'),
      playerEncode = $('player-encode');
const audioDecode = $('audio-decode'), playDecode = $('play-decode'),
      scrubDecode = $('scrub-decode'), timeDecode = $('time-decode'),
      playerDecode = $('player-decode');

let dpr = 1, raf = null, animState = null, hoverIdx = -1, persistDirty = true;
let mode = 'encode';
let syncToAudio = false;        // decode: couple epicycles to audio playback
let tx = null;                  // pending transcription descriptor
let decodeUrl = null;

const SETTINGS_KEY = 'sgf.settings.v3';
const settings = loadSettings();

function loadSettings() {
  const def = { harmonics: 10, noise: 0, seed: 12345, speed: 1, spacing: 1.7, single: 14,
    accent: '#E8A33D', glow: true, audioGain: 1, audioTempo: 1, audioVol: 1, audioTempo2: 1 };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
  catch { return def; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  persistCanvas.width = innerWidth * dpr; persistCanvas.height = innerHeight * dpr;
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (animState) { recomputeLayout(); persistDirty = true; }
}
window.addEventListener('resize', resize);
resize();

/* ---------------- mode switch ---------------- */
function setMode(m) {
  mode = m;
  document.body.className = 'mode-' + m;
  btnModeEnc.classList.toggle('is-active', m === 'encode');
  btnModeDec.classList.toggle('is-active', m === 'decode');
  viewEncode.hidden = m !== 'encode';
  viewDecode.hidden = m !== 'decode';
  $('audio-title').textContent = 'audio · ' + m;
  applyAudioControls();
  // only the active view's player shows
  playerEncode.hidden = playerEncode.hidden || m !== 'encode';
  playerDecode.hidden = playerDecode.hidden || m !== 'decode';
}
btnModeEnc.addEventListener('click', () => setMode('encode'));
btnModeDec.addEventListener('click', () => setMode('decode'));

/* ---------------- rendering ---------------- */
function showGlyphs(glyphs, onDone) {
  stopAnim();
  const harmos = Math.min(settings.harmonics || 10, 64);
  const gs = glyphs.map(g => {
    const coeffs = (g.coeffs || []).slice(0, harmos);
    return { coeffs, trace: EPI.tracePoints(coeffs, 300) };
  });
  const sp = Math.max(0.25, settings.speed || 1);
  animState = { glyphs: gs, start: performance.now(), onDone: onDone || null,
    drawMs: BASE_DRAW / sp, per: BASE_PER / sp, prevSettled: -1 };
  recomputeLayout(); persistDirty = true;
  loop();
}
function stopAnim() { if (raf) cancelAnimationFrame(raf); raf = null; animState = null; }
function recomputeLayout() {
  animState.layout = computeLayout(animState.glyphs.length, innerWidth, innerHeight,
    { margin: 0.09, spacing: settings.spacing || 1.7, maxBox: 0.30, singleMax: settings.single || 14 });
}
function repaintPersist(st, settled) {
  pctx.clearRect(0, 0, innerWidth, innerHeight);
  pctx.lineWidth = 0.6; pctx.strokeStyle = OS; pctx.globalAlpha = 0.5;
  for (let i = 0; i < settled; i++) {
    const g = st.glyphs[i], L = st.layout[i];
    if (!g || !L || !g.coeffs.length) continue;
    const tr = g.trace, s = L.box * 0.85 / (traceSpan(tr) || 1);
    pctx.beginPath();
    for (let j = 0; j < tr.length; j++) { const dx = L.cx + tr[j][0] * s, dy = L.cy + tr[j][1] * s; j ? pctx.lineTo(dx, dy) : pctx.moveTo(dx, dy); }
    pctx.closePath(); pctx.stroke();
  }
  pctx.globalAlpha = 1;
}
function traceSpan(tr) { let mx=1e9,Mx=-1e9,my=1e9,My=-1e9; for (const [x,y] of tr){ if(x<mx)mx=x; if(x>Mx)Mx=x; if(y<my)my=y; if(y>My)My=y; } return Math.max(Mx-mx,My-my); }
function drawLive(g, L, t, frac, color) {
  if (!g.coeffs.length) return;
  ctx.save();
  if (settings.glow) { ctx.shadowColor = 'rgba(232,163,61,0.35)'; ctx.shadowBlur = 10; }
  EPI.drawEpicycleFrame(ctx, g.coeffs, g.trace, t, L.cx, L.cy, L.box, color, frac);
  ctx.restore();
}
canvas.addEventListener('mousemove', (e) => {
  if (!animState) return;
  const L = animState.layout || []; hoverIdx = -1;
  for (let i = 0; i < L.length; i++) { const p = L[i]; if (p && Math.hypot(e.clientX-p.cx, e.clientY-p.cy) < p.box*0.5) { hoverIdx = i; break; } }
  if (!raf) loop();
});
canvas.addEventListener('mouseleave', () => { hoverIdx = -1; });

function loop() {
  const st = animState; if (!st) return;
  const W = innerWidth, H = innerHeight;
  const n = st.glyphs.length;

  let elapsed;
  if (syncToAudio && audioDecode.duration && !audioDecode.paused) {
    const perSec = audioDecode.duration / Math.max(1, n);
    const t = audioDecode.currentTime;
    const li = Math.min(n - 1, Math.floor(t / perSec));
    elapsed = li * st.per + Math.min(1, (t - li * perSec) / perSec) * st.drawMs;
  } else { elapsed = performance.now() - st.start; }

  let settled = 0;
  while (settled < n && elapsed >= settled * st.per + st.drawMs) settled++;

  ctx.clearRect(0, 0, W, H);
  if (persistDirty || settled !== st.prevSettled) { repaintPersist(st, settled); st.prevSettled = settled; persistDirty = false; }
  ctx.drawImage(persistCanvas, 0, 0, W, H);

  const L = st.layout || [];
  for (let i = 0; i < n; i++) {
    if (elapsed < i * st.per) continue;
    const frac = Math.min(1, (elapsed - i * st.per) / st.drawMs);
    if (frac < 1) drawLive(st.glyphs[i], L[i], frac % 1, frac, settings.accent);
  }
  if (hoverIdx >= 0 && hoverIdx < n && st.prevSettled > hoverIdx) {
    const ht = ((performance.now()) / 1600) % 1;
    drawLive(st.glyphs[hoverIdx], L[hoverIdx], ht, 1, settings.accent);
  }
  const done = elapsed >= (n - 1) * st.per + st.drawMs;
  if (!st._cbFired && done) { st._cbFired = true; if (st.onDone) st.onDone(); }
  raf = requestAnimationFrame(loop);
}

function setStatus(s) { statusEl.textContent = `— ${s}`; }

/* ---------------- quiet confirmation ---------------- */
let sealTimer = null;
function showSeal(ok, line) {
  sealEl.innerHTML = `<span class="ok">${ok}</span>${line}`;
  sealEl.hidden = false;
  requestAnimationFrame(() => sealEl.classList.add('show'));
  clearTimeout(sealTimer);
  sealTimer = setTimeout(() => { sealEl.classList.remove('show'); setTimeout(() => { sealEl.hidden = true; }, 320); }, 2800);
}

/* ---------------- worker ---------------- */
function runWorker(msg, transfer) {
  return new Promise((res, rej) => {
    const w = new Worker(new URL('./js/weave.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { w.terminate(); const m = e.data; m.type === 'error' ? rej(new Error(m.message)) : res(m); };
    w.onerror = (e) => { w.terminate(); rej(new Error(e.message || 'worker error')); };
    w.postMessage(msg, transfer || []);
  });
}

/* ---------------- transcription (.txt), lazy for decode ---------------- */
function downloadTxt(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function offerEncodeText(text) { tx = { kind: 'encode', text }; btnTxt.hidden = false; btnTxt2.hidden = false; }
function offerDecodeBlocks(blocks) { tx = { kind: 'decode', blocks }; btnTxt.hidden = false; btnTxt2.hidden = false; }
function transcribe() {
  if (!tx) return '';
  if (tx.kind === 'encode') return tx.text;
  return tx.blocks.map(b => bestGlyph(b.coeffs)).join('');
}
btnTxt.addEventListener('click', () => downloadTxt('signatone_transcription.txt', transcribe()));
btnTxt2.addEventListener('click', () => downloadTxt('signatone_transcription.txt', transcribe()));

function triggerDownload(buf) {
  const url = wavBlobUrl(buf);
  const a = document.createElement('a'); a.href = url; a.download = 'signatone_signal.wav';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ---------------- STAGE 1: ENCODE ---------------- */
btnWeave.addEventListener('click', async () => {
  const raw = msgEl.value || '';

  if (isSealed(raw)) {                          // opaque block -> quiet capture
    offerEncodeText(raw);
    setStatus('captured · text offered');
    showSeal('◈', 'signal captured — text offered');
    return;
  }

  const { chars, original } = normalizeText(raw, alphabet);
  if (!chars.length) { setStatus('nothing to weave'); return; }
  if (chars.length > WEAVE_CAP) { setStatus(`signal too large (${chars.length} > ${WEAVE_CAP})`); return; }

  btnWeave.disabled = true;
  setStatus('weaving…');
  try {
    const { samples } = await runWorker({ type: 'weave', text: chars.join(''),
      opts: { harmonics: settings.harmonics, noise: settings.noise, seed: settings.seed } });
    // decode-safe audio shaping: master gain (seer renormalises per-block peak)
    const g = settings.audioGain != null ? settings.audioGain : 1;
    if (g !== 1) for (let i = 0; i < samples.length; i++) samples[i] *= g;
    const buf = encodeWav(samples, SGFConfig.sampleRate);
    triggerDownload(buf);
    offerEncodeText(original);
    btnWeave.disabled = false;
    setStatus('weaved → downloaded · message drawn');
    audioEncode.src = wavBlobUrl(buf); audioEncode.playbackRate = settings.audioTempo || 1;
    playerEncode.hidden = mode !== 'encode' ? true : false;
    showGlyphs(chars.map(c => ({ coeffs: alphabet[c], trace: null })), () => setStatus('weaved → downloaded · message drawn'));
  } catch {
    btnWeave.disabled = false;
    setStatus('weave failed');
  }
});

/* ---------------- STAGE 2: DECODE ---------------- */
btnSee.addEventListener('click', () => fileEl.click());
fileEl.addEventListener('change', async () => {
  const f = fileEl.files[0];
  if (!f) return;
  setStatus('reading signal…');
  const buf = await f.arrayBuffer();
  if (decodeUrl) URL.revokeObjectURL(decodeUrl);
  decodeUrl = URL.createObjectURL(f);
  audioDecode.src = decodeUrl;
  audioDecode.volume = settings.audioVol != null ? settings.audioVol : 1;
  audioDecode.playbackRate = settings.audioTempo2 || 1;
  playerDecode.hidden = mode !== 'decode' ? true : false;
  try {
    const { blocks } = await runWorker({ type: 'decode', buffer: buf }, [buf]);
    if (blocks.length > DECODE_CAP) { setStatus(`signal too large (${blocks.length} > ${DECODE_CAP})`); return; }
    offerDecodeBlocks(blocks);
    setStatus(`${blocks.length} block${blocks.length === 1 ? '' : 's'} decoded`);
    showGlyphs(blocks.map(b => ({ coeffs: b.coeffs, trace: null })));
  } catch {
    setStatus('decode failed');
  }
});

/* best-effort decode transcription (lazy, on demand) */
let glyphCache = null;
function glyphLibrary() {
  if (glyphCache) return glyphCache;
  const cache = new Map();
  for (const k of Object.keys(alphabet)) {
    if (k === 'letterSet' || !Array.isArray(alphabet[k]) || !alphabet[k].length) continue;
    cache.set(k, normalizeShape(EPI.tracePoints(alphabet[k], 48)));
  }
  glyphCache = cache; return cache;
}
function normalizeShape(pts) {
  let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity,sx=0,sy=0;
  for (const [x,y] of pts){ if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; sx+=x; sy+=y; }
  const cx=sx/pts.length, cy=sy/pts.length, span=Math.max(mxx-mnx,mxy-mny)||1;
  return pts.map(([x,y])=>[(x-cx)/span,(y-cy)/span]);
}
function bestGlyph(coeffs) {
  if (!coeffs || !coeffs.length) return ' ';
  const t = normalizeShape(EPI.tracePoints(coeffs, 48));
  let best='?', bd=Infinity;
  for (const [k, gt] of glyphLibrary()) { let d=0; for (let i=0;i<t.length;i++){ const dx=t[i][0]-gt[i][0], dy=t[i][1]-gt[i][1]; d+=dx*dx+dy*dy; } if (d<bd){bd=d;best=k;} }
  return best;
}

/* ---------------- audio players ---------------- */
function wirePlayer(audio, play, scrub, timeEl) {
  play.addEventListener('click', () => {
    if (audio.paused) { audio.play(); play.textContent = '❚❚'; }
    else { audio.pause(); play.textContent = '▶'; }
  });
  audio.addEventListener('ended', () => { play.textContent = '▶'; scrub.value = 0; });
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    scrub.value = (audio.currentTime / audio.duration) * 1000;
    timeEl.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
  });
  scrub.addEventListener('input', () => { if (audio.duration) audio.currentTime = (scrub.value / 1000) * audio.duration; });
  audio.addEventListener('play', () => { if ($('audio-decode')===audio) syncToAudio = true; });
  audio.addEventListener('pause', () => { syncToAudio = false; });
}
function fmt(s) { if (!isFinite(s)) return '0:00'; const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); }
wirePlayer(audioEncode, playEncode, scrubEncode, timeEncode);
wirePlayer(audioDecode, playDecode, scrubDecode, timeDecode);

/* ---------------- adaptive text field ---------------- */
function autoResize() {
  msgEl.style.height = 'auto';
  msgEl.style.height = Math.min(msgEl.scrollHeight, innerHeight * 0.34) + 'px';
  const longest = (msgEl.value || '').split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  const cw = Math.max(220, Math.min(innerWidth * 0.46, longest * 12));
  msgEl.style.width = cw + 'px'; msgEl.style.maxWidth = '44vw';
}
msgEl.addEventListener('input', autoResize);
autoResize();

/* ---------------- signal config panel ---------------- */
const panel = $('settings'), titleTrig = $('titleTrig'),
      btnClose = $('btn-close-settings'), btnSettings = $('btn-settings');
const els = {
  harmo: { range: $('set-harmo'), out: $('o-harmo') }, noise: { range: $('set-noise'), out: $('o-noise') },
  seed: { range: $('set-seed'), out: $('o-seed') }, speed: { range: $('set-speed'), out: $('o-speed') },
  spacing: { range: $('set-spacing'), out: $('o-spacing') }, single: { range: $('set-single'), out: $('o-single') },
  accent: { range: $('set-accent'), out: $('o-accent') }, glow: { range: $('set-glow'), out: null },
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
function applyLive() { if (animState) { recomputeLayout(); persistDirty = true; } }
els.harmo.range.oninput = () => { settings.harmonics = +els.harmo.range.value; els.harmo.out.textContent = settings.harmonics; };
els.noise.range.oninput = () => { settings.noise = +els.noise.range.value; els.noise.out.textContent = settings.noise.toFixed(2); };
els.seed.range.oninput = () => { settings.seed = +els.seed.range.value; els.seed.out.textContent = settings.seed; };
els.speed.range.oninput = () => { settings.speed = +els.speed.range.value; els.speed.out.textContent = settings.speed.toFixed(2); };
els.spacing.range.oninput = () => { settings.spacing = +els.spacing.range.value; els.spacing.out.textContent = settings.spacing.toFixed(2); applyLive(); };
els.single.range.oninput = () => { settings.single = +els.single.range.value; els.single.out.textContent = settings.single; applyLive(); };
els.accent.range.oninput = () => { settings.accent = els.accent.range.value; els.accent.out.textContent = settings.accent; applyLive(); };
els.glow.range.onchange = () => { settings.glow = els.glow.range.checked; saveSettings(); };
for (const k of ['harmo','noise','seed','speed','spacing','single','accent']) els[k].range.onchange = saveSettings;

let titleClicks = 0, lastTap = 0;
titleTrig.addEventListener('click', () => {
  const now = Date.now();
  if (now - lastTap > 500) titleClicks = 0;
  titleClicks++; lastTap = now;
  if (titleClicks >= 3) { panel.hidden = !panel.hidden; titleClicks = 0; if (!panel.hidden) applyControls(); }
});
btnClose.addEventListener('click', () => { panel.hidden = true; saveSettings(); });
btnSettings.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) applyControls(); saveSettings(); });

/* ---------------- audio config panel (contextual) ---------------- */
const audioPanel = $('audio-options'), btnAudio = $('btn-audio'), btnCloseAudio = $('btn-close-audio');
const aEls = {
  gain: { range: $('set-a-gain'), out: $('o-a-gain') }, tempo: { range: $('set-a-tempo'), out: $('o-a-tempo') },
  vol: { range: $('set-a-vol'), out: $('o-a-vol') }, tempo2: { range: $('set-a-tempo2'), out: $('o-a-tempo2') },
};
function applyAudioControls() {
  aEls.gain.out.textContent = (+settings.audioGain).toFixed(2); aEls.gain.range.value = settings.audioGain;
  aEls.tempo.out.textContent = (+settings.audioTempo).toFixed(2); aEls.tempo.range.value = settings.audioTempo;
  aEls.vol.out.textContent = (+settings.audioVol).toFixed(2); aEls.vol.range.value = settings.audioVol;
  aEls.tempo2.out.textContent = (+settings.audioTempo2).toFixed(2); aEls.tempo2.range.value = settings.audioTempo2;
}
aEls.gain.range.oninput = () => { settings.audioGain = +aEls.gain.range.value; aEls.gain.out.textContent = settings.audioGain.toFixed(2); };
aEls.tempo.range.oninput = () => { settings.audioTempo = +aEls.tempo.range.value; aEls.tempo.out.textContent = settings.audioTempo.toFixed(2); audioEncode.playbackRate = settings.audioTempo; };
aEls.vol.range.oninput = () => { settings.audioVol = +aEls.vol.range.value; aEls.vol.out.textContent = settings.audioVol.toFixed(2); audioDecode.volume = settings.audioVol; };
aEls.tempo2.range.oninput = () => { settings.audioTempo2 = +aEls.tempo2.range.value; aEls.tempo2.out.textContent = settings.audioTempo2.toFixed(2); audioDecode.playbackRate = settings.audioTempo2; };
for (const k of ['gain','tempo','vol','tempo2']) aEls[k].range.onchange = saveSettings;
btnAudio.addEventListener('click', () => { audioPanel.hidden = !audioPanel.hidden; if (!audioPanel.hidden) applyAudioControls(); });
btnCloseAudio.addEventListener('click', () => { audioPanel.hidden = true; saveSettings(); });

applyControls(); applyAudioControls();
setMode('encode');

// expose for tests/debug
window.SGF = { alphabet, encodeWav, analyzeBlocks: null, settings, isSealed };