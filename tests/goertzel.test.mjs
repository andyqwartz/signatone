import { strict as assert } from 'node:assert/strict';
import { test } from 'node:test';
import { goertzel, goertzelBank } from '../js/goertzel.js';

function synth(freqs, durMs, sr=48000, amp=0.8, ph=0) {
  const n = Math.ceil(durMs/1000*sr);
  const frames = new Float32Array(n);
  for (let i=0;i<n;i++){
    let s=0; for (const f of freqs) s += amp*Math.sin(2*Math.PI*f*i/sr + ph);
    frames[i]=s;
  }
  return frames;
}

test('pure sine at f0 detected', () => {
  const frames = synth([102], 100, 48000);
  const r = goertzel(frames, 48000, 102);
  assert.ok(r.magnitude > 0.5, `mag ${r.magnitude}`);
});

test('multi-block: only 102 and 204 found above threshold', () => {
  const frames = synth([102, 204], 100, 48000);
  const bank = goertzelBank(frames, 48000, [102,204,306,408]);
  const found = bank.filter(b=>b.magnitude>0.3).map(b=>b.freq);
  assert.deepEqual(found, [102,204]);
});