// SIGNATONE worker — off-main-thread heavy DSP so the UI never freezes.
//   {type:'weave', text, opts}            -> {type:'weave', samples}
//   {type:'decode', buffer}               -> {type:'decode', blocks:[{coeffs}]}

import { weaveBlocks } from './weaver.js';
import { analyzeBlocks } from './seer.js';
import { decodeWavToFloat32 } from './wav.js';

let alphabet = null;
async function getAlphabet() {
  if (!alphabet) alphabet = await fetch('./alphabet.json').then(r => r.json());
  return alphabet;
}

self.onmessage = async (e) => {
  const { type } = e.data || {};
  try {
    if (type === 'weave') {
      const a = await getAlphabet();
      const { text, opts } = e.data;
      const { samples } = weaveBlocks(text, a, opts || {});
      self.postMessage({ type: 'weave', samples }, [samples.buffer]);
    } else if (type === 'decode') {
      const samples = decodeWavToFloat32(e.data.buffer);
      const { blocks } = analyzeBlocks(samples);
      self.postMessage({ type: 'decode', blocks });
    } else {
      throw new Error('unknown worker op: ' + type);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};