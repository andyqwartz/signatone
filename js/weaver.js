// Composite mode, 2D-faithful: a complex closed curve has NO conjugate symmetry, so
// a real mono audio line cannot carry both ±k bins of a 2D path side-by-side.
// Fix (proven Fourier-Epicycles parity): each letter block is TIME-MULTIPLEXED into
// two Phase components — first the REAL part of the curve (x), then the IMAGINARY (y).
// Decoder reconstructs x and y, then z=x+iy => the full signed 2D spectrum is recovered
// and rendered exactly like the tuner.
// Frame per letter: [x-half | y-half] + mark tone.
// Message: [preamble][x|y block 1][mark][x|y block 2][mark]...[ending silence]

import { SGFConfig } from './config.js';

const markFreq = () => (SGFConfig.N + 3) * SGFConfig.f0;
const TARGET_PEAK = 0.8;

function partLen() { return SGFConfig.blockSamples() / 2; }

export function weaveBlocks(text, alphabet) {
  const pre = SGFConfig.preSamples();
  const plen = partLen();
  const markLen = SGFConfig.markSamples();
  const total = pre + text.length*(plen*2 + markLen) + pre;
  const samples = new Float32Array(total);
  const markers = [];
  let idx = 0;
  const put = (fn, len) => { for (let i=0;i<len;i++){ samples[idx]=fn(idx); idx++; } };

  // preamble: pure f0 phase-0 (absolute phase reference)
  put((n)=>{ const t=n/SGFConfig.sampleRate; return Math.sin(2*Math.PI*SGFConfig.f0*t)*0.8; }, pre);

  for (const c of text) {
    const harm = alphabet[c] || [];
    const startIdx = idx;
    // synthesize X (real part) and Y (imag) halves
    const xr = new Float32Array(plen);
    const yr = new Float32Array(plen);
    for (let i=0;i<plen;i++){
      const t=i/SGFConfig.sampleRate;
      let x=0, y=0;
      for (const h of harm){
        const a = 2*Math.PI*h.k*SGFConfig.f0*t + h.phase;
        x += h.amp*Math.cos(a);   // Re{ e^i(...) }
        y += h.amp*Math.sin(a);   // Im{ e^i(...) }
      }
      xr[i]=x; yr[i]=y;
    }
    // normalize both halves together to TARGET_PEAK (keeps relative shape)
    let peak = 1e-9;
    for (let i=0;i<plen;i++){ peak=Math.max(peak,Math.abs(xr[i]),Math.abs(yr[i])); }
    const norm = TARGET_PEAK/peak;
    for (let i=0;i<plen;i++){ samples[idx++]=xr[i]*norm; }
    for (let i=0;i<plen;i++){ samples[idx++]=yr[i]*norm; }
    markers.push(startIdx);
    // mark tone
    put((n)=>{ const t=n/SGFConfig.sampleRate; return Math.sin(2*Math.PI*markFreq()*t)*0.5; }, markLen);
  }

  return { samples: new Float32Array(samples), letters: [...text], markers };
}