// Ghost Seer: decode samples into signed 2D harmonic coefficients.
// The weaver time-multiplexes each letter as [x half (Re) | y half (Im)]. We rebuild
// the complex curve z(t)=x(t)+i·y(t), then project onto each SIGNED bin k via the
// exact inverse correlation z(t)·e^{-i2πk·f·t} — recovering c_k = A_k·e^{iφ_k}
// (including negative frequencies), matching the bake exactly and rendering like the
// tuner (all 2D concavities preserved).

import { SGFConfig } from './config.js';

const maxK = () => Math.floor((SGFConfig.sampleRate/2 - 2000) / SGFConfig.f0);
function partLen() { return Math.floor(SGFConfig.blockSamples() / 2); }

export function analyzeBlocks(samples) {
  const pre = SGFConfig.preSamples();
  const plen = partLen();
  const markLen = SGFConfig.markSamples();
  const blocks = [];
  let idx = pre;
  while (idx + plen*2 <= samples.length) {
    blocks.push({ start: idx, coeffs: decodeBlock(samples, idx) });
    idx += plen*2 + markLen;
  }
  return { blocks, preSamples: pre, blockLen: plen*2, markLen };
}

// Decode one letter (x|y halves) to signed complex bins.
export function decodeBlock(samples, start) {
  const plen = partLen();
  const sr = SGFConfig.sampleRate;
  const x = samples.subarray(start, start + plen);
  const y = samples.subarray(start + plen, start + plen*2);
  const K = maxK();
  const coeffs = [];
  // project complex z(t) onto each signed integer bin
  for (let k = -K; k <= K; k++) {
    let cr = 0, ci = 0;
    for (let i = 0; i < plen; i++) {
      const t = i / sr;
      const ph = 2 * Math.PI * k * SGFConfig.f0 * t;
      const zr = x[i], zi = y[i];
      // z(t) * e^{-i·ph} = (zr+i·zi)(cos-ph + i·(-sin-ph))
      const er = Math.cos(ph), ei = -Math.sin(ph);
      cr += zr*er - zi*ei;
      ci += zr*ei + zi*er;
    }
    const amp = Math.sqrt(cr*cr + ci*ci) / plen;
    if (amp < 1e-9) continue;
    coeffs.push({ k, amp, phase: Math.atan2(ci, cr) });
  }
  // proven: sort by amplitude desc (dominant strokes first)
  coeffs.sort((a, b) => b.amp - a.amp);
  return coeffs;
}

export function decodeAll(samples) {
  return analyzeBlocks(samples);
}