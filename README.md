# SIGNATONE

The sound is the form.

Every grapheme is disarticulated along a closed contour and resolved into a
rotating basis — a finite set of phasors whose coherent superpositions trace
the letter back into visibility. What travels is not the mark but its spectrum.
A signature, carried by a tone.

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
hands of phasors, the letter assembling itself out of accumulated rotation —
an encryption that draws its own decryption. A single word stays on one line,
auto-scaled and centered; long messages wrap to fill the stage, rendered fast
on a persisted layer.

## Stealth

A pasted PGP armor block is detected invisibly: it is woven to WAV and
downloaded with a quiet confirmation — **no trace is drawn**.

## blocs

- `js/`        — resonator (seer), weaver, alphabet, layout (pure), epicycles
- `tools/`     — the bake: contour → coefficients
- `test/`      — the arbiter (22 tests)

## state

Fourier settled. Building the phasors.

---

`Arial Rounded Bold` → `js/alphabet.json` · 48 kHz · 16-bit mono · `f₀=102` · `N=32`
