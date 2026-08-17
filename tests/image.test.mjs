import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceContours, composePath, resample, pathToCoeffs } from '../js/image.js';

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

import { maskFromImageData } from '../js/image.js';
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
