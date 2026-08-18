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

import { SGFConfig } from './config.js';
import { fftSignedCoeffs } from './fft.js';

// Max decodable bin index for the current SGFConfig.
// The seer projects only k ∈ [-K, K]; bins beyond are lost on decode.
export function maxKDecode() {
  return Math.floor((SGFConfig.sampleRate / 2 - 2000) / SGFConfig.f0);
}

// Filter coeffs to only those within the decoder's range |k| ≤ K.
// Preserves amplitude-sorted desc order (just removes out-of-band bins).
export function filterDecodable(coeffs) {
  const K = maxKDecode();
  return coeffs.filter(c => Math.abs(c.k) <= K);
}


// 1) Binary mask from raw RGBA (ImageData). mode: 'auto' (use alpha only when
//    it varies), 'alpha' (force alpha), 'luma' (force luminance threshold).
export function maskFromImageData(data, w, h, threshold = 128, mode = 'auto') {
  const mask = new Uint8Array(w * h);
  let alphaVaries = false, a0 = -1;
  for (let i = 0; i < w * h; i++) { const a = data[i * 4 + 3]; if (a0 < 0) a0 = a; if (a !== a0) alphaVaries = true; }
  const useAlpha = mode === 'alpha' || (mode === 'auto' && alphaVaries);
  for (let i = 0; i < w * h; i++) {
    const px = i * 4;
    if (useAlpha) mask[i] = data[px + 3] > threshold ? 1 : 0;
    else { const lum = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2]; mask[i] = lum < threshold ? 1 : 0; }
  }
  return { mask };
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

// 5) Complex FFT of a path (z=x+iy), SIGNED bins, amp=|c|/N, phase=atan2, sorted
//    by amplitude desc. Matches Jezzamonn getFourierData / our alphabet format.
//    Radix-2 FFT (O(N log N)) — N must be a power of 2 (guaranteed by resample).
export function pathToCoeffs(path, maxHarms = 1024) {
  const N = path.length;
  if (!N) return [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { re[i] = path[i].x; im[i] = path[i].y; }
  const coeffs = fftSignedCoeffs(re, im);
  return coeffs.slice(0, Math.min(maxHarms, coeffs.length));
}

/* ------------------------------------------------------------------ */
/* 6) Edge-detection path for real photos (proven Fourier-Epicycles     */
/*    parity: GaussianBlur -> Canny-like -> nearest-neighbour ordering  */
/*    -> centring).  The alpha/luma *region* mask above is great for    */
/*    clean silhouettes but fails on photos (noise loops / zero loops). */
/* ------------------------------------------------------------------ */

// Luma plane from RGBA.
export function lumaPlane(data, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return out;
}

// Mean plane from RGBA — exact parity with the proven `fourier_visualization.py`
// which uses `np.average(img, axis=-1)` = arithmetic mean of the RGB channels.
export function meanPlane(data, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  return out;
}

// 3x3 separable-ish Gaussian blur (uniform kernel weights 1/2/1) on the luma plane.
export function gaussianBlur(plane, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const k = [1, 2, 1][dx + 1] * [1, 2, 1][dy + 1];
      s += plane[(y + dy) * w + (x + dx)] * k;
    }
    out[y * w + x] = s / 16;
  }
  return out;
}

// Sobel gradient magnitude (used by Canny-like edge detection).
export function sobelMagnitude(plane, w, h) {
  const g = new Float32Array(w * h);
  let maxg = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = (yy, xx) => plane[yy * w + xx];
    const gx = -p(y - 1, x - 1) - 2 * p(y, x - 1) - p(y + 1, x - 1) + p(y - 1, x + 1) + 2 * p(y, x + 1) + p(y + 1, x + 1);
    const gy = -p(y - 1, x - 1) - 2 * p(y - 1, x) - p(y - 1, x + 1) + p(y + 1, x - 1) + 2 * p(y + 1, x) + p(y + 1, x + 1);
    const m = Math.sqrt(gx * gx + gy * gy);
    g[y * w + x] = m; if (m > maxg) maxg = m;
  }
  return { g, maxg };
}

// Canny edge detection — faithful port of the proven `fourier_visualization.py`
// pipeline (Gaussian blur → Sobel magnitude+angle → non-max suppression →
// double threshold + hysteresis) using ABSOLUTE thresholds on the 0–255 luma
// plane, exactly as cv2.Canny(100, 200). The earlier code used RATIOS of the
// max gradient, which shifted the result per-image and missed/hit the wrong
// edges. Returns clean 1-px connected boundary pixels.
export function cannyEdges(plane, w, h, tLow = 100, tHigh = 200) {
  const b = gaussianBlur(plane, w, h);
  // Sobel gradient magnitude + direction (rounded to 4 compass angles)
  const mag = new Float32Array(w * h);
  const dir = new Int8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = (yy, xx) => b[yy * w + xx];
    const gx = -p(y-1,x-1) - 2*p(y,x-1) - p(y+1,x-1) + p(y-1,x+1) + 2*p(y,x+1) + p(y+1,x+1);
    const gy = -p(y-1,x-1) - 2*p(y-1,x) - p(y-1,x+1) + p(y+1,x-1) + 2*p(y+1,x) + p(y+1,x+1);
    const m = Math.sqrt(gx*gx + gy*gy); mag[y*w+x] = m;
    // angle in 4 bins: 0°(E-W), 45(SE-NW), 90(N-S), 135(SW-NE). Angle = atan2(gy,gx).
    const ang = Math.atan2(gy, gx) * 180 / Math.PI;           // [-180,180]
    const a = ((ang < -157.5 || ang >= 157.5) || (ang >= -22.5 && ang < 22.5)) ? 0
            : ((ang >= 22.5 && ang < 67.5) || (ang < -112.5 && ang >= -157.5)) ? 45
            : ((ang >= 67.5 && ang < 112.5) || (ang < -67.5 && ang >= -112.5)) ? 90
            : 135;
    dir[y*w+x] = a;
  }
  const nms = new Uint8Array(w * h);   // 0=suppressed 1=strong 2=weak
  const inb = (y, x) => y >= 0 && y < h && x >= 0 && x < w;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const m = mag[y*w+x];
    if (m < tLow) continue;
    let n1 = 0, n2 = 0;
    switch (dir[y*w+x]) {
      case 0:  n1 = mag[y*w+x-1] > m ? 1 : 0; n2 = mag[y*w+x+1] > m ? 1 : 0; break;
      case 45: n1 = mag[(y-1)*w+x+1] > m ? 1 : 0; n2 = mag[(y+1)*w+x-1] > m ? 1 : 0; break;
      case 90: n1 = mag[(y-1)*w+x] > m ? 1 : 0; n2 = mag[(y+1)*w+x] > m ? 1 : 0; break;
      case 135:n1 = mag[(y-1)*w+x-1] > m ? 1 : 0; n2 = mag[(y+1)*w+x+1] > m ? 1 : 0; break;
    }
    if (n1 || n2) continue;                       // not a local max → suppressed
    nms[y*w+x] = m >= tHigh ? 1 : 2;              // strong vs weak
  }
  // Hysteresis: keep weak pixels 8-connected to a strong pixel (flood fill).
  const out = new Uint8Array(w * h);
  const stack = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (nms[y*w+x] === 1) { out[y*w+x] = 1; stack.push(y*w+x); }
  while (stack.length) {
    const i = stack.pop(); const y = Math.floor(i / w), x = i % w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const yy = y + dy, xx = x + dx;
      if (!inb(yy, xx)) continue; const j = yy*w+xx;
      if (nms[j] === 2 && !out[j]) { out[j] = 1; stack.push(j); }
    }
  }
  const pts = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (out[y*w+x]) pts.push({ x, y });
  return pts;
}

// Edge pixel extraction: magnitude above `ratio` of the global max (Canny high-threshold step).
// Returns array of {x, y} image-coordinate edge pixels (y down).
export function strongEdges(g, w, h, ratio = 0.15) {
  const T = ratio * (g.maxg || 1);
  const pts = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++)
    if (g.g[y * w + x] >= T) pts.push({ x, y });
  return pts;
}

// Greedy nearest-neighbour ordering of edge pixels, accelerated with a
// spatial grid (cell = 8px) so lookup is O(N · cells) instead of O(N²).
// Splits into separate cycles when the nearest candidate jumps > 10px
// (exact Fourier-Epicycles `prepare_image` parity). Each cycle is one
// connected outline (outer boundary, interior holes, separate objects).
//   mainOnly=true  → return ONLY the longest cycle (the subject's outer
//                    outline). This is the proven `main_curve_only` default:
//                    concatenating every disconnected edge draws cross-image
//                    jump lines = the "gibberish" the user reported.
//   mainOnly=false → concatenate ALL cycles into one ordered polyline.
// Returns centred points (coords -= centroid, as in the proven code).
export function edgeToPath(pts, mainOnly = false) {
  if (!pts.length) return [];
  const CELL = 8;
  const grid = new Map();
  const kof = (x, y) => ((Math.floor(y / CELL) * 4096) + (Math.floor(x / CELL) + 2048)) >>> 0;
  for (let i = 0; i < pts.length; i++) {
    const k = kof(pts[i].x, pts[i].y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const used = new Uint8Array(pts.length);
  const cycles = [];
  for (let start = 0; start < pts.length; start++) {
    if (used[start]) continue;
    const cycle = [pts[start]];
    used[start] = 1;
    let cx = pts[start].x, cy = pts[start].y;
    for (;;) {
      let bi = -1, bd = Infinity;
      const gx = Math.floor(cx / CELL), gy = Math.floor(cy / CELL);
      for (let dy = -3; dy <= 3 && bi < 0; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const cell = grid.get((((gy + dy) * 4096) + (gx + dx + 2048)) >>> 0);
          if (!cell) continue;
          for (const idx of cell) {
            if (used[idx]) continue;
            const d = (pts[idx].x - cx) ** 2 + (pts[idx].y - cy) ** 2;
            if (d < bd) { bd = d; bi = idx; }
          }
        }
      }
      if (bi < 0) break;                       // exhausted this cycle
      if (Math.sqrt(bd) > 10) break;           // jump to another curve
      used[bi] = 1;
      cycle.push(pts[bi]);
      cx = pts[bi].x; cy = pts[bi].y;
    }
    if (cycle.length >= 3) cycles.push(cycle);
  }
  if (!cycles.length) return [];
  // main_curve_only: keep the longest cycle (single clean outline).
  let sel;
  if (mainOnly) {
    let best = null;
    for (const c of cycles) if (!best || c.length > best.length) best = c;
    sel = best;
  } else {
    sel = [];
    for (const c of cycles) for (const p of c) sel.push(p);
  }
  let sx = 0, sy = 0; for (const p of sel) { sx += p.x; sy += p.y; }
  const n = sel.length, cxm = sx / n, cym = sy / n;
  return sel.map(p => ({ x: p.x - cxm, y: p.y - cym }));
}

// Full photo silhouette: RGBA -> centred ordered edge polyline.
// Faithful port of `fourier_visualization.py`: mean-plane grayscale, Gaussian
// blur, Canny with ABSOLUTE thresholds, nearest-neighbour ordering. We ADAPT
// the threshold downward (halving) until we get a solid contour — the proven
// file just runs cleanly to a full outline, it never gives up / falls to mask.
//   mainOnly=true (default): keep the longest cycle → one true outline.
// Accepts a min point count (default 200) so dense edge sets stay ordered well.
export function photoContour(data, w, h, opts = {}) {
  let high = Math.max(40, Math.min(255, opts.threshold ?? 200));
  const mainOnly = opts.mainOnly ?? true;
  const minPts = opts.minPts ?? 200;
  const plane = meanPlane(data, w, h);
  let pts = [];
  for (let guard = 0; guard < 5; guard++) {
    const low = Math.max(20, Math.floor(high / 2));
    pts = cannyEdges(plane, w, h, low, high);
    if (pts.length >= minPts) break;
    high = Math.floor(high / 2);          // relax toward more edges (proven just runs)
  }
  if (pts.length > 2000) {                // cap the ordering cost
    const step = Math.ceil(pts.length / 2000);
    pts = pts.filter((_, i) => i % step === 0);
  }
  return edgeToPath(pts, mainOnly);
}