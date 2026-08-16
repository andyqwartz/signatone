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
export function computeLayout(n, W, H, opts = {}) {
  if (n <= 0) return [];
  const margin = (opts.margin ?? 0.09) * Math.min(W, H);
  const sf = opts.spacing ?? 1.7;
  const maxCell = (opts.maxBox ?? 0.30) * Math.min(W, H);
  const capW = Math.max(1, W - 2 * margin);
  const capH = Math.max(1, H - 2 * margin);
  const singleMax = opts.singleMax ?? 14;

  // --- single line rule: short messages read as one centered word ---
  if (n <= singleMax) {
    const box = Math.max(4, Math.min(maxCell, capH, capW / (n * sf)));
    const rowW = n * box * sf;
    const y0 = (H - box) / 2;
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
  const y0 = (H - blockH) / 2;
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

// Hidden PGP format detection. A pasted ASCII-armored PGP block opens with a
// "-----BEGIN PGP ...-----" marker.
export function isPGP(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return /-{5}\s*BEGIN\s+PGP\b/i.test(text);
}