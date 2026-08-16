import { strict as assert } from 'node:assert/strict';
import { test } from 'node:test';
import { weaveBlocks } from '../js/weaver.js';
import { SGFConfig } from '../js/config.js';
import { goertzel } from '../js/goertzel.js';

// mini alphabet: 'A' single harmonic (clean f0), 'B' f0 + 2f0
const alpha = {
  A: [{k:1, amp:0.5, phase:0.0}],
  B: [{k:1, amp:0.4, phase:0.1},{k:2, amp:0.3, phase:Math.PI/2}],
};

test('weave "A" yields preamble+block+mark total length', () => {
  const { samples } = weaveBlocks('A', alpha);
  const total = SGFConfig.preSamples() + (SGFConfig.blockSamples()+SGFConfig.markSamples()) + SGFConfig.preSamples();
  assert.equal(samples.length, total);
});

test('decoder detects f0 in first letter block', () => {
  const { samples, markers } = weaveBlocks('A', alpha);
  const start = SGFConfig.preSamples();
  const block = samples.subarray(start, start + SGFConfig.blockSamples());
  const r = goertzel(block, SGFConfig.sampleRate, SGFConfig.f0);
  assert.ok(r.magnitude > 0.1, `f0 mag ${r.magnitude}`);
  assert.equal(markers.length, 1);
});

test('decoder detects f0 AND 2f0 in "B" block', () => {
  const { samples } = weaveBlocks('B', alpha);
  const start = SGFConfig.preSamples();
  const block = samples.subarray(start, start + SGFConfig.blockSamples());
  const m1 = goertzel(block, SGFConfig.sampleRate, SGFConfig.f0);
  const m2 = goertzel(block, SGFConfig.sampleRate, 2*SGFConfig.f0);
  assert.ok(m1.magnitude > 0.2, `f0 ${m1.magnitude}`);
  assert.ok(m2.magnitude > 0.2, `2f0 ${m2.magnitude}`);
});

test('noise option: same letter+seed reproducible, different seed differs', () => {
  const a1 = weaveBlocks('A', alpha, { harmonics:1, noise:0.1, seed:1 });
  const a2 = weaveBlocks('A', alpha, { harmonics:1, noise:0.1, seed:1 });
  const a3 = weaveBlocks('A', alpha, { harmonics:1, noise:0.1, seed:2 });
  // same seed → identical
  assert.deepEqual([...a1.samples], [...a2.samples]);
  // different seed → different signal
  let d = 0; for (let i=0;i<a1.samples.length;i++) d += Math.abs(a1.samples[i]-a3.samples[i]);
  assert.ok(d > 0, 'different seed differs');
});

test('noise option: each identical letter gets DIFFERENT noise amplitude', () => {
  const base = weaveBlocks('AA', alpha, { harmonics:1, noise:0.2, seed:99 });
  // both halves of letter-1 vs letter-2 differ beyond the letter content (identical letters
  // would otherwise be bit-identical), so per-letter noise must make them distinct
  const pre=SGFConfig.preSamples(), plen=SGFConfig.blockSamples()/2;
  const A1 = base.samples.subarray(pre, pre+plen).reduce((a,b)=>a+Math.abs(b),0);
  const A2 = base.samples.subarray(pre+plen, pre+plen*2).reduce((a,b)=>a+Math.abs(b),0);
  const B1 = base.samples.subarray(pre+plen*2+SGFConfig.markSamples(), pre+plen*2+SGFConfig.markSamples()+plen).reduce((a,b)=>a+Math.abs(b),0);
  assert.ok(Math.abs(A1-B1) > 1e-6 || Math.abs(A2-B1) > 1e-6, 'per-letter noise yields distinct letters');
});