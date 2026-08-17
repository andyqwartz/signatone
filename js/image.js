// SIGNATONE image pipeline — client-side silhouette -> Fourier phasors.
//
// Imported/adapted from proven sources:
//   - resample:  Jezzamonn/fourier `resample2dData` (uniform arc resample to a
//     power of 2)  https://github.com/Jezzamonn/fourier
//   - contour:    marching-squares boundary (same idea as the skimage
//     find_contours used by tools/glyph_bake.py): a binary mask -> ordered
//     closed loops (outer + holes), concatenated into one path like
//     Fourier-Epicycles `prepare_image` does.
//   - DFT:        complex FFT of z=x+iy, SIGNED bins, amp=|c|/N, phase=atan2
//     (identical convention to Jezzamonn getFourierData / our alphabet).
//
// Everything here is pure and unit-tested in tests/image.test.mjs.

// 1) Binary mask from raw RGBA (ImageData). Prefers alpha when it carries real
//    silhouette info (varies); otherwise thresholds luminance.
export function maskFromImageData(data, w, h, threshold = 128) {
  const mask = new Uint8Array(w * h);
  let alphaVaries = false, a0 = -1, aN = -1;
  for (let i = 0; i < w * h; i++) { const a = data[i * 4 + 3]; if (a0 < 0) a0 = a; if (a !== a0) alphaVaries = true; aN = a; }
  for (let i = 0; i < w * h; i++) {
    const px = i * 4;
    if (alphaVaries) { mask[i] = data[px + 3] > threshold ? 1 : 0; }
    else { const lum = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2]; mask[i] = lum < threshold ? 1 : 0; }
  }
  return { mask, alphaVaries };
}

// 2) Marching squares: binary mask (row-major, value 0/1) -> array of closed
//    loops, each an array of {x, y} (image coordinates, y down), ordered.
export function traceContours(mask, w, h, level = 0.5) {
  // vertical[i][j] = edge between cell(i-1,j) top? We'll compute on demand via
  // unique midpoint ids for the two directions.
  // We build segments keyed by endpoint ids. Endpoint = an edge midpoint.
  const V = h - 1, H = w - 1;
  // id for a point on a horizontal edge between (r,c)-(r,c+1): key 'h:r:c'
  // id for a point on a vertical   edge between (r,c)-(r+1,c): key 'v:r:c'
  const segs = [];
  const midpoint = (kind, r, c) => kind === 'h' ? { x: c + 0.5, y: r } : { x: c, y: r + 0.5 };
  for (let r = 0; r < V; r++) {
    for (let c = 0; c < H; c++) {
      const tl = mask[r * w + c], tr = mask[r * w + c + 1];
      const bl = mask[(r + 1) * w + c], br = mask[(r + 1) * w + c + 1];
      const on = (m) => (m >= level ? 1 : 0);
      const T = on(tl), Rt = on(tr), B = on(br), L = on(bl);
      if (T === Rt && Rt === B && B === L) continue;   // solid empty or full cell
      // edges crossed where the two corners differ (isoline crosses those edges)
      const crossed = [];
      if (T !== Rt) crossed.push('t');
      if (Rt !== B) crossed.push('r');
      if (B !== L) crossed.push('b');
      if (L !== T) crossed.push('l');
      let a, b_;
      if (crossed.length >= 2) {
        a = crossed[0]; b_ = crossed[1];
        if (crossed.length === 4) b_ = 'b';   // saddle (rare): pick top-bottom consistently
      } else { continue; }
      const p1 = a === 't' ? midpoint('h', r, c) : a === 'b' ? midpoint('h', r + 1, c) : a === 'l' ? midpoint('v', r, c) : midpoint('v', r, c + 1);
      const p2 = b_ === 't' ? midpoint('h', r, c) : b_ === 'b' ? midpoint('h', r + 1, c) : b_ === 'l' ? midpoint('v', r, c) : midpoint('v', r, c + 1);
      // keys encode PHYSICAL edge positions so shared edges match between cells
      const k1 = a === 't' ? `h:${r}:${c}` : a === 'b' ? `h:${r + 1}:${c}` : a === 'l' ? `v:${r}:${c}` : `v:${r}:${c + 1}`;
      const k2 = b_ === 't' ? `h:${r}:${c}` : b_ === 'b' ? `h:${r + 1}:${c}` : b_ === 'l' ? `v:${r}:${c}` : `v:${r}:${c + 1}`;
      segs.push({ k1, k2, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
  }
  return chainSegments(segs);
}

// Chain un-directed segments into closed loops via endpooint adjacency.
function chainSegments(segs) {
  const adj = new Map(); // endpoint key -> [ {o:otherKey} ]
  const pt = new Map();  // endpoint key -> {x,y}
  const addEdge = (k1, k2, x1, y1, x2, y2) => {
    if (!pt.has(k1)) pt.set(k1, { x: x1, y: y1 });
    if (!pt.has(k2)) pt.set(k2, { x: x2, y: y2 });
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1).push({ o: k2 }); adj.get(k2).push({ o: k1 });
  };
  for (const s of segs) addEdge(s.k1, s.k2, s.x1, s.y1, s.x2, s.y2);

  const loops = [];
  const visited = new Set();
  for (const [startKey] of pt) {
    if (visited.has(startKey)) continue;
    const loop = [];
    let cur = startKey, prev = null;
    for (let guard = 0; guard < pt.size + 1 && cur && !visited.has(cur); guard++) {
      visited.add(cur);
      loop.push(pt.get(cur));
      const nbrs = adj.get(cur).map(e => e.o).filter(o => o !== prev);
      const next = nbrs.length ? nbrs[0] : null;
      prev = cur; cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// 3) Compose all loops into ONE ordered polyline (like Fourier-Epicycles
//    concatenation / our glyph_bake outer+holes): [outer, hole1, hole2...].
export function composePath(loops) {
  if (!loops.length) return [];
  // longest loop first = outer boundary
  const sorted = loops.slice().sort((a, b) => b.length - a.length);
  const all = [];
  for (const lp of sorted) for (const p of lp) all.push(p);
  return all;
}

// 4) Uniform arc-length resample to n points (n must be a power of 2) — port of
//    Jezzamonn/fourier resample2dData (positions along the polyline).
export function resample(path, n) {
  if (!path.length) return [];
  if (n < 2) n = 2;
  let accum = 0;
  const lens = [0];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x, dy = path[i].y - path[i - 1].y;
    accum += Math.sqrt(dx * dx + dy * dy);
    lens.push(accum);
  }
  const total = accum || 1;
  const out = [];
  // closed loop: wrap
  for (let m = 0; m < n; m++) {
    const target = total * (m / n);
    // find segment: lens[i-1] <= target <= lens[i] (with wrap)
    let i = 1;
    while (i < lens.length - 1 && lens[i] < target) i++;
    // clamp target into [lens[i-1], lens[i]]
    const prev = lens[i - 1], next = lens[i];
    const segLen = (next - prev) || 1;
    const t = Math.min(1, Math.max(0, (target - prev) / segLen));
    const a = path[i - 1], b = path[i % path.length];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

// 5) Complex DFT of a path (z=x+iy), SIGNED bins, amp=|c|/N, phase=atan2, sorted
//    by amplitude desc. Matches Jezzamonn getFourierData / our alphabet format.
//    (Naive O(N^2) — fine for N <= 2048 in a worker.)
export function pathToCoeffs(path, maxHarms = 1024) {
  const N = path.length;
  if (!N) return [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { re[i] = path[i].x; im[i] = path[i].y; }
  // signed bins: k in [-N/2 .. N/2)
  const coeffs = [];
  const half = N >> 1;
  for (let k = -half; k < half; k++) {
    let sr = 0, si = 0;
    for (let n = 0; n < N; n++) {
      const ang = -2 * Math.PI * k * n / N;
      const cr = Math.cos(ang), ci = Math.sin(ang);
      sr += re[n] * cr - im[n] * ci;
      si += re[n] * ci + im[n] * cr;
    }
    const amp = Math.sqrt(sr * sr + si * si) / N;
    if (amp < 1e-9) continue;
    coeffs.push({ k, amp, phase: Math.atan2(si, sr) });
  }
  coeffs.sort((a, b) => b.amp - a.amp);
  return coeffs.slice(0, Math.min(maxHarms, coeffs.length));
}