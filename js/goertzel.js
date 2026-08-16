// Single-frequency Goertzel filter. Returns magnitude + phase relative to window start.
export function goertzel(frames, sampleRate, targetFreq) {
  const n = frames.length;
  if (n === 0) return { magnitude: 0, phaseRad: 0 };
  const k = Math.round(targetFreq * n / sampleRate);
  const w0 = 2 * Math.PI * k / n;
  const coeff = 2 * Math.cos(w0);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    s0 = frames[i] + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  const re = s1 - s2 * Math.cos(w0);
  const im = s2 * Math.sin(w0);
  const mag = 2 * Math.sqrt(re*re + im*im) / n;
  const phaseRad = Math.atan2(im, re);
  return { magnitude: mag, phaseRad };
}

export function goertzelBank(frames, sampleRate, freqList) {
  return freqList.map(f => {
    const r = goertzel(frames, sampleRate, f);
    return { freq: f, magnitude: r.magnitude, phaseRad: r.phaseRad };
  });
}