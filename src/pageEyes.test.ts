import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fitWithin,
  looksSensitive,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  tableMarkdown,
  tidy,
} from './pageEyes.ts';

test('tidy swaps control and invisible characters for spaces, squeezes whitespace and cuts to length', () => {
  assert.equal(tidy('  a\u0000b​c \n\n d\t', 50), 'a b c d');
  assert.equal(tidy('x'.repeat(30), 10), `${'x'.repeat(9)}…`);
  assert.equal(tidy(42, 10), '');
  assert.equal(tidy('‮evil', 20), 'evil');
});

test('a table becomes Markdown with the first row as its header, and says when rows are left out', () => {
  const md = tableMarkdown({
    caption: 'Plans',
    totalRows: 5,
    rows: [
      ['Plan', 'Price'],
      ['Basic', '$5'],
      ['Pro | max', '$20'],
    ],
  });
  assert.equal(
    md,
    [
      'Table: Plans',
      '| Plan | Price |',
      '| --- | --- |',
      '| Basic | $5 |',
      '| Pro / max | $20 |',
      '(2 more rows are not shown)',
    ].join('\n'),
  );
});

test('ragged rows are padded, empty rows are dropped, and big tables are cut to the limits', () => {
  const md = tableMarkdown({
    caption: '',
    totalRows: 3,
    rows: [['A', 'B', 'C'], [], ['1']],
  });
  assert.equal(md, '| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |');
  assert.equal(tableMarkdown({ caption: '', totalRows: 0, rows: [] }), '');
  const wide = Array.from({ length: MAX_TABLE_COLS + 5 }, (_, i) => `c${i}`);
  const tall = Array.from({ length: MAX_TABLE_ROWS + 10 }, () => wide);
  const cut = tableMarkdown({
    caption: '',
    totalRows: tall.length,
    rows: tall,
  });
  const lines = cut.split('\n');
  // header + separator + (rows - 1) + the "more rows" note
  assert.equal(lines.length, 2 + (MAX_TABLE_ROWS - 1) + 1);
  assert.equal(lines[0].split('|').length - 2, MAX_TABLE_COLS);
  assert.match(lines[lines.length - 1], /10 more rows/);
});

test('fitWithin shrinks the longest side to the limit and never enlarges', () => {
  assert.deepEqual(fitWithin(3000, 1500, 1500), { width: 1500, height: 750 });
  assert.deepEqual(fitWithin(800, 3200, 1600), { width: 400, height: 1600 });
  assert.deepEqual(fitWithin(800, 600, 1568), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(0, 0, 1568), { width: 0, height: 0 });
});

test('sign-in, account and payment pages are told apart from ordinary ones by their address', () => {
  for (const url of [
    'https://shop.example/login',
    'https://accounts.google.com/signin/v2',
    'https://example.com/checkout/payment',
    'https://bank.example/',
    'https://example.com/user/password-reset',
    'https://secure.example.com/home',
  ]) {
    assert.equal(looksSensitive(url), true, url);
  }
  for (const url of [
    'https://shop.example/pricing',
    'https://news.example/2026/11/story',
    'https://en.wikipedia.org/wiki/Cardiff',
    'https://example.com/discard',
    'not a url',
  ]) {
    assert.equal(looksSensitive(url), false, url);
  }
});
