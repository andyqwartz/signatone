// Central configuration for SGF Fourier steganography.
export const SGFConfig = {
  sampleRate: 48000,
  f0: 102,
  N: 128,        // full harmonic set (no truncation — kept for legibility)
  blockMs: 120,  // TEXT block duration (X|Y: half each)
  IMAGE_BLOCK_MS: 360,  // IMAGE headed: longer X|Y so all decodable harmonics stay resolvable in phase/amp
  markMs: 60,
  preMs: 60,
  gain: 0.2,
  // helpers
  harmonicFreq(k) { return k * this.f0; },
  blockSamples()  { return Math.ceil(this.blockMs/1000 * this.sampleRate); },
  markSamples()   { return Math.ceil(this.markMs /1000 * this.sampleRate); },
  preSamples()    { return Math.ceil(this.preMs  /1000 * this.sampleRate); },
};