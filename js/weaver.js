import { SGFConfig } from './config.js';

const markFreq = () => (SGFConfig.N + 3) * SGFConfig.f0;
const TARGET_PEAK = 0.8;

// Composite mode: all harmonics of a letter summed simultaneously into one block.
// Message layout: [preamble phase-ref][block L1][mark][block L2][mark]...[ending silence]
// Each block is normalized to TARGET_PEAK so decoder reads RELATIVE amplitudes (preserves shape).
export function weaveBlock(harm, t) {
  let s = 0;
  for (const h of harm) s += h.amp*Math.sin(2*Math.PI*h.k*SGFConfig.f0*t + h.phase);
  return s;
}

export function weaveBlocks(text, alphabet) {
  const pre = SGFConfig.preSamples();
  const blockLen = SGFConfig.blockSamples();
  const markLen = SGFConfig.markSamples();
  const total = pre + text.length*(blockLen+markLen) + pre;
  const samples = new Float32Array(total);
  const markers = [];
  let idx = 0;

  const put = (fn, len) => { for (let i=0;i<len;i++){ samples[idx]=fn(idx); idx++; } };

  // preamble: pure f0 at phase 0 (absolute phase reference)
  put((n)=>{ const t=n/SGFConfig.sampleRate; return Math.sin(2*Math.PI*SGFConfig.f0*t)*0.8; }, pre);

  for (const c of text) {
    const harm = alphabet[c] || [];
    const startIdx = idx;
    // synthesize raw block into a temp buffer
    const raw = new Float32Array(blockLen);
    for (let i=0;i<blockLen;i++){
      const t=(idx - startIdx + 0)/SGFConfig.sampleRate;
      raw[i] = weaveBlock(harm, t);
      idx++;
    }
    // normalize to TARGET_PEAK (preserves relative amp ratios -> what decoder reads)
    let peak = 1e-9;
    for (let i=0;i<blockLen;i++) peak = Math.max(peak, Math.abs(raw[i]));
    const norm = TARGET_PEAK / peak;
    for (let i=0;i<blockLen;i++) samples[startIdx+i] = raw[i]*norm;
    markers.push(startIdx);
    // mark tone (out of harmonic set)
    put((n)=>{ const t=n/SGFConfig.sampleRate; return Math.sin(2*Math.PI*markFreq()*t)*0.5; }, markLen);
  }

  return { samples: new Float32Array(samples), letters: [...text], markers };
}