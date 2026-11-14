import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addVisit,
  clearHistory,
  dayGroups,
  defaultHistory,
  historyUrl,
  MAX_HISTORY_DAYS,
  MAX_HISTORY_ENTRIES,
  parseHistory,
  pruneHistory,
  removeVisit,
  SAME_VISIT_MS,
  searchHistory,
  setVisitTitle,
} from './history.ts';

const NOW = new Date(2026, 10, 14, 15, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('only ordinary web pages are kept, without credentials or a # part', () => {
  assert.equal(
    historyUrl('https://user:pw@example.com/a?x=1#top'),
    'https://example.com/a?x=1',
  );
  for (const bad of [
    'about:blank',
    'file:///c:/a',
    'chrome://x',
    'junk',
    '',
    5,
    null,
  ]) {
    assert.equal(historyUrl(bad), null);
  }
  assert.equal(historyUrl('https://a.example/' + 'x'.repeat(3000)), null);
});

test('a visit is added with its title, and a non-web address is ignored', () => {
  let state = addVisit(
    defaultHistory(),
    'https://a.example/',
    ' A  page\n',
    NOW,
  );
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].title, 'A page');
  assert.equal(addVisit(state, 'about:blank', 'x', NOW), state);
});

test('the same page again soon is one visit; later it is a new one', () => {
  let state = addVisit(defaultHistory(), 'https://a.example/', 'A', NOW);
  state = addVisit(
    state,
    'https://a.example/#section',
    'A again',
    NOW + 5 * MIN,
  );
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].visitedAt, NOW + 5 * MIN);
  assert.equal(state.entries[0].title, 'A again');
  state = addVisit(
    state,
    'https://a.example/',
    'A',
    NOW + 5 * MIN + SAME_VISIT_MS + 1,
  );
  assert.equal(state.entries.length, 2);
  // Another page in between makes it a new visit too.
  const mixed = addVisit(
    addVisit(
      addVisit(defaultHistory(), 'https://a.example/', 'A', NOW),
      'https://b.example/',
      'B',
      NOW + MIN,
    ),
    'https://a.example/',
    'A',
    NOW + 2 * MIN,
  );
  assert.equal(mixed.entries.length, 3);
});

test('a page that finds its title later gives it to its newest visit', () => {
  let state = addVisit(defaultHistory(), 'https://a.example/', '', NOW);
  state = setVisitTitle(state, 'https://a.example/', 'Real title');
  assert.equal(state.entries[0].title, 'Real title');
  assert.equal(setVisitTitle(state, 'https://a.example/', 'Real title'), state);
  assert.equal(setVisitTitle(state, 'https://other.example/', 'x'), state);
  assert.equal(setVisitTitle(state, 'https://a.example/', '  '), state);
});

test('old visits and the oldest beyond the limit are dropped', () => {
  const old = addVisit(
    defaultHistory(),
    'https://old.example/',
    'Old',
    NOW - (MAX_HISTORY_DAYS + 1) * DAY,
  );
  const state = addVisit(old, 'https://new.example/', 'New', NOW);
  assert.deepEqual(
    state.entries.map((e) => e.url),
    ['https://new.example/'],
  );
  let big = defaultHistory();
  for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) {
    big = addVisit(big, `https://s${i}.example/`, 't', NOW + i);
  }
  assert.equal(big.entries.length, MAX_HISTORY_ENTRIES);
  assert.equal(big.entries[0].url, 'https://s5.example/');
});

test('search finds every word in title or address, newest first, within the limit', () => {
  let state = defaultHistory();
  state = addVisit(
    state,
    'https://docs.example/models',
    'Models overview',
    NOW,
  );
  state = addVisit(
    state,
    'https://shop.example/gpu',
    'Graphics cards',
    NOW + HOUR,
  );
  state = addVisit(
    state,
    'https://docs.example/pricing',
    'Pricing',
    NOW + 2 * HOUR,
  );
  assert.deepEqual(
    searchHistory(state, 'docs').map((e) => e.title),
    ['Pricing', 'Models overview'],
  );
  assert.deepEqual(
    searchHistory(state, 'docs models').map((e) => e.title),
    ['Models overview'],
  );
  assert.equal(searchHistory(state, 'zzz').length, 0);
  assert.equal(searchHistory(state, '', 2).length, 2);
});

test('a visit can be removed, and the last hour, day or everything cleared', () => {
  let state = defaultHistory();
  state = addVisit(state, 'https://a.example/', 'A', NOW - 3 * DAY);
  state = addVisit(state, 'https://b.example/', 'B', NOW - 5 * HOUR);
  state = addVisit(state, 'https://c.example/', 'C', NOW - 10 * MIN);
  const urls = (s: typeof state) => s.entries.map((e) => e.title);
  assert.deepEqual(urls(clearHistory(state, 'hour', NOW)), ['A', 'B']);
  assert.deepEqual(urls(clearHistory(state, 'day', NOW)), ['A']);
  assert.deepEqual(urls(clearHistory(state, 'all', NOW)), []);
  assert.deepEqual(urls(removeVisit(state, state.entries[1].id)), ['A', 'C']);
  assert.equal(removeVisit(state, 9999), state);
  assert.equal(clearHistory(defaultHistory(), 'all', NOW).entries.length, 0);
});

test('visits are grouped by day with Today and Yesterday headings', () => {
  let state = defaultHistory();
  state = addVisit(
    state,
    'https://a.example/',
    'A',
    new Date(2026, 10, 10, 9).getTime(),
  );
  state = addVisit(
    state,
    'https://b.example/',
    'B',
    new Date(2026, 10, 13, 23, 30).getTime(),
  );
  state = addVisit(
    state,
    'https://c.example/',
    'C',
    new Date(2026, 10, 14, 8).getTime(),
  );
  state = addVisit(
    state,
    'https://d.example/',
    'D',
    new Date(2026, 10, 14, 12).getTime(),
  );
  const groups = dayGroups(searchHistory(state, ''), NOW);
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Today', 'Yesterday', 'Tue, Nov 10'],
  );
  assert.deepEqual(
    groups[0].entries.map((e) => e.title),
    ['D', 'C'],
  );
});

test('junk on disk is dropped; good entries survive in order', () => {
  const parsed = parseHistory(
    {
      nextId: 3,
      entries: [
        { id: 2, url: 'https://b.example/', title: 'B', visitedAt: NOW - HOUR },
        {
          id: 1,
          url: 'https://a.example/',
          title: 'A',
          visitedAt: NOW - 2 * HOUR,
        },
        { id: 1, url: 'https://dup.example/', title: 'Dup', visitedAt: NOW },
        { id: 3, url: 'about:blank', title: 'Bad', visitedAt: NOW },
        { id: 'x', url: 'https://c.example/', visitedAt: NOW },
        {
          id: 4,
          url: 'https://d.example/',
          title: 'D',
          visitedAt: 'yesterday',
        },
        null,
      ],
    },
    NOW,
  );
  assert.deepEqual(
    parsed.entries.map((e) => e.title),
    ['A', 'B'],
  );
  assert.ok(parsed.nextId >= 3);
  for (const junk of [null, 5, 'x', [], {}, { entries: 'no' }]) {
    assert.equal(parseHistory(junk, NOW).entries.length, 0);
  }
});

test('the number of days kept can be chosen', () => {
  let state = addVisit(
    defaultHistory(),
    'https://old.example/',
    'Old',
    NOW - 10 * DAY,
    7,
  );
  state = addVisit(state, 'https://new.example/', 'New', NOW - 2 * DAY, 7);
  state = addVisit(state, 'https://newest.example/', 'Newest', NOW, 7);
  // The first visit was 10 days before the last one: past the 7 days chosen.
  assert.deepEqual(
    state.entries.map((e) => e.title),
    ['New', 'Newest'],
  );
  assert.equal(pruneHistory(state, NOW + 6 * DAY, 7).entries.length, 1);
  assert.equal(parseHistory(state, NOW + 30 * DAY, 90).entries.length, 2);
  assert.equal(parseHistory(state, NOW + 30 * DAY, 7).entries.length, 0);
});
