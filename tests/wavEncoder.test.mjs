import { strict as assert } from 'node:assert/strict';
import { test } from 'node:test';
import { encodeWav } from '../js/wavEncoder.js';

test('single sine -> valid RIFF header', () => {
  const sr = 48000; const n = 48000; // 1s
  const frames = new Float32Array(n).fill(0.5);
  const buf = encodeWav(frames, sr);
  const dv = new DataView(buf);
  assert.equal(String.fromCharCode(...new Uint8Array(buf,0,4)), 'RIFF');
  assert.equal(dv.getUint32(4,true), buf.byteLength-8);
  assert.equal(String.fromCharCode(...new Uint8Array(buf,8,4)), 'WAVE');
  assert.equal(dv.getUint16(22, true), 1); // mono
  assert.equal(dv.getUint32(24, true), sr); // sample rate
  assert.equal(dv.getUint16(34, true), 16); // bits per sample
  assert.equal((buf.byteLength-44)/2, n); // samples
});