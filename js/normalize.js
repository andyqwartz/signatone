// SIGNATONE character normalisation.
//
// The geometry channel is a baked alphabet (uppercase letters, digits,
// punctuation, accents, space, '?'). We map arbitrary input text onto that
// alphabet — lowercase -> uppercase for the drawn form, unknown chars -> the
// '?' fallback — while the ORIGINAL text is preserved verbatim so the
// transcription download stays lossless.

// Map a single character to a baked alphabet key.
export function normChar(c, alphabet) {
  if (c === '\n' || c === '\t') return ' ';   // whitespace -> space in the signal
  if (alphabet[c]) return c;                   // exact baked key (punct, accents, space…)
  const u = c.toUpperCase();                   // lowercase -> uppercase form
  if (u !== c && alphabet[u]) return u;
  return '?';                                  // fallback glyph
}

// Returns signal characters + the original text (lossless for transcription).
export function normalizeText(raw, alphabet) {
  const original = raw == null ? '' : String(raw);
  const chars = [...original].map(c => normChar(c, alphabet));
  return { chars, original };
}