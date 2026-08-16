# SINE GHOST FILE

Transmission is a lie. The exchange is therefore a proof.

Every grapheme is disarticulated along a closed contour and resolved into a
rotating basis — a finite set of phasors whose coherent superpositions trace
the letter back into visibility. What travels is not the mark but its spectrum.

---

## the pact

Given a closed plane curve `γ(s) : [0,T) → ℝ²`, its resolution into the complex
Fourier series

```
z(t) = Σ_{k=1}^{N}  A_k · e^{i (2π·k·f₀·t + φ_k)}
```

fully determines the geometry: radius `A_k` is the harmonic weight, `k·f₀` its
rotational rate, `φ_k` the absolute phase locking it to the staggered clock.

The signal is then the sum, *not* the sequence. All harmonics speak at once,
folded into a single short block whose spectrum *is* the glyph. One letter —
one block — one visible chirograph regained from noise.

## the chain

```
PREAMBLE  ──  f₀, φ = 0        absolute phase anchor
BLOCK cᵢ  ──  Σ Aᵢₖ·sin(2πkf₀t + φᵢₖ)   the glyph, spectral
MARK      ──  (N+3)·f₀          unassigned bin, boundary
```

Decoded not by windowing but by a bank of Goertzel resonators at known
frequencies — each bin returns amplitude and phase conditionally locked to the
preambular oscillator. No leakage is invited; none is windowed away.

## Weave & See

Key in, it becomes signal. The signal becomes spectacle: epicycles that turn,
ands of phasors, the letter assembling itself out of accumulated rotation —
an encryption that draws its own decryption.

## blocs

- `js/`        — resonator (...), weaver (...), alphabet
- `tools/`     — the bake: contour → coefficients
- `test/`      — the-arbitur

## state

Fourier settled. Building the phasors.

---

`Arial Rounded Bold` → `js/alphabet.json` · 48 kHz · 16-bit mono · `f₀=102` · `N=32`