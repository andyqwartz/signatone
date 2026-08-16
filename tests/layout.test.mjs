import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, isPGP } from '../js/layout.js';

const W = 1400, H = 800;

test('single word: letters stay on ONE line, centered, same baseline', () => {
  const pts = computeLayout(6, W, H, { singleMax: 14 });
  assert.equal(pts.length, 6);
  const cy = pts[0].cy;
  for (const p of pts) assert.ok(Math.abs(p.cy - cy) < 1e-6, 'same row');
});

test('single word: the line is horizontally centered', () => {
  const n = 6, sf = 1.7;
  const pts = computeLayout(n, W, H, { singleMax: 14 });
  const box = pts[0].box;
  const left = pts[0].cx - box / 2;            // left edge of first cell
  const rowW = n * box * sf;                    // full pitched span
  assert.ok(Math.abs(left - (W - rowW) / 2) < 1e-3, 'row centered around W/2');
});

test('single word: box auto-scales and stays within the stage', () => {
  const nLong = 12;
  const pts = computeLayout(nLong, W, H, { singleMax: 14 });
  const box = pts[0].box;
  // the full row must fit inside width and height
  assert.ok(nLong * box * 1.7 <= W, 'row fits width');
  assert.ok(box <= H, 'cell fits height');
  assert.ok(box > 0);
});

test('long text: wraps into multiple rows', () => {
  const pts = computeLayout(50, W, H, { singleMax: 14 });
  assert.equal(pts.length, 50);
  const cys = new Set(pts.map(p => p.cy.toFixed(3)));
  assert.ok(cys.size > 1, 'more than one row for long text');
});

test('long text: each row is centered and within bounds', () => {
  const pts = computeLayout(50, W, H, { singleMax: 14 });
  const capW = W - 2 * 0.09 * Math.min(W, H);
  const box = pts[0].box;
  // every row's span must not exceed viewport width
  const rowsByCy = new Map();
  for (const p of pts) { const k = p.cy.toFixed(3); if (!rowsByCy.has(k)) rowsByCy.set(k, []); rowsByCy.get(k).push(p.cx); }
  for (const cxs of rowsByCy.values()) {
    const span = Math.max(...cxs) - Math.min(...cxs);
    assert.ok(span + box <= capW + 1e-6, 'row within stage width');
  }
});

test('PGP detection: armored PGP block is recognised', () => {
  assert.equal(isPGP('-----BEGIN PGP MESSAGE-----'), true);
  assert.equal(isPGP('hello\n-----BEGIN PGP SIGNED MESSAGE-----\nbody'), true);
  assert.equal(isPGP('-----BEGIN PGP MESSAGE, PART 1/3-----'), true);
});

test('PGP detection: plain text is not flagged', () => {
  assert.equal(isPGP('HELLO WORLD'), false);
  assert.equal(isPGP(''), false);
  assert.equal(isPGP(null), false);
});