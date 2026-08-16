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