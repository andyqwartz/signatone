// Epicycle renderer. Draws a chain of rotating phasors (Fourier epicycles)
// whose vector sum traces the glyph. Pure canvas, hair-thin strokes.

// Coefficients: [{k, amp, phase}, ...].
// t: time in [0,1). Returns relative tip (pre-scale/pre-translate).
export function epicyclePoint(coeffs, t) {
  let x = 0, y = 0;
  for (const h of coeffs) {
    const ang = 2*Math.PI*h.k*t + h.phase;
    x += h.amp * Math.cos(ang);
    y += h.amp * Math.sin(ang);
  }
  return { x, y };
}

// Compute full closed trace (res+1 points) for one glyph.
export function tracePoints(coeffs, res = 240) {
  const pts = [];
  for (let i = 0; i <= res; i++) pts.push(epicyclePoint(coeffs, i/res));
  return pts;
}

// Scale: max harmonic-amplitude sum -> fit canvas.
export function fitScale(coeffs, radius) {
  let sum = 1e-9;
  for (const h of coeffs) sum += h.amp;
  return (radius || 200) * 0.55 / sum; // leave headroom
}

// Draw the epicycle chain at time t (circles + radius arms + tip).
export function drawEpicycles(ctx, coeffs, t, cx, cy, scale, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.5;
  // precompute rotating vectors
  const vecs = [];
  for (const h of coeffs) {
    const a = 2*Math.PI*h.k*t + h.phase;
    vecs.push({ x: h.amp*Math.cos(a), y: h.amp*Math.sin(a) });
  }
  let px = cx, py = cy;
  for (let i=0;i<vecs.length;i++){
    const endx = px + vecs[i].x*scale;
    const endy = py - vecs[i].y*scale;
    // guide circle
    ctx.beginPath();
    ctx.arc(px, py, Math.hypot(vecs[i].x, vecs[i].y)*scale, 0, 2*Math.PI);
    ctx.stroke();
    // radius arm
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(endx, endy);
    ctx.stroke();
    px = endx; py = endy;
  }
  // tip
  ctx.beginPath();
  ctx.arc(px, py, 2, 0, 2*Math.PI);
  ctx.fill();
  return { x: px, y: py };
}

// Draw the fully-traced glyph (closed loop) as a hairline stroke.
export function drawClosedGlyph(ctx, coeffs, cx, cy, scale, color, tStart=0, tEnd=1, res=240) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  const n = Math.max(2, Math.round(res*(tEnd-tStart)));
  for (let i=0;i<=n;i++){
    const t = tStart + (tEnd-tStart)*i/n;
    const p = epicyclePoint(coeffs, t);
    const dx = cx + p.x*scale, dy = cy - p.y*scale;
    if (i===0) ctx.moveTo(dx,dy); else ctx.lineTo(dx,dy);
  }
  ctx.closePath();
  ctx.stroke();
}