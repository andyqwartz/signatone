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

function partLen(blockMs = SGFConfig.blockMs) { return Math.floor(blockMs / 1000 * SGFConfig.sampleRate / 2); }

// Deterministic amp + phase jitter for a coefficient set. Given the same
// (coeffs, noiseMax, seed) it always returns the same result — so the encoder
// view (which calls this) shows EXACTLY what the weaver (which also calls this)
// baked into the signal, and the noise slider can re-jitter live.
export function jitterCoeffs(coeffs, noiseMax, seed) {
  if (!noiseMax) return coeffs.map(h => ({ k: h.k, amp: h.amp, phase: h.phase }));
  const rng = mulberry32(seed);
  return coeffs.map((h) => {
    const amp = h.amp * (1 + noiseMax * (rng() * 2 - 1));
    const phase = h.phase + noiseMax * (rng() * 2 - 1) * 1.2;
    return { k: h.k, amp, phase };
  });
}

export function weaveBlocks(text, alphabet, opts = {}) {
  const pre = SGFConfig.preSamples();
  const blockMs = opts.blockMs || SGFConfig.blockMs;   // image uses longer block
  const plen = partLen(blockMs);
  const markLen = SGFConfig.markSamples();
  // options: harmonics (count of bins to emit), noise (0..1 -> per-letter random amplitude ratio)
  const maxHarms = opts.harmonics || alphabet[text[0]||'A']?.length || 64;
  const noiseMax = Math.max(0, opts.noise || 0);
  const noiseSeed = opts.seed != null ? opts.seed : 12345;
  const total = pre + text.length*(plen*2 + markLen) + pre;
  const samples = new Float32Array(total);
  const markers = [];
  let idx = 0;
  // deterministic-ish RNG state so per-letter noise reproduces a run if seed given
  let rng = mulberry32(noiseSeed);
  const put = (fn, len) => { for (let i=0;i<len;i++){ samples[idx]=fn(idx); idx++; } };

  // preamble: pure f0 phase-0 (absolute phase reference); an image weave emits
  // its preamble at markFreq instead so the seer can tell text apart from image.
  const preFreq = (opts.preImage ? markFreq() : SGFConfig.f0);
  put((n)=>{ const t=n/SGFConfig.sampleRate; return Math.sin(2*Math.PI*preFreq*t)*0.8; }, pre);

  // The EXACT jittered coefficient set used for each letter, so the encoder
  // can also display what was actually woven (noise visible in the epicycles)
  const noisy = [];

  for (const c of text) {
    const harm = (alphabet[c] || []).slice(0, maxHarms);   // amplitude-sorted already
    const startIdx = idx;
    // per-letter additive dither amplitude (audible texture)
    const letterNoise = noiseMax * rng();
    // Jittered coefficient set = the EXACT same deterministic function the
    // encoder view calls for its live display (seed derived per letter index),
    // so what you see is what's baked into the signal.
    const letterSeed = (noiseSeed ^ (idx * 0x9E3779B1)) >>> 0;
    const letterCoeffs = jitterCoeffs(harm, noiseMax, letterSeed);
    noisy.push(letterCoeffs);
    // synthesize X (real part) and Y (imag) halves using the jittered sines
    const xr = new Float32Array(plen);
    const yr = new Float32Array(plen);
    for (let i=0;i<plen;i++){
      const t=i/SGFConfig.sampleRate;
      let x=0, y=0;
      for (let j=0;j<letterCoeffs.length;j++){
        const a = 2*Math.PI*letterCoeffs[j].k*SGFConfig.f0*t + letterCoeffs[j].phase;
        x += letterCoeffs[j].amp*Math.cos(a);   // Re{ e^i(...) }
        y += letterCoeffs[j].amp*Math.sin(a);   // Im{ e^i(...) }
      }
      // additive per-sample dither (audible "thick water" texture)
      const nv = (rng()*2-1) * letterNoise;
      xr[i]=x+nv; yr[i]=y+nv;
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

  return { samples: new Float32Array(samples), letters: [...text], markers, noisy };
}

// deterministic seeded RNG so "always different per letter" is reproducible per run/n.
function mulberry32(a) { return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }