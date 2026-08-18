// SIGNATONE worker — off-main-thread heavy DSP so the UI never freezes.
//   {type:'weave', text, opts}            -> {type:'weave', samples}
//   {type:'decode', buffer}               -> {type:'decode', blocks:[{coeffs}]}

import { SGFConfig } from './config.js?v=20260818f';
import { weaveBlocks } from './weaver.js?v=20260818f';
import { analyzeBlocks, detectKind } from './seer.js?v=20260818f';
import { decodeWavToFloat32 } from './wav.js?v=20260818f';
import { maskFromImageData, traceContours, composePath, resample, pathToCoeffs, photoContour, filterDecodable } from './image.js?v=20260818f';

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
      // Image weaves use a LONGER block so all decodable harmonics resolve in
      // phase/amp; the seer must decode with the SAME blockMs. Text stays 120ms.
      const blockMs = kind === 'image' ? SGFConfig.IMAGE_BLOCK_MS : SGFConfig.blockMs;
      const { blocks } = analyzeBlocks(samples, blockMs);
      self.postMessage({ type: 'decode', kind, blocks, blockMs });
    } else if (type === 'silhouette') {
      const { buffer, w, h, threshold, mode, mainOnly, maxHarms, sample } = e.data;
      const rgba = new Uint8ClampedArray(buffer);
      const th = threshold == null ? 128 : threshold;
      const mo = mode || 'auto';
      let path = null;
      // 1) Explicit source (alpha / luma) → the region-mask path, which is the
      //    only one that reads alpha. Canny (luma edge) would ignore the user's
      //    chosen source, so we go straight to the mask.
      // 2) 'auto' → for real photos try Canny edge path first (proven
      //    Fourier-Epicycles), and fall back to the auto alpha/luma mask for
      //    clean silhouettes / transparent PNGs.
      if (mo !== 'auto') {
        // Explicit alpha/luma: region-mask path (the only one that reads alpha).
        const { mask } = maskFromImageData(rgba, w, h, th, mo);
        let loops = traceContours(mask, w, h);
        if (!loops.length) throw new Error('no silhouette found');
        if (mainOnly) loops = [loops.sort((a, b) => b.length - a.length)[0]];
        path = composePath(loops);
      } else {
        // auto → proven Canny edge path (adaptive thresholds, never swallows a
        // real photo); fall back to the auto mask ONLY if the edge path yields
        // nothing usable (e.g. a clean transparent logo).
        path = photoContour(rgba, w, h, { threshold: th, mainOnly: !!mainOnly });
        if (!path.length) {
          const { mask } = maskFromImageData(rgba, w, h, th, 'auto');
          let loops = traceContours(mask, w, h);
          if (!loops.length) throw new Error('no silhouette found');
          if (mainOnly) loops = [loops.sort((a, b) => b.length - a.length)[0]];
          path = composePath(loops);
        }
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