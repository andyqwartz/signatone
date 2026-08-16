// Central configuration for SGF Fourier steganography.
export const SGFConfig = {
  sampleRate: 48000,
  f0: 102,
  N: 32,
  blockMs: 90,
  markMs: 60,
  preMs: 60,
  gain: 0.2,
  // helpers
  harmonicFreq(k) { return k * this.f0; },
  blockSamples()  { return Math.ceil(this.blockMs/1000 * this.sampleRate); },
  markSamples()   { return Math.ceil(this.markMs /1000 * this.sampleRate); },
  preSamples()    { return Math.ceil(this.preMs  /1000 * this.sampleRate); },
};