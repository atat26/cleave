import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  autoMode,
  cycleMode,
  LONG_WORDS,
  modeLabel,
  wordCount,
} from './newTabBox.ts';

test('an address goes, a short text searches, a long one asks the assistant', () => {
  for (const address of [
    'example.com',
    'https://a.example/x',
    'www.example.org',
    'localhost:3000',
    'fleetmaint.example/cal',
  ]) {
    assert.equal(autoMode(address), 'go', address);
  }
  for (const search of ['route closures', 'cheap gpu', 'who won', '  ', '']) {
    assert.equal(autoMode(search), 'search', search);
  }
  const fourteen = Array.from({ length: LONG_WORDS - 1 }, () => 'word').join(
    ' ',
  );
  const fifteen = Array.from({ length: LONG_WORDS }, () => 'word').join(' ');
  assert.equal(autoMode(fourteen), 'search');
  assert.equal(autoMode(fifteen), 'ask');
  // A long address-like string with no spaces is still an address.
  assert.equal(autoMode('https://example.com/' + 'a'.repeat(100)), 'go');
});

test('words are counted by spaces, ignoring extra ones', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('  one   two\nthree '), 3);
});

test('Tab and Shift+Tab cycle the modes, and wrap around', () => {
  assert.equal(cycleMode('go', 1), 'search');
  assert.equal(cycleMode('search', 1), 'ask');
  assert.equal(cycleMode('ask', 1), 'go');
  assert.equal(cycleMode('go', -1), 'ask');
  // Where Ask is not offered (a private window, later), only two modes cycle.
  assert.equal(cycleMode('search', 1, ['go', 'search']), 'go');
  assert.equal(cycleMode('go', -1, ['go', 'search']), 'search');
});

test('the words for each mode name the search engine', () => {
  assert.equal(modeLabel('go', 'Google'), 'Go to');
  assert.equal(modeLabel('search', 'Google'), 'Search Google');
  assert.equal(modeLabel('ask', 'Google'), 'Ask');
});
