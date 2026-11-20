import assert from 'node:assert/strict';
import { test } from 'node:test';
import { looseSearch, minWords, searchWords } from './looseSearch.ts';

interface Page {
  title: string;
  at: number;
}
const DAY = 86_400_000;
const NOW = 1_000 * DAY;
const pages: Page[] = [
  { title: 'Top 3 Graphics Cards from eBay Search', at: NOW - 3 * DAY },
  { title: 'Nvidia Tesla K80 for sale', at: NOW - 4 * DAY },
  { title: 'Best Buy Store Locator', at: NOW - 9 * DAY },
  { title: 'Graphics tablet reviews', at: NOW - 1 * DAY },
  { title: 'Graphics cards price history', at: NOW - 20 * DAY },
];
const find = (query: string, limit = 10, since?: number) =>
  looseSearch(
    pages,
    query,
    (p) => p.title,
    (p) => p.at,
    limit,
    since,
  ).map((p) => p.title);

test('filler words about the question are left out, unless nothing else is left', () => {
  assert.deepEqual(
    searchWords('What did I read about graphics cards last week'),
    ['graphics', 'cards'],
  );
  assert.deepEqual(searchWords('  Graphics   CARDS '), ['graphics', 'cards']);
  // Only filler: kept, so the search is not empty.
  assert.deepEqual(searchWords('the last week'), ['the', 'last', 'week']);
  assert.deepEqual(searchWords(''), []);
});

test('one or two words must all match; more words need about half', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(minWords), [0, 1, 2, 2, 2, 3, 3]);
});

test('a question with extra words still finds the page, best matches first, newest first among equals', () => {
  // The question's own words are left out; the two that are left must both be there.
  assert.deepEqual(find('what did I read about graphics cards last week'), [
    'Top 3 Graphics Cards from eBay Search',
    'Graphics cards price history',
  ]);
  // Three words: two of them are enough, and the page with all three comes first.
  assert.deepEqual(find('graphics cards history'), [
    'Graphics cards price history',
    'Top 3 Graphics Cards from eBay Search',
  ]);
  // Two words must both be there, as before.
  assert.deepEqual(find('graphics cards'), [
    'Top 3 Graphics Cards from eBay Search',
    'Graphics cards price history',
  ]);
  // One word: any page with it, newest first.
  assert.deepEqual(find('graphics'), [
    'Graphics tablet reviews',
    'Top 3 Graphics Cards from eBay Search',
    'Graphics cards price history',
  ]);
});

test('the limit, the date range and an empty search work as expected', () => {
  assert.equal(find('graphics', 2).length, 2);
  // Only the last 7 days.
  assert.deepEqual(find('graphics', 10, NOW - 7 * DAY), [
    'Graphics tablet reviews',
    'Top 3 Graphics Cards from eBay Search',
  ]);
  // No words: the newest pages.
  assert.deepEqual(find('', 2), [
    'Graphics tablet reviews',
    'Top 3 Graphics Cards from eBay Search',
  ]);
  assert.deepEqual(find('zebra'), []);
  assert.deepEqual(find('graphics', 10, NOW + DAY), []);
});
