"""
glyph_bake.py — Bakes the SIGNATONE alphabet JSON from real bubble-font glyphs.

Pipeline (PROVEN-code faithful — full DFT, no harmonic truncation):
  1. Render each glyph in "Arial Rounded Bold" (true bubble font).
  2. Extract the OUTER boundary via skimage.find_contours (faithful filled shape,
     unlike naive row-scan which flattened concavities and killed legibility).
  3. Centre at origin + normalise (aspect preserved: divide by max dimension).
  4. FULL complex-FFT of z=x+iy (keeps both axes) — store ALL harmonics up to N.
  5. Write js/alphabet.json as {"A":[...], " ": [], "letterSet":[...]}.

Charset: uppercase+lowercase letters, digits, punctuation (incl. URL tokens),
accented Latin forms, a reserved space glyph (empty) and a '?' fallback.
Chars the font cannot render are skipped with a warning.

Deps (dev only, offline bake): Pillow, numpy, scikit-image.
Run: python3 tools/glyph_bake.py
"""
import json, os
from PIL import Image, ImageDraw, ImageFont
import numpy as np
from skimage import measure

FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
SIZE = 400
N_HARM = 128      # harmonics kept (amplitude-sorted desc, big phasors first)
SAMPLE_RATE = 48000
SGF_F0 = 102      # consistent with js/config.js f0

LETTERS_UC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
LETTERS_LC = "abcdefghijklmnopqrstuvwxyz"
DIGITS     = "0123456789"
PUNCT      = ".,:;!?()[]{}\"'-_/@#%&*+=<>~^$|\\"
ACCENTS    = "ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÑàâäçéèêëîïôöùûüÿñ"
CHARSET = list(dict.fromkeys(LETTERS_UC + LETTERS_LC + DIGITS + PUNCT + ACCENTS))


def render_glyph(ch, font):
    img = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), ch, font=font)
    w = bbox[2]-bbox[0]; h = bbox[3]-bbox[1]
    if w == 0 and h == 0:
        return np.array(img) > 128, False
    d.text(((SIZE-w)/2 - bbox[0], (SIZE-h)/2 - bbox[1]), ch, fill=255, font=font)
    return np.array(img) > 128, True


def outer_boundary(mask, resample=300):
    """Composed closed path = OUTER loop + each HOLE loop, concatenated into ONE
    closed curve. This is what makes bubble letters (O, B, A, P, G...) legible:
    a single epicycle chain draws the outer ring, jumps into each interior hole,
    and back — reproducing the true filled-glyph silhouette."""
    contours = measure.find_contours(mask, 0.5)
    if not contours:
        return []
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
        lens.append(lens[-1] + math_hypot(x1-x0, y1-y0))
    L = lens[-1]
    if L <= 0:
        return [pts[0]] * n
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


def math_hypot(a, b):
    return (a*a + b*b) ** 0.5


def dft_all(points):
    """PROVEN Fourier-Epicycles method: full fftshift of the COMPLEX 2D path
    (z=x+iy) -> SIGNED integer bins k (negative AND positive). amp = |c|/N,
    sorted by amplitude descending -> dominant phasors first."""
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
        coeffs.append({"k": k,
                       "amp": round(float(abs(c) / N), 8),
                       "phase": round(float(np.angle(c)), 6)})
    coeffs.sort(key=lambda c: c["amp"], reverse=True)
    return coeffs[:N_HARM]


def normalize_pts(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    cx = (min(xs)+max(xs))/2; cy = (min(ys)+max(ys))/2
    scale = max((max(xs)-min(xs)), (max(ys)-min(ys))) or 1.0
    return [((x-cx)/scale*1.8, (y-cy)/scale*1.8) for x, y in pts]


def main():
    alphabet = {}
    font = ImageFont.truetype(FONT_PATH, 280)
    skipped = []
    for ch in CHARSET:
        mask, ok = render_glyph(ch, font)
        if not ok:
            skipped.append(ch); continue
        pts = normalize_pts(outer_boundary(mask, 300))
        if not pts:
            skipped.append(ch); continue
        alphabet[ch] = dft_all(pts)
        nz = sum(1 for h in alphabet[ch] if h['amp'] > 0.005)
        print(f"{ch!r}: {len(pts)} pts, {len(alphabet[ch])} harms, {nz} significant")
    # reserved space glyph (silent block) + ensure '?' fallback exists
    alphabet[" "] = []
    if "?" not in alphabet:
        print("!! '?' not baked — pick a fallback:")
        fb = next((c for c in "IM012" if c in alphabet), None)
        if fb:
            alphabet["?"] = alphabet[fb]; print(f"   using '{fb}' as fallback")
    alphabet["letterSet"] = [k for k in CHARSET if k in alphabet] + [" "]
    os.makedirs("js", exist_ok=True)
    with open("js/alphabet.json", "w") as f:
        json.dump(alphabet, f)
    print(f"Wrote js/alphabet.json: {len(alphabet)-1} glyphs + space. Skipped: {skipped}")


if __name__ == "__main__":
    main()
