// SGF Tuner — live visual tuning of a single glyph with persistent memory.
import { epicyclePoint } from './js/epicycles.js';
import { SGFConfig } from './js/config.js';

const alphabet = await fetch('./js/alphabet.json').then(r => r.json());
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const els = {
  harm: document.getElementById('harm'), o_harm: document.getElementById('o-harm'),
  scale: document.getElementById('scale'), o_scale: document.getElementById('o-scale'),
  speed: document.getElementById('speed'), o_speed: document.getElementById('o-speed'),
  res: document.getElementById('res'), o_res: document.getElementById('o-res'),
  epi: document.getElementById('epicycles'),
  color: document.getElementById('color'),
  probeCh: document.getElementById('probe-ch'), probeMeta: document.getElementById('probe-meta'),
  btnVerify: document.getElementById('btn-verify'), btnReset: document.getElementById('btn-reset'),
  letters: document.getElementById('letters'), mem: document.getElementById('mem-note'),
};

const MEM_KEY = 'sgf.tuner.v1';
const memory = loadMemory(); // { letter: {...params} }

let current = 'A';
let raf = null;

function loadMemory() {
  try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; }
  catch { return {}; }
}
function saveMemory() {
  memory[current] = { ...params() };
  localStorage.setItem(MEM_KEY, JSON.stringify(memory));
  note('saved');
}
function note(msg) {
  els.mem.textContent = `memory · ${msg} · presets are remembered per letter`;
}

function params() {
  return {
    harm: +els.harm.value, scale: +els.scale.value/100,
    speed: +els.speed.value, res: +els.res.value,
    epi: els.epi.value, color: els.color.value,
  };
}

// apply params to controls (from memory)
function applyParams(p) {
  els.harm.value = p.harm; els.o_harm.textContent = p.harm;
  els.scale.value = Math.round(p.scale*100); els.o_scale.textContent = Math.round(p.scale*100);
  els.speed.value = p.speed; els.o_speed.textContent = p.speed;
  els.res.value = p.res; els.o_res.textContent = p.res;
  els.epi.value = p.epi; els.color.value = p.color;
}

// build letter picker
const LET = alphabet.letterSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
for (const ch of LET) {
  const b = document.createElement('button');
  b.textContent = ch;
  b.addEventListener('click', () => { current = ch; highlight(); render(); });
  els.letters.appendChild(b);
}
function highlight() {
  [...els.letters.children].forEach(b => b.classList.toggle('active', b.textContent === current));
}

// resize
function size() {
  const dpr = Math.min(devicePixelRatio||1, 2);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
addEventListener('resize', size); size();

function glyphTrace(harm, res) {
  const pts = [];
  for (let i=0;i<=res;i++) { const p = epicyclePoint(harm, i/res); pts.push([p.x, p.y]); }
  return pts;
}
function drawTrace(pts, cx, cy, box, color, alpha=1) {
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for (const [x,y] of pts){ if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; }
  const span = Math.max(maxx-minx, maxy-miny) || 1;
  const s = box*0.85/span;
  const ox = cx-(minx+maxx)/2*s, oy = cy-(miny+maxy)/2*s;
  ctx.strokeStyle = color; ctx.lineWidth = 0.5; ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i=0;i<pts.length;i++){ const x=ox+pts[i][0]*s, y=oy+pts[i][1]*s;
    if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.closePath(); ctx.stroke();
}

// rendering loop (epicycles animates when on; otherwise static)
function render() {
  if (raf) cancelAnimationFrame(raf);
  const p = params();
  const harm = alphabet[current].slice(0, p.harm);
  els.probeCh.textContent = current;
  els.probeMeta.textContent = `${harm.length} harms · ${p.res} pts · f0=${SGFConfig.f0}`;

  const W = innerWidth, H = innerHeight;
  const cx = W/2, cy = H/2;
  const box = Math.min(W,H)*0.5*p.scale*0.9;

  const trace = glyphTrace(harm, p.res);
  ctx.clearRect(0,0,W,H);

  if (p.epi === 'on') {
    // animated epicycles, one revolution
    let t = 0;
    const step = performance.now()*p.speed;
    const run = () => {
      ctx.clearRect(0,0,W,H);
      // partial trace up to t
      const frac = Math.max(0, Math.min(1, p.res * ((performance.now()-start)/ (1000/p.speed))));
      drawTrace(trace.slice(0, Math.ceil(frac)), cx, cy, box, p.color, 1);
      // epicycles chain at current phase
      drawEpicyclesAt(harm, t, cx, cy, box, p.color);
      t = (t + p.speed*0.004) % 1;
      note2('');
      raf = requestAnimationFrame(run);
    };
    let start = performance.now();
    ctx.clearRect(0,0,W,H);
    const full = trace.slice();
    // draw full target faintly
    drawTrace(full, cx, cy, box, p.color, 0.12);
    raf = requestAnimationFrame(run);
  } else {
    drawTrace(trace, cx, cy, box, p.color, 1);
  }
}

function drawEpicyclesAt(harm, t, cx, cy, box, color) {
  // scale = box/0.85 / span (approx: reuse max amp sum)
  let span = 1e-9; for (const h of harm) span += Math.abs(h.amp);
  const s = box*0.8/ (span||1);
  ctx.strokeStyle = color; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.55;
  let px = cx, py = cy;
  for (const h of harm){
    const a = 2*Math.PI*h.k*t + h.phase;
    const vx = h.amp*Math.cos(a)*s, vy = h.amp*Math.sin(a)*s;
    ctx.beginPath(); ctx.arc(px,py,Math.hypot(vx,vy),0,2*Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+vx, py-vy); ctx.stroke();
    px += vx; py -= vy;
  }
  ctx.globalAlpha = 1;
}
function note2(){}

// controls
for (const el of ['harm','scale','speed','res','epicycles','color']) {
  els[el].addEventListener('input', () => { render(); saveMemory(); timeoutNote(); });
  els[el].addEventListener('change', () => saveMemory());
}
function timeoutNote(){ }

els.btnReset.addEventListener('click', () => {
  applyParams({harm:128, scale:1, speed:1, res:200, epi:'off', color:'#00FFFF'});
  render(); saveMemory();
});
els.probeCh.style.display = 'inline-block';

// verify: render at full harmonics for THIS letter, compare
els.btnVerify.addEventListener('click', () => {
  const p = params();
  const full = alphabet[current];            // reference truth
  const now = glyphTrace(full, p.res);
  const ref = glyphTrace(full, 400);
  // show ground truth faint + tuned overlaid
  const W=innerWidth,H=innerHeight, cx=W/2, cy=H/2, box=Math.min(W,H)*0.5*p.scale*0.9;
  ctx.clearRect(0,0,W,H);
  drawTrace(ref, cx, cy, box, '#ffffff', 0.15);
  drawTrace(now, cx, cy, box, p.color, 1);
  note(`verify vs full: ${now.length} pts rendered`);
});

// init
if (memory[current]) applyParams(memory[current]);
highlight();
render();