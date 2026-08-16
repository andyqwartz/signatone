"""
glyph_bake.py — Bakes the SGF alphabet JSON from real bubble-font glyphs.

Pipeline:
  1. Render each capital A-Z in "Arial Rounded Bold" (a true bubble font) on a
     padded image.
  2. Extract the OUTER closed silhouette boundary via Moore contour tracing
     (single loop; internal holes are intentionally ignored — the epicycle
     chain draws the outer bubble silhouette, which stays recognizable).
  3. Centre at origin, normalise to ~[-1,1].
  4. DFT (numpy rfft) k=1..N -> store [{k, amp, phase}].
  5. Write js/alphabet.json as {"A":[...], "Z":[...], "letterSet":[...]}.

Dependencies (dev only, offline bake): Pillow, numpy.
Run: python3 tools/glyph_bake.py
"""
import math, json, os
from PIL import Image, ImageDraw, ImageFont
import numpy as np

FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
SIZE = 400
PAD = 30
N_HARM = 32   # harmonics stored (k=1..32)


def render_glyph(ch, font):
    """Render char on square RGBA; return numpy mask bool."""
    img = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0, 0), ch, font=font)
    w = bbox[2]-bbox[0]; h = bbox[3]-bbox[1]
    x = (SIZE-w)/2 - bbox[0]
    y = (SIZE-h)/2 - bbox[1]
    d.text((x, y), ch, fill=255, font=font)
    return np.array(img) > 128


def trace_outer_boundary(mask):
    """Row-scan outer silhouette boundary (single closed loop).
    For each row take leftmost & rightmost foreground pixel -> the outer contour,
    which naturally ignores internal holes (bubble letters 'b', 'A', 'P'...).
    Returns a closed polyline ordered around the shape (L->R going down, R->L going up)."""
    H, W = mask.shape
    left = {}
    right = {}
    for y in range(H):
        row = mask[y]
        xs = np.where(row)[0]
        if len(xs):
            left[y] = int(xs[0])
            right[y] = int(xs[-1])
    ys = sorted(left.keys())
    if not ys:
        return []
    top, bottom = ys[0], ys[-1]
    # bottom pass: go left->right along bottom row (shared vertices)
    x0, x1 = left[bottom], right[bottom]
    pts = []
    for x in range(x0, x1+1):
        pts.append((x, bottom))
    # left side bottom->top
    for y in ys[:0:-1]:  # bottom..top
        pts.append((left[y], y))
    # top row right->left
    for x in range(right[top], left[top]-1, -1):
        pts.append((x, top))
    # right side top->bottom (skip bottom corner)
    for y in ys[1:]:
        pts.append((right[y], y))
    return pts


def simplify(pts, keep=512):
    """Uniformly resample closed contour to keep points."""
    if len(pts) <= keep:
        return pts
    out = []
    total = len(pts)
    for m in range(keep):
        out.append(pts[int(m*total/keep)])
    return out


def dft_harms(points, n):
    """DFT of a closed 2D path -> list of {k, amp, phase} for k=1..n.
    z = x + iy; full complex FFT preserves both axes."""
    z = np.array([complex(float(px), float(py)) for px, py in points])
    N = len(z)
    X = np.fft.fft(z) / N
    out = []
    for k in range(1, n+1):
        c = X[k] if k < len(X) else 0+0j
        out.append({"k": k, "amp": round(float(abs(c)), 6), "phase": round(float(math.atan2(c.imag, c.real)), 6)})
    return out


def normalize_pts(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    cx = (min(xs)+max(xs))/2; cy = (min(ys)+max(ys))/2
    scale = max((max(xs)-min(xs)), (max(ys)-min(ys))) or 1.0
    norm = []
    for x, y in pts:
        norm.append(((x - cx)/scale*1.8, (y - cy)/scale*1.8))
    return norm


def main():
    font = ImageFont.truetype(FONT_PATH, 280)
    alphabet = {}
    for i in range(26):
        ch = chr(ord('A') + i)
        mask = render_glyph(ch, font)
        pts = trace_outer_boundary(mask)
        pts = simplify(pts, 192)
        pts = normalize_pts(pts)
        alphabet[ch] = dft_harms(pts, N_HARM)
        print(f"{ch}: boundary {len(pts)} pts -> {len(alphabet[ch])} harms")
    alphabet["letterSet"] = [chr(ord('A')+i) for i in range(26)]
    os.makedirs("js", exist_ok=True)
    with open("js/alphabet.json", "w") as f:
        json.dump(alphabet, f)
    print(f"Wrote js/alphabet.json with {len(alphabet)} letters")


if __name__ == "__main__":
    import json
    main()