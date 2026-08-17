import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskFromImageData, traceContours, composePath, resample, pathToCoeffs, photoContour, strongEdges, sobelMagnitude, gaussianBlur, edgeToPath, filterDecodable, maxKDecode } from '../js/image.js';
import { SGFConfig } from '../js/config.js';
import { weaveBlocks } from '../js/weaver.js';
import { detectKind, analyzeBlocks } from '../js/seer.js';

// a square block: rows 2..13, cols 2..13 on a 16x16 grid
function squareMask() {
  const w = 16, h = 16;
  const mask = new Uint8Array(w * h);
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++)
    mask[r * w + c] = (r >= 2 && r <= 13 && c >= 2 && c <= 13) ? 1 : 0;
  return { mask, w, h };
}

test('traceContours yields at least one closed loop for a square', () => {
  const { mask, w, h } = squareMask();
  const loops = traceContours(mask, w, h);
  assert.ok(loops.length >= 1, 'has a loop');
  for (const lp of loops) {
    assert.ok(lp.length >= 3);
    // loops are ordered and bounded by the square +1
    for (const p of lp) {
      assert.ok(p.x >= 0.5 && p.x <= 14.5, 'x within grid');
      assert.ok(p.y >= 0.5 && p.y <= 14.5, 'y within grid');
    }
  }
});

test('composed square path has square bbox and centroid', () => {
  const { mask, w, h } = squareMask();
  const path = composePath(traceContours(mask, w, h));
  assert.ok(path.length >= 40);
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, sx = 0, sy = 0;
  for (const p of path) {
    mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x);
    mny = Math.min(mny, p.y); mxy = Math.max(mxy, p.y); sx += p.x; sy += p.y;
  }
  assert.ok(Math.abs((mxx - mnx) - 12) < 1.6, `width ~12 (got ${mxx - mnx})`);
  assert.ok(Math.abs((mxy - mny) - 12) < 1.6, `height ~12`);
  assert.ok(Math.abs(sx / path.length - 7.5) < 1, `centroid x ~7.5`);
  assert.ok(Math.abs(sy / path.length - 7.5) < 1, `centroid y ~7.5`);
});

test('resample returns exactly n points inside the square', () => {
  const { mask, w, h } = squareMask();
  const path = composePath(traceContours(mask, w, h));
  const n = 128;
  const rs = resample(path, n);
  assert.equal(rs.length, n);
  for (const p of rs) { assert.ok(p.x >= 0.5 && p.x <= 14.5); assert.ok(p.y >= 0.5 && p.y <= 14.5); }
});

test('DFT roundtrip: coeffs reconstruct the resampled path closely', () => {
  const { mask, w, h } = squareMask();
  const path = composePath(traceContours(mask, w, h));
  const N = 128;
  const pts = resample(path, N);
  const coeffs = pathToCoeffs(pts, N);
  assert.ok(coeffs.length > 0);
  // signed bins present (negative k) — like our alphabet
  const hasNeg = coeffs.some(c => c.k < 0), hasPos = coeffs.some(c => c.k > 0);
  assert.ok(hasNeg && hasPos, 'signed bins ±k');
  // amplitude-sorted desc
  for (let i = 1; i < coeffs.length; i++) assert.ok(coeffs[i].amp <= coeffs[i - 1].amp + 1e-12);
  // reconstruct at each resampled time; compare to original pt
  const recon = (t) => {
    let x = 0, y = 0;
    for (const c of coeffs) {
      const ang = 2 * Math.PI * c.k * t + c.phase;
      x += c.amp * Math.cos(ang);
      y += c.amp * Math.sin(ang);
    }
    return { x, y };
  };
  let maxErr = 0;
  for (let i = 0; i < N; i++) {
    const p = recon(i / N), q = pts[i];
    maxErr = Math.max(maxErr, Math.hypot(p.x - q.x, p.y - q.y));
  }
  // naive DFT with all significant bins reconstructs almost exactly
  assert.ok(maxErr < 1e-6, `roundtrip error ${maxErr} < 1e-6`);
});

test('maskFromImageData: alpha + luma', () => {
  const w = 3, h = 1; const data = new Uint8ClampedArray(w * h * 4);
  data[0]=0; data[1]=0; data[2]=0; data[3]=255;
  data[4]=10; data[5]=20; data[6]=30; data[7]=0;
  data[8]=128; data[9]=128; data[10]=128; data[11]=255;
  const a = maskFromImageData(data, w, h, 128, 'alpha');
  assert.deepEqual([...a.mask], [1, 0, 1]);
  const l = maskFromImageData(data, w, h, 100, 'luma');
  assert.deepEqual([...l.mask], [1, 1, 0]);
});

// a realistic "photo": bright disc with interior shading + soft gradient bg
// (NOT a clean binary silhouette) — edge-based path must yield one big contour.
function photoRgba(w = 64, h = 64) {
  const data = new Uint8ClampedArray(w * h * 4);
  const cx = w / 2, cy = h / 2, r = w * 0.3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    const bg = 180 + 40 * Math.sin(x / 8);
    let v;
    if (d < r) { const edge = Math.max(0, Math.min(1, r - d)); v = 80 + 100 * edge + 30 * Math.sin(d / 3); }
    else v = bg;
    const i = (y * w + x) * 4; data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  }
  return data;
}
test('photoContour finds a large ordered edge contour on a photo-like image', () => {
  const w = 64, h = 64;
  const data = photoRgba(w, h);
  const path = photoContour(data, w, h, 0.15);
  assert.ok(path.length >= 100, `edge path has >=100 pts (got ${path.length})`);
  // ordered: consecutive jumps stay small (nearest-neighbour, closed loop)
  const n = path.length;
  let bi = 0;
  for (let i = 1; i < n; i++) { const dx = path[i].x - path[i - 1].x, dy = path[i].y - path[i - 1].y; if (Math.hypot(dx, dy) > 10) bi++; }
  // allow a couple of boundary splits but not chaos
  assert.ok(bi < n * 0.1, `few big jumps (${bi})`);
  // centred: centroid ~0
  let sx = 0, sy = 0; for (const p of path) { sx += p.x; sy += p.y; }
  assert.ok(Math.abs(sx / n) < 4 && Math.abs(sy / n) < 4, 'centred');
});

test('maxKDecode matches the seer decode range formula', () => {
  const K = maxKDecode();
  assert.ok(K > 0, 'positive maxK');
  const sr = SGFConfig.sampleRate, f0 = SGFConfig.f0;
  const expected = Math.floor((sr / 2 - 2000) / f0);
  assert.equal(K, expected);
  assert.equal(K, 215, 'at sr=48000 f0=102, maxK is 215');
});

test('filterDecodable removes bins outside decoder range', () => {
  const K = maxKDecode();
  const coeffs = [
    { k: 0, amp: 1.0, phase: 0 },
    { k: K + 10, amp: 0.8, phase: 0 },   // out of band — removed
    { k: -K, amp: 0.5, phase: 0 },
    { k: K, amp: 0.5, phase: 0 },
    { k: -K - 5, amp: 0.3, phase: 0 },   // out of band — removed
  ];
  const filtered = filterDecodable(coeffs);
  assert.equal(filtered.length, 3, 'only 3 decodable bins remain');
  for (const c of filtered) assert.ok(Math.abs(c.k) <= K, `|k|=${c.k} ≤ K`);
  // amplitude-sorted desc preserved
  for (let i = 1; i < filtered.length; i++) assert.ok(filtered[i].amp <= filtered[i - 1].amp + 1e-12);
});

test('photoContour stays fast + ordered on a dense 256x256 photo', () => {
  const w = 256, h = 256;
  const data = photoRgba(w, h);
  const t0 = Date.now();
  const path = photoContour(data, w, h, 0.15);
  const ms = Date.now() - t0;
  assert.ok(path.length >= 100, `has contour (${path.length} pts)`);
  assert.ok(ms < 3000, `photoContour < 3s (${ms}ms)`);
  // ordered: few big jumps (single main contour selected)
  let big = 0;
  for (let i = 1; i < path.length; i++) {
    if (Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y) > 10) big++;
  }
  assert.ok(big < path.length * 0.05, `few big jumps (${big})`);
});

test('image silhouette roundtrip: contour→FFT→filter→weave→detect→decode coeffs match', () => {
  const w = 32, h = 32;
  const data = photoRgba(w, h);
  const path = photoContour(data, w, h, 0.15);
  assert.ok(path.length >= 50, 'photo contour found');
  const N = 128;                       // power of 2
  const rs = resample(path, N);
  const coeffs = pathToCoeffs(rs, 64); // FFT path
  const filtered = filterDecodable(coeffs);
  assert.ok(filtered.length > 0, 'decodable coefficients');
  assert.ok(filtered.every(c => Math.abs(c.k) <= maxKDecode()), 'all |k| ≤ maxK');

  // weave as an image (preImage preamble → detectKind='image')
  const key = '\u0001';
  const alphabet = { [key]: filtered };
  const { samples } = weaveBlocks(key, alphabet, { harmonics: filtered.length, noise: 0, seed: 0, preImage: true });
  assert.equal(detectKind(samples), 'image', 'detected as image');

  // decode
  const { blocks } = analyzeBlocks(samples);
  assert.equal(blocks.length, 1, 'one block decoded');
  const decoded = blocks[0].coeffs;
  assert.ok(decoded.length > 0, 'decoded coeffs');
  // Compare SHAPE, not absolute scale: the weave normalises both halves to a
  // 0.8 peak, so absolute amps differ. Normalise each set by its own max and
  // check the top harmonics (k) and their relative strengths are preserved.
  const norm = arr => { const m = Math.max(...arr.map(c => c.amp)); return arr.map(c => ({ ...c, amp: c.amp / m })); };
  const a = norm(filtered), b = norm(decoded);
  const topA = a.slice(0, 10), topB = b.slice(0, 10);
  // every dominant k from the original appears in the decoded top set
  for (const c of topA) {
    assert.ok(topB.some(d => d.k === c.k), `decoded has dominant k=${c.k}`);
  }
  // relative amplitude of the decoded dominant ≈ 1
  assert.ok(Math.abs(b[0].amp - 1) < 0.05, 'decoded dominant is normalised ≈1');
});
