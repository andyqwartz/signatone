import { strict as assert } from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { weaveBlocks } from '../js/weaver.js';
import { SGFConfig } from '../js/config.js';
import { goertzelBank } from '../js/goertzel.js';

const alphabet = JSON.parse(readFileSync(new URL('../js/alphabet.json', import.meta.url), 'utf8'));

function decodeBlock(samples, start) {
  const block = samples.subarray(start, start + SGFConfig.blockSamples());
  const freqs = Array.from({length: SGFConfig.N}, (_, i) => (i+1)*SGFConfig.f0);
  return goertzelBank(block, SGFConfig.sampleRate, freqs);
}

// correlation between two spectra (0..1) — measures the 1:1 spectral mapping
function corr(received, expected) {
  const r = received.map(m => m.magnitude);
  const e = expected.map(h => h.amp);
  const n = r.length;
  let sr=0, se=0, srr=0, see=0, sre=0;
  for (let i=0;i<n;i++){ sr+=r[i]; se+=e[i]; }
  const mr=sr/n, me=se/n;
  for (let i=0;i<n;i++){ srr+=(r[i]-mr)**2; see+=(e[i]-me)**2; sre+=(r[i]-mr)*(e[i]-me); }
  return sre / (Math.sqrt(srr)*Math.sqrt(see) || 1);
}

test('roundtrip spectrum correlates with expected glyph spectrum (1:1)', () => {
  for (const ch of ['A','B','O','X']) {
    const { samples } = weaveBlocks(ch, alphabet);
    const start = SGFConfig.preSamples();
    const received = decodeBlock(samples, start);
    const c = corr(received, alphabet[ch]);
    assert.ok(c > 0.75, `correlation for ${ch}: ${c.toFixed(3)}`);
  }
});

test('letters decode to distinct spectra (information preserved)', () => {
  const a = decodeBlock(weaveBlocks('A', alphabet).samples, SGFConfig.preSamples()).map(x=>x.magnitude);
  const b = decodeBlock(weaveBlocks('B', alphabet).samples, SGFConfig.preSamples()).map(x=>x.magnitude);
  // distinct letters should differ substantially in spectrum
  let diff=0; for (let i=0;i<a.length;i++) diff += Math.abs(a[i]-b[i]);
  assert.ok(diff > 1e-3, `A vs B spectral diff ${diff}`);
});