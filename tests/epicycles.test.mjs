import { strict as assert } from 'node:assert/strict';
import { test } from 'node:test';
import { epicyclePoint, tracePoints, fitScale } from '../js/epicycles.js';

const coeffs = [
  {k:1, amp:0.684, phase:0.0},
  {k:2, amp:0.170, phase:0.3},
  {k:3, amp:0.130, phase:-1.0},
];

test('epicyclePoint is finite and closes the loop', () => {
  const p0 = epicyclePoint(coeffs, 0);
  const p1 = epicyclePoint(coeffs, 1); // 1 ≡ 0 for integer k
  assert.ok(Number.isFinite(p0.x) && Number.isFinite(p0.y));
  assert.ok(Math.abs(p0.x - p1.x) < 1e-9 && Math.abs(p0.y - p1.y) < 1e-9);
});

test('tracePoints produces res+1 points', () => {
  const pts = tracePoints(coeffs, 100);
  assert.equal(pts.length, 101);
});

test('fitScale positive and finite', () => {
  const s = fitScale(coeffs, 200);
  assert.ok(Number.isFinite(s) && s > 0);
});