# SERENDIPPO-FOURIER — SINE GHOST FILE (SGF)

Communication stéganographique : texte → WAV dont le spectre encode la forme (Fourier) → transcription visuelle par épicycles.

## Vision
Chaque lettre d'une typographie SVG « bulles » (chemins fermés) est décomposée en série de Fourier (amplitude, fréquence, phase). « Le son EST la forme. » Mode COMPOSITE : toutes les harmoniques d'une lettre sont sommées simultanément en un bloc audio. Le décodeur reconstruit la lettre par une chaîne d'épicycles.

## 3 Briques
1. **Glyph Baker** — SVG → coefficients DFT (JSON) — offline Python
2. **Sound Weaver** — Texte → WAV composite (harmoniques simultanées) — JS
3. **Ghost Seer** — WAV → décodage Goertzel → épicycles (canvas) — JS

## Décisions verrouillées
- Mode composite (séquentiel non requis) — le son EST la forme
- Phase par référence ABSOLUE (preamble), PAS DPSK
- Décodage : Goertzel (fréquences connues), pas de FFT fenêtrée / Hanning
- Alphabet bulles A-Z (chemins fermés)
- WAV 48k 16-bit mono ; f0=102, N=32, bloc 90ms
- Plateforme : app statique 100% client-side (GitHub Pages)
- Périmètre : messagerie sécurisée (stéganographie) + œuvre audiovisuelle générative

## Status
Conception validée. Plan d'implémentation écrit (docs/superpowers/plans). En attente choix d'exécution (subagent vs inline) puis build.

## Structure
- `js/` modules (config, goertzel, wavEncoder, weaver, seer, epicycles, alphabet.json)
- `tools/` glyph_bake.py + glyphs/
- `tests/` tests TDD node
- `research/` clones repos de référence (draw43, Coding Train, afskmodem, ggwave, ic-768)
- `memory-bank/` — 7 fichiers (source de vérité, non versionné)
- `docs/superpowers/` — specs + plans (non versionnés)

## Références clés (clonées dans research/)
jan25/draw43 · CodingTrain CC#130 Fourier · lavajuno/afskmodem · ggerganov/ggwave · ic-768/additive-cymatics-animator