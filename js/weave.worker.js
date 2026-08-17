// SIGNATONE worker — off-main-thread heavy DSP so the UI never freezes.
//   {type:'weave', text, opts}            -> {type:'weave', samples}
//   {type:'decode', buffer}               -> {type:'decode', blocks:[{coeffs}]}

import { weaveBlocks } from './weaver.js';
import { analyzeBlocks } from './seer.js';
import { decodeWavToFloat32 } from './wav.js';
import { maskFromImageData, traceContours, composePath, resample, pathToCoeffs } from './image.js';

let alphabet = null;
function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }
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
    } else if (type === 'silhouette') {
      const { buffer, w, h, threshold, mode, mainOnly, maxHarms, sample } = e.data;
      const rgba = new Uint8ClampedArray(buffer);
      const { mask } = maskFromImageData(rgba, w, h, threshold == null ? 128 : threshold, mode || 'auto');
      let loops = traceContours(mask, w, h);
      if (!loops.length) throw new Error('no silhouette found');
      if (mainOnly) loops = [loops.sort((a, b) => b.length - a.length)[0]];
      const path = composePath(loops);
      const N = nextPow2(Math.min(sample || 1024, 2048));
      const pts = resample(path, N);
      const coeffs = pathToCoeffs(pts, maxHarms || 1024);
      self.postMessage({ type: 'silhouette', coeffs });
    } else {
      throw new Error('unknown worker op: ' + type);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};