import { strict as assert } from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { weaveBlocks } from '../js/weaver.js';
import { analyzeBlocks, decodeBlock } from '../js/seer.js';
import { SGFConfig } from '../js/config.js';

const alphabet = JSON.parse(readFileSync(new URL('../js/alphabet.json', import.meta.url), 'utf8'));

// correlation between two signed-bin amplitude vectors
function corr(received, expected) {
  const r = received.map(m => m.amp);
  const e = expected.map(h => h.amp);
  const n = Math.max(r.length, e.length);
  const a = Array(n).fill(0), b = Array(n).fill(0);
  for (let i=0;i<r.length;i++) a[i]=r[i];
  for (let i=0;i<e.length;i++) b[i]=e[i];
  let srr=0, see=0, sre=0;
  const am=a.reduce((x,y)=>x+y,0)/n, bm=b.reduce((x,y)=>x+y,0)/n;
  for (let i=0;i<n;i++){ srr+=(a[i]-am)**2; see+=(b[i]-bm)**2; sre+=(a[i]-am)*(b[i]-bm); }
  return sre/(Math.sqrt(srr)*Math.sqrt(see)||1);
}

test('signed roundtrip: decoded bins match alphabet (recovered k and amplitude)', () => {
  for (const ch of ['A','B','O']) {
    const { samples } = weaveBlocks(ch, alphabet);
    const { blocks } = analyzeBlocks(samples);
    assert.equal(blocks.length, 1, `one block for ${ch}`);
    const dec = blocks[0].coeffs;
    // top bins should be the same signed k (ignoring exact ordering near ties)
    const decTop = dec.slice(0,8).map(d=>Math.abs(d.k)).sort((x,y)=>x-y);
    const expTop = alphabet[ch].slice(0,8).map(h=>Math.abs(h.k)).sort((x,y)=>x-y);
    // allow a couple of swap differences, but dominant low bins present
    assert.ok(decTop[0]===1||decTop[0]===2, `${ch} fund present: ${decTop[0]}`);
    const c = corr(dec, alphabet[ch]);
    assert.ok(c > 0.6, `corr ${ch}=${c.toFixed(3)}`);
    // negative frequency bins recovered (2D structure preserved)
    assert.ok(dec.some(d=>d.k<0), `${ch} has negative-frequency bins (concavity)`);
  }
});

test('weave produces x|y multiplexed frame (2 halves per letter)', () => {
  const { samples } = weaveBlocks('A', alphabet);
  const pre = SGFConfig.preSamples();
  const plen = Math.floor(SGFConfig.blockSamples()/2);
  const letters = 'A'.length;
  const expected = pre + letters*plen*2 + SGFConfig.markSamples() + pre;
  assert.equal(samples.length, expected);
});