import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normChar, normalizeText } from '../js/normalize.js';

// fake baked alphabet: uppercase letters + a few punct + space + '?'
const AL = {
  A:1, B:1, C:1, D:1, E:1, F:1, G:1, H:1, I:1, J:1, K:1, L:1, M:1, N:1,
  O:1, P:1, Q:1, R:1, S:1, T:1, U:1, V:1, W:1, X:1, Y:1, Z:1,
  '0':1,'1':1,'2':1,'3':1,'4':1,'5':1,'6':1,'7':1,'8':1,'9':1,
  '.':1,',':1,':':1,';':1,'!':1,'?':1,'-':1,'_':1,'/':1,'@':1,'·':1,' ':1,
  'É':1,'è':1,
};

test('lowercase maps to uppercase geometry', () => {
  assert.equal(normChar('h', AL), 'H');
  const { chars } = normalizeText('Hello', AL);
  assert.deepEqual(chars, ['H', 'E', 'L', 'L', 'O']);
});

test('punctuation and digits are kept when baked', () => {
  const { chars } = normalizeText('Hi, 42!', AL);
  assert.deepEqual(chars, ['H', 'I', ',', ' ', '4', '2', '!']);
});

test('space preserved; newline/tab collapse to space', () => {
  const { chars } = normalizeText('a\nb\tc d', AL);
  assert.deepEqual(chars, ['a',' ','b',' ','c',' ','d'].map(c => normChar(c, AL)));
});

test('unknown chars fall back to ?', () => {
  assert.equal(normChar('~', AL), '?');
  assert.equal(normChar('π', AL), '?');
});

test('original text is preserved verbatim', () => {
  const { original } = normalizeText('Héllo, Wörld!', AL);
  assert.equal(original, 'Héllo, Wörld!');   // exact case + accents kept for transcription
});

test('URL-ish text maps without dropping the baked tokens', () => {
  const { chars } = normalizeText('https://x.dev/a-b', AL);
  // h t t p s / / x . d e v / a - b
  const mapped = chars.join('');
  assert.ok(mapped.startsWith('HTTPS'), 'scheme uppercase');
  assert.ok(mapped.includes('/'), 'slash kept');
  assert.ok(mapped.includes('-'), 'hyphen kept');
  assert.ok(mapped.includes('.'), 'dot kept');
});
