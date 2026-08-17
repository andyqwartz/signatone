import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectKind } from '../js/seer.js';
import { SGFConfig } from '../js/config.js';
import { weaveBlocks } from '../js/weaver.js';

const sr = SGFConfig.sampleRate;
const pre = SGFConfig.preSamples();

// a tiny "glyph" (a single sine block) to weave
const mini = [{ k: 1, amp: 0.5, phase: 0 }];
const alphabet = { A: mini };

function samplesFor(preFreq) {
  const n = pre + 20; // just a preamble + a bit
  const s = new Float32Array(n);
  for (let i = 0; i < pre; i++) {
    const t = i / sr;
    s[i] = Math.sin(2 * Math.PI * preFreq * t) * 0.8;
  }
  return s;
}

test('detectKind: f0 preamble = text', () => {
  assert.equal(detectKind(samplesFor(SGFConfig.f0)), 'text');
});
test('detectKind: markFreq preamble = image', () => {
  const markFreq = (SGFConfig.N + 3) * SGFConfig.f0;
  assert.equal(detectKind(samplesFor(markFreq)), 'image');
});
test('detectKind via weaveBlocks: text (default) vs image (preImage)', () => {
  const textW = weaveBlocks('A', alphabet, {}).samples;
  assert.equal(detectKind(textW), 'text');
  const imgW = weaveBlocks('A', alphabet, { preImage: true }).samples;
  assert.equal(detectKind(imgW), 'image');
});
