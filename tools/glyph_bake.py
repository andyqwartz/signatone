"""
glyph_bake.py — Bakes the SGF alphabet JSON from real bubble-font glyphs.

Pipeline (PROVEN-code faithful — full DFT, no harmonic truncation):
  1. Render each capital A-Z in "Arial Rounded Bold" (true bubble font).
  2. Extract the OUTER boundary via skimage.find_contours (faithful filled shape,
     unlike naive row-scan which flattened concavities and killed legibility).
  3. Centre at origin + normalise.
  4. FULL complex-FFT of z=x+iy (keeps both axes) — store ALL harmonics up to N.
  5. Write js/alphabet.json as {"A":[...], "letterSet":[...]}.

Deps (dev only, offline bake): Pillow, numpy, scikit-image.
Run: python3 tools/glyph_bake.py
"""
import json, math, os
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from skimage import measure

FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
SIZE = 400
N_HARM = 128      # harmonics kept (amplitude-sorted desc, big phasors first)
SAMPLE_RATE = 48000
SGF_F0 = 102      # keep consistent with js/config.js f0


def render_glyph(ch, font):
    img = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), ch, font=font)
    w = bbox[2]-bbox[0]; h = bbox[3]-bbox[1]
    d.text(((SIZE-w)/2 - bbox[0], (SIZE-h)/2 - bbox[1]), ch, fill=255, font=font)
    return np.array(img) > 128


def outer_boundary(mask, resample=300):
    """Composed closed path = OUTER loop + each HOLE loop, concatenated into ONE
    closed curve. This is what makes bubble letters (O, B, A, P, G...) legible:
    a single epicycle chain draws the outer ring, jumps into each interior hole,
    and back — reproducing the true filled-glyph silhouette. (row-scan flattening
    was the legibility killer.)"""
    contours = measure.find_contours(mask, 0.5)
    if not contours:
        return []
    # largest loop = outer boundary; the rest = interior holes
    contours.sort(key=len, reverse=True)
    outer = contours[0]
    holes = contours[1:]
    seq = [(float(p[1]), float(p[0])) for p in outer]   # (x, y), clockwise-ish
    for h in holes:
        seq.extend([(float(p[1]), float(p[0])) for p in h])
    return uniform_resample(seq, resample)


def uniform_resample(pts, n):
    """Resample a polyline into n points by cumulative length (jump lines get
    proportional samples, so connecting strokes stay thin)."""
    if len(pts) < 2:
        return pts
    lens = [0.0]
    for i in range(1, len(pts)):
        x0, y0 = pts[i-1]; x1, y1 = pts[i]
        lens.append(lens[-1] + math.hypot(x1-x0, y1-y0))
    L = lens[-1]
    if L <= 0:
        return [pts[0]]*n
    out = []
    j = 0
    for m in range(n):
        target = L*m/(n-1)
        while j < len(lens)-2 and lens[j+1] < target:
            j += 1
        seg = lens[j+1]-lens[j]
        t = (target-lens[j])/seg if seg > 0 else 0
        x0, y0 = pts[j]; x1, y1 = pts[j+1]
        out.append((x0+(x1-x0)*t, y0+(y1-y0)*t))
    return out


def dft_all(points):
    """PROVEN Fourier-Epicycles method (research/Fourier-Epicycles/readme.md):
    full fftshift of the COMPLEX 2D path (z=x+iy) -> SIGNED integer bins k
    (negative AND positive). A 2D complex path has NO conjugate symmetry, so both
    signs are required to reproduce concavities; positive-only flattens to blobs
    (the legibility bug fixed here).
    amp = |c|/N (proven normalisation i.e. Xf/N). Sorted by amplitude descending
    -> dominant phasors first, few harmonics already recognizable.
    k capped by |k| < maxK so k*f0 stays in the audible band.
    NOTE: rendering reconstructs z(t)=Σ c_k·e^{i2πk t} (sub-sum phasors). The audio
    weaver emits each bin as a tone at |k|*f0 carrying amp+phase; complex-2D info
    is carried by pairing the two bins per |k| (see js/weaver + js/seer)."""
    z = np.array([complex(float(px), float(py)) for px, py in points])
    N = len(z)
    bins = np.fft.fftshift(np.fft.fftfreq(N)) * N          # signed integer bins
    Xf = np.fft.fftshift(np.fft.fft(z))
    maxK = int((SAMPLE_RATE/2 - 2000) / SGF_F0)
    coeffs = []
    for kk in range(N):
        k = int(round(bins[kk]))
        if not (1 <= abs(k) <= maxK):
            continue
        c = Xf[kk]
        coeffs.append({"k": k,                                   # signed bin
                       "amp": round(float(abs(c) / N), 8),
                       "phase": round(float(np.angle(c)), 6)})
    coeffs.sort(key=lambda c: c["amp"], reverse=True)      # proven: amplitude order
    return coeffs[:N_HARM]


def normalize_pts(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    cx = (min(xs)+max(xs))/2; cy = (min(ys)+max(ys))/2
    scale = max((max(xs)-min(xs)), (max(ys)-min(ys))) or 1.0
    return [((x-cx)/scale*1.8, (y-cy)/scale*1.8) for x, y in pts]


def main():
    alphabet = {}
    font = ImageFont.truetype(FONT_PATH, 280)
    for i in range(26):
        ch = chr(ord('A') + i)
        pts = normalize_pts(outer_boundary(render_glyph(ch, font), 300))
        alphabet[ch] = dft_all(pts)
        nz = sum(1 for h in alphabet[ch] if h['amp'] > 0.005)
        print(f"{ch}: {len(pts)} pts, {len(alphabet[ch])} harms, {nz} significant")
    alphabet["letterSet"] = [chr(ord('A')+i) for i in range(26)]
    os.makedirs("js", exist_ok=True)
    with open("js/alphabet.json", "w") as f:
        json.dump(alphabet, f)
    print(f"Wrote js/alphabet.json ({len(alphabet)} letters, {N_HARM} harmonics each)")


if __name__ == "__main__":
    main()