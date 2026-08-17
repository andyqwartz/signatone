// SIGNATONE layout + format detection — pure functions (importable in tests).

// Distribute N glyph cells across the stage so that:
//  - a short message (single word) stays on ONE line, large, centered,
//    size auto-scaled to fit; long messages wrap into rows that fill the viewport.
// Returns array of { cx, cy, box } — one entry per letter, box = cell edge.
//
// opts:
//   margin   : fraction of min(W,H) used as stage inset (default 0.09)
//   spacing  : horizontal cell pitch expressed in box units (default 1.7)
//   maxBox   : fraction of min(W,H) capping a single cell (default 0.30)
//   singleMax: max letter count to force a single line (default 14)
//   topInset / bottomInset : px of stage kept clear of glyphs (fixed UI bars).
//     The usable band is the H minus these insets, vertically centred in it.
export function computeLayout(n, W, H, opts = {}) {
  if (n <= 0) return [];
  const topInset = opts.topInset || 0;
  const bottomInset = opts.bottomInset || 0;
  const bandH = Math.max(1, H - topInset - bottomInset);
  const margin = (opts.margin ?? 0.09) * Math.min(W, bandH);
  const sf = opts.spacing ?? 1.7;
  const maxCell = (opts.maxBox ?? 0.30) * Math.min(W, bandH);
  const capW = Math.max(1, W - 2 * margin);
  const capH = Math.max(1, bandH - 2 * margin);
  const singleMax = opts.singleMax ?? 14;
  // vertical centre of the usable band (not the full screen)
  const bandCenterY = topInset + bandH / 2;

  // --- single line rule: short messages read as one centered word ---
  if (n <= singleMax) {
    const box = Math.max(4, Math.min(maxCell, capH, capW / (n * sf)));
    const rowW = n * box * sf;
    const y0 = bandCenterY - box / 2;
    const x0 = (W - rowW) / 2;
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({ cx: x0 + i * box * sf + box / 2, cy: y0 + box / 2, box });
    }
    return pts;
  }

  // --- wrap: pick the row count that yields the largest readable cells ---
  let best = null;
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const box = Math.max(4, Math.min(maxCell, capH / rows, capW / (cols * sf)));
    const area = box * box;
    // prefer max area; ties -> fewer rows (more line-like)
    if (!best || area > best.area + 1e-6 || (Math.abs(area - best.area) <= 1e-6 && rows < best.rows)) {
      best = { rows, cols, box, area };
    }
  }
  const { rows, cols, box } = best;
  const blockH = rows * box;
  const y0 = bandCenterY - blockH / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols), col = i % cols;
    const inRow = Math.min(cols, n - row * cols);      // letters present in this row
    const rowW = inRow * box * sf;
    const x0 = (W - rowW) / 2;                          // each row centered
    pts.push({ cx: x0 + col * box * sf + box / 2, cy: y0 + row * box + box / 2, box });
  }
  return pts;
}

// Header-marked message detection. Any pasted block that opens with a
// "-----BEGIN ...-----" boundary is treated as opaque long text, not a message
// to draw. (Kept deliberately unnamed; see the quiet path in app.js.)
export function isSealed(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return /-{5}\s*BEGIN\b/i.test(text);
}