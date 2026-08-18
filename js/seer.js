// Ghost Seer: decode samples into signed 2D harmonic coefficients.
// The weaver time-multiplexes each letter as [x half (Re) | y half (Im)]. We rebuild
// the complex curve z(t)=x(t)+i·y(t), then project onto each SIGNED bin k via the
// exact inverse correlation z(t)·e^{-i2πk·f·t} — recovering c_k = A_k·e^{iφ_k}
// (including negative frequencies), matching the bake exactly and rendering like the
// tuner (all 2D concavities preserved).

import { SGFConfig } from './config.js';

const maxK = () => Math.floor((SGFConfig.sampleRate/2 - 2000) / SGFConfig.f0);
function partLen(blockMs = SGFConfig.blockMs) { return Math.floor(blockMs / 1000 * SGFConfig.sampleRate / 2); }
function markFreq() { return (SGFConfig.N + 3) * SGFConfig.f0; }

// Classify the signal preamble: text sends a pure f0 tone, an image sends a
// markFreq tone. Correlation over the preamble window decides the kind.
export function detectKind(samples) {
  const pre = SGFConfig.preSamples();
  const n = Math.min(pre, samples.length);
  if (n < 8) return 'text';
  let e0 = 0, eM = 0;
  const sr = SGFConfig.sampleRate;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    e0 += samples[i] * Math.sin(2 * Math.PI * SGFConfig.f0 * t);
    eM += samples[i] * Math.sin(2 * Math.PI * markFreq() * t);
  }
  return eM > e0 ? 'image' : 'text';
}

export function analyzeBlocks(samples, blockMs = SGFConfig.blockMs) {
  const pre = SGFConfig.preSamples();
  const plen = partLen(blockMs);
  const markLen = SGFConfig.markSamples();
  const blocks = [];
  let idx = pre;
  while (idx + plen*2 <= samples.length) {
    blocks.push({ start: idx, coeffs: decodeBlock(samples, idx, blockMs) });
    idx += plen*2 + markLen;
  }
  return { blocks, preSamples: pre, blockLen: plen*2, markLen };
}

// Decode one letter (x|y halves) to signed complex bins.
export function decodeBlock(samples, start, blockMs = SGFConfig.blockMs) {
  const plen = partLen(blockMs);
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