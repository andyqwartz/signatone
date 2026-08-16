import { strict as assert } from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { weaveBlocks } from '../js/weaver.js';
import { encodeWav } from '../js/wavEncoder.js';
import { analyzeBlocks } from '../js/seer.js';
import { SGFConfig } from '../js/config.js';

// Replicates the browser's Upload & See pipeline headlessly:
// weave -> WAV bytes -> (decodeWavToFloat32 equivalent) -> analyzeBlocks
function decodeWavToFloat32(buf) {
  const dv = new DataView(buf);
  let off = 12, dataStart = -1, dataLen = 0, bits=16, ch=1;
  const toStr = (o,l) => String.fromCharCode(...new Uint8Array(buf, o, l));
  while (off + 8 <= buf.byteLength) {
    const id = toStr(off,4), sz = dv.getUint32(off+4,true);
    if (id==='fmt '){ ch=dv.getUint16(off+10,true); bits=dv.getUint16(off+22,true); }
    else if (id==='data'){ dataStart=off+8; dataLen=sz; }
    off += 8+sz+(sz%2);
  }
  const n = dataLen/(bits/8*ch);
  const out = new Float32Array(n);
  for (let i=0;i<n;i++) out[i]=dv.getInt16(dataStart+i*2*ch,true)/32768;
  return out;
}

const alphabet = JSON.parse(readFileSync(new URL('../js/alphabet.json', import.meta.url),'utf8'));

test('full WAV file: weave->encode->decode->blocks (simulated Upload & See)', () => {
  const text='HI';
  const {samples} = weaveBlocks(text, alphabet);
  const wav = encodeWav(samples, SGFConfig.sampleRate);
  const decoded = decodeWavToFloat32(wav);
  const {blocks} = analyzeBlocks(decoded);
  assert.equal(blocks.length, 2, `expected 2 blocks for HI, got ${blocks.length}`);
  // each block has N harmonics
  blocks.forEach(b => assert.equal(b.coeffs.length, SGFConfig.N));
});