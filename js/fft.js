// SIGNATONE standalone radix-2 FFT — vendored from the proven Cooley-Tukey
// iterative decimation-in-time algorithm (same algorithm as the `fft.js`
// npm package used by jezzamonn/fourier `getFourierData`). No dependencies.
//
// Conventions match the rest of the codebase:
//   - amp = |c| / N, phase = atan2(im, re)
//   - SIGNED bins k ∈ [-N/2, N/2)
//   - N must be a power of 2 (guaranteed by resample).

// In-place radix-2 FFT. re, im are Float64Arrays of length N (power of 2).
// After call, re[k], im[k] = (real, imag) of bin k (standard 0..N-1 ordering).
export function fft(re, im) {
  const N = re.length;
  if (N <= 1) return;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tr = re[i], ti = im[i];
      re[i] = re[j]; im[i] = im[j];
      re[j] = tr; im[j] = ti;
    }
  }
  // FFT butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const wRe = Math.cos(2 * Math.PI / len);
    const wIm = -Math.sin(2 * Math.PI / len);
    for (let i = 0; i < N; i += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < half; j++) {
        const k = i + j;
        const tr = wr * re[k + half] - wi * im[k + half];
        const ti = wr * im[k + half] + wi * re[k + half];
        re[k + half] = re[k] - tr;
        im[k + half] = im[k] - ti;
        re[k] += tr;
        im[k] += ti;
        const nw = wr * wRe - wi * wIm;
        wi = wr * wIm + wi * wRe;
        wr = nw;
      }
    }
  }
}

// FFT with signed-bin reordering. Takes re, im arrays (length N, power of 2),
// returns [{k, amp, phase}] with k ∈ [-N/2, N/2), sorted by amplitude desc.
// amp = |c| / N, phase = atan2(im, re) — matches the pathToCoeffs interface.
export function fftSignedCoeffs(re, im) {
  const N = re.length;
  fft(re, im);
  const half = N >> 1;
  const coeffs = [];
  for (let i = 0; i < N; i++) {
    // standard FFT bin i maps to signed k via ((i + half) % N) - half
    const k = ((i + half) % N) - half;
    const amp = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / N;
    if (amp < 1e-9) continue;
    coeffs.push({ k, amp, phase: Math.atan2(im[i], re[i]) });
  }
  coeffs.sort((a, b) => b.amp - a.amp);
  return coeffs;
}
