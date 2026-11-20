import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cutOffNote } from './cutOffNote.ts';

test('a cut page and an answer that does not say so gets the app note', () => {
  const note = cutOffNote('The lighthouse was built in 1851.', 1, 20_000);
  assert.match(note ?? '', /^\n\n_Note from the app: that page was long/);
  assert.match(note ?? '', /first 20,000 characters/);
});

test('several cut reads give one note, without claiming a count (the same page may have been read twice)', () => {
  assert.match(
    cutOffNote('Here are the prices.', 3, 20_000) ?? '',
    /some of the pages read were long/,
  );
});

test('nothing is added when no page was cut, the answer is empty, or the answer already says so', () => {
  assert.equal(cutOffNote('Fine.', 0, 20_000), null);
  assert.equal(cutOffNote('', 1, 20_000), null);
  assert.equal(cutOffNote('   ', 1, 20_000), null);
  for (const said of [
    'Note that the page was cut off, so this is only the start.',
    'The text was truncated.',
    'I only read the first part of the page.',
    "I couldn't see the whole page.",
    'This covers the beginning of the article.',
    'It was cut short at 20,000 characters.',
  ]) {
    assert.equal(cutOffNote(said, 1, 20_000), null, said);
  }
});
