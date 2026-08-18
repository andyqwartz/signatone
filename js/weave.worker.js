// SIGNATONE worker — off-main-thread heavy DSP so the UI never freezes.
//   {type:'weave', text, opts}            -> {type:'weave', samples}
//   {type:'decode', buffer}               -> {type:'decode', blocks:[{coeffs}]}

import { weaveBlocks } from './weaver.js?v=20260818a';
import { analyzeBlocks, detectKind } from './seer.js?v=20260818a';
import { decodeWavToFloat32 } from './wav.js?v=20260818a';
import { maskFromImageData, traceContours, composePath, resample, pathToCoeffs, photoContour, filterDecodable } from './image.js?v=20260818a';

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
      const { samples, noisy } = weaveBlocks(text, a, opts || {});
      // return the exact woven (noise-jittered) coefficient set per letter so the
      // encoder can display what was actually encoded — otherwise the encode view
      // shows the clean alphabet and the noise slider appears to do nothing.
      self.postMessage({ type: 'weave', samples, noisy }, [samples.buffer]);
    } else if (type === 'decode') {
      const samples = decodeWavToFloat32(e.data.buffer);
      const kind = detectKind(samples);
      const { blocks } = analyzeBlocks(samples);
      self.postMessage({ type: 'decode', kind, blocks });
    } else if (type === 'silhouette') {
      const { buffer, w, h, threshold, mode, mainOnly, maxHarms, sample } = e.data;
      const rgba = new Uint8ClampedArray(buffer);
      let path = null;
      // 1) edge-based path (proven Canny + nearest-neighbour) works for
      //    real photos; fall back to the alpha/luma region mask for clean silhouettes.
      const edge = photoContour(rgba, w, h, 0.16);
      const EDGE_MIN = 64;
      if (edge.length >= EDGE_MIN) {
        path = edge;
      } else {
        const { mask } = maskFromImageData(rgba, w, h, threshold == null ? 128 : threshold, mode || 'auto');
        let loops = traceContours(mask, w, h);
        if (!loops.length) throw new Error('no silhouette found');
        if (mainOnly) loops = [loops.sort((a, b) => b.length - a.length)[0]];
        path = composePath(loops);
      }
      // Resample to a power-of-2 for the radix-2 FFT.
      path = resample(path, nextPow2(Math.min(sample || 1024, 2048)));
      // FULL harmonic set for the RENDER (many harmonics → true contour, the
      // proven code's default). Keep the whole set so the contour is crisp.
      const coeffs = pathToCoeffs(path, maxHarms || 2048);
      // Decodable subset (|k| ≤ maxK) is what the audio can actually carry;
      // the render above uses the full set regardless.
      const decodable = filterDecodable(coeffs);
      self.postMessage({ type: 'silhouette', coeffs, decodable });
    } else {
      throw new Error('unknown worker op: ' + type);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};