import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  documentText,
  hasReadableText,
  MAX_PDF_TEXT_CHARS,
  pageText,
  parsePdfText,
} from './pdfTextFormat.ts';

test('a page is its pieces in order, with new lines where the PDF ends a line', () => {
  assert.equal(
    pageText([
      { str: 'Quarterly report', hasEOL: true },
      { str: 'The quick brown ' },
      { str: 'fox', hasEOL: true },
    ]),
    'Quarterly report\nThe quick brown fox',
  );
});

test('odd pieces are skipped and blank runs are tidied', () => {
  assert.equal(
    pageText([
      { str: 'a  ', hasEOL: true },
      { str: '', hasEOL: true },
      { str: '', hasEOL: true },
      { str: 42 },
      { str: 'b' },
    ]),
    'a\n\nb',
  );
  assert.equal(pageText([]), '');
});

test('a document puts each page under its number', () => {
  assert.deepEqual(documentText(['one', 'two']), {
    text: '--- Page 1 ---\none\n\n--- Page 2 ---\ntwo',
    truncated: false,
  });
});

test('a huge document is cut at the limit and says so', () => {
  const big = documentText(['x'.repeat(MAX_PDF_TEXT_CHARS), 'y']);
  assert.equal(big.truncated, true);
  assert.equal(big.text.length, MAX_PDF_TEXT_CHARS);
});

test('a scanned PDF (pages with no text) is not readable', () => {
  assert.equal(hasReadableText(['', '  \n ']), false);
  assert.equal(hasReadableText(['', 'hello']), true);
  assert.equal(hasReadableText([]), false);
});

test('an answer from the window is checked before it is trusted', () => {
  assert.deepEqual(
    parsePdfText({
      ok: true,
      pages: 2,
      text: 'hi',
      scanned: false,
      truncated: false,
    }),
    { ok: true, pages: 2, text: 'hi', scanned: false, truncated: false },
  );
  for (const bad of [
    null,
    'x',
    { ok: false },
    { ok: true, pages: 'two', text: 'hi', scanned: false, truncated: false },
    { ok: true, pages: 2, text: 5, scanned: false, truncated: false },
    { ok: true, pages: -1, text: '', scanned: true, truncated: false },
    { ok: true, pages: 1, text: '', scanned: 'no', truncated: false },
  ]) {
    assert.deepEqual(parsePdfText(bad), { ok: false });
  }
  // Too much text is cut and marked.
  const big = parsePdfText({
    ok: true,
    pages: 1,
    text: 'x'.repeat(MAX_PDF_TEXT_CHARS + 5),
    scanned: false,
    truncated: false,
  });
  assert.ok(big.ok && big.text.length === MAX_PDF_TEXT_CHARS && big.truncated);
});
