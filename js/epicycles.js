// Epicycle renderer — TRUE Fourier visualization. The phasor chain revolves in
// real time and its tip lays down the trace of the glyph. Not a pre-rendered blob.

// Coeffs: [{k, amp, phase}] with SIGNED integer k (see bake). t in [0,1).
export function epicyclePoint(coeffs, t) {
  let x = 0, y = 0;
  for (const h of coeffs) {
    const ang = 2*Math.PI*h.k*t + h.phase;
    x += h.amp * Math.cos(ang);
    y += h.amp * Math.sin(ang);
  }
  return { x, y };
}

// Precompute full normalized closed trace (res+1 pts).
// For large coeff sets (image glyphs, up to maxK bins), reduce resolution
// adaptively so the per-frame trace math stays cheap.
export function tracePoints(coeffs, res = 240) {
  if (coeffs.length > 100) res = Math.max(120, Math.min(res, 240 - Math.floor(coeffs.length / 8)));
  const pts = [];
  for (let i = 0; i <= res; i++) {
    const p = epicyclePoint(coeffs, i / res);
    pts.push([p.x, p.y]);
  }
  return pts;
}

// Uniform scale + offset mapping a trace onto a box centred at (cx,cy).
function transformOf(trace, cx, cy, box) {
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for (const [x,y] of trace){ if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; }
  const span = Math.max(maxx-minx, maxy-miny) || 1;
  const s = (box*0.85)/span;
  const ox = cx - (minx+maxx)/2*s;
  const oy = cy - (miny+maxy)/2*s;
  return { s, ox, oy };
}

// Draw the swept trace (message) up to fraction frac, hair-thin.
export function drawTraceFrac(ctx, trace, cx, cy, box, color, frac=1, lw=0.5) {
  drawTraceFracT(ctx, trace, transformOf(trace, cx, cy, box), color, frac, lw);
}

// Full faithful frame: rotating chain (live) + swept trace, both aligned.
//   t: revolution phase [0,1); frac: 0..1 how much of the letter is drawn.
//   opts: { lineWidth, glow (bool), glowColor, glowBlur, showChain (bool) }
export function drawEpicycleFrame(ctx, coeffs, trace, t, cx, cy, box, color, frac=1, opts={}) {
  // one shared transform so the chain tip lands exactly on the trace
  const tr = transformOf(trace, cx, cy, box);
  const lw = opts.lineWidth || 0.5;
  if (opts.glow && opts.glowBlur) {
    ctx.shadowColor = opts.glowColor || color;
    ctx.shadowBlur = opts.glowBlur;
  }
  drawTraceFracT(ctx, trace, tr, color, frac, lw);
  if (opts.showChain !== false) drawChainT(ctx, coeffs, t, tr, color, 0.25, lw);
  if (opts.glow) { ctx.shadowBlur = 0; }
}

function drawTraceFracT(ctx, trace, tr, color, frac=1, lw=0.5) {
  const { s, ox, oy } = tr;
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.globalAlpha = 1;
  const n = Math.max(2, Math.round(trace.length * Math.min(1, frac)));
  ctx.beginPath();
  for (let i=0;i<n;i++){
    const dx=ox+trace[i][0]*s, dy=oy+trace[i][1]*s;
    if (i===0) ctx.moveTo(dx,dy); else ctx.lineTo(dx,dy);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawChainT(ctx, coeffs, t, tr, color, alpha, lw=0.5) {
  const { s, ox, oy } = tr;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  ctx.globalAlpha = alpha;
  // chain origin is the trace box centre (ox,oy == centre + 0 offset since centre at box centre)
  // canvas y is DOWN, so +vy here so the chain tip lands exactly on the trace (trace uses oy + y*s)
  // Cap the drawn links at 128 — dominant harmonics only — so a full image glyph
  // (up to ~430 bins) doesn't draw 430 circles per frame (lag). The swept trace
  // below uses ALL coeffs, so the rendered image keeps full fidelity.
  const n = Math.min(coeffs.length, 128);
  let px = ox, py = oy;
  for (let i = 0; i < n; i++) {
    const h = coeffs[i];
    const a = 2*Math.PI*h.k*t + h.phase;
    const vx = h.amp*Math.cos(a)*s, vy = h.amp*Math.sin(a)*s;
    ctx.beginPath();
    ctx.arc(px, py, Math.hypot(vx, vy), 0, 2*Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px+vx, py+vy);
    ctx.stroke();
    px += vx; py += vy;
  }
  ctx.beginPath(); ctx.arc(px, py, 2, 0, 2*Math.PI); ctx.fill();
  ctx.globalAlpha = 1;
}