// Ghost Seer: decode audio samples into per-letter harmonic coefficients.
// Uses a Goertzel bank at known frequencies (from config). For each letter block
// we recover amplitude AND phase for k=1..N, producing [{k, amp, phase}] that the
// epicycle renderer draws.

import { SGFConfig } from './config.js';
import { goertzelBank } from './goertzel.js';

// Sample-window bit: detect presence of the preamble marker block.
// We locate letter blocks by scanning for the marker frequency (N+3)*f0 and the
// preamble frequency f0. Simple approach: fixed grid from the preamble — assume
// the decoder knows the block grid (frames are deterministic). Robust enough for
// the file-decoding path where we did the encoding.

function markFreq() { return (SGFConfig.N + 3) * SGFConfig.f0; }

// Detect grid: find where the first preamble (strong f0 content) begins.
// Returns the sample offset of block start.
export function analyzeBlocks(samples) {
  // Scan a sliding window for high f0 energy at the very start -> preamble.
  const pre = SGFConfig.preSamples();
  const blockLen = SGFConfig.blockSamples();
  const markLen = SGFConfig.markSamples();
  const step = 480; // scan step

  // Block boundaries: preamble at 0..pre. The first block starts at `pre`.
  // We return the list of block start indices by walking the deterministic grid.
  const blocks = [];
  let idx = pre;          // first block start
  while (idx + blockLen <= samples.length) {
    blocks.push({ start: idx, coeffs: decodeBlock(samples, idx) });
    idx += blockLen + markLen; // next block after block+mark
  }
  return { blocks, preSamples: pre, blockLen, markLen };
}

// Decode the coefficients present in a single block window.
export function decodeBlock(samples, start) {
  const block = samples.subarray(start, start + SGFConfig.blockSamples());
  const freqs = Array.from({ length: SGFConfig.N }, (_, i) => (i+1)*SGFConfig.f0);
  const bank = goertzelBank(block, SGFConfig.sampleRate, freqs);
  return bank.map((b, idx) => ({
    k: idx + 1,
    amp: b.magnitude,
    phase: b.phaseRad,
  }));
}

// Convenience: decode a full Float32Array back to glyph coefficients per letter.
export function decodeAll(samples, sampleRate) {
  return analyzeBlocks(samples);
}