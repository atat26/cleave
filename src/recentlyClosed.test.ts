import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearClosed,
  defaultClosed,
  MAX_CLOSED_TABS,
  parseClosed,
  recordClosed,
  takeClosedById,
  takeLastClosed,
} from './recentlyClosed.ts';

const tab = (name: string, spaceId: number | null = null) => ({
  url: `https://${name}.example/`,
  title: name.toUpperCase(),
  spaceId,
});

test('a closed tab is remembered with its Space, and the newest comes back first', () => {
  let state = recordClosed(defaultClosed(), tab('a', 3), 1);
  state = recordClosed(state, tab('b'), 2);
  const first = takeLastClosed(state)!;
  assert.equal(first.tab.title, 'B');
  assert.equal(first.tab.spaceId, null);
  const second = takeLastClosed(first.state)!;
  assert.equal(second.tab.title, 'A');
  assert.equal(second.tab.spaceId, 3);
  assert.equal(takeLastClosed(second.state), null);
});

test('only ordinary web pages are kept', () => {
  const state = defaultClosed();
  assert.equal(
    recordClosed(state, { url: 'about:blank', title: '', spaceId: null }, 1),
    state,
  );
  assert.equal(
    recordClosed(state, { url: 'file:///c:/a', title: '', spaceId: null }, 1),
    state,
  );
});

test('closing the same page again moves it to the front instead of repeating it', () => {
  let state = recordClosed(defaultClosed(), tab('a'), 1);
  state = recordClosed(state, tab('b'), 2);
  state = recordClosed(state, tab('a'), 3);
  assert.deepEqual(
    state.tabs.map((t) => t.title),
    ['B', 'A'],
  );
  // The same page in a different Space is a different entry.
  state = recordClosed(state, tab('a', 7), 4);
  assert.deepEqual(
    state.tabs.map((t) => t.title),
    ['B', 'A', 'A'],
  );
});

test('only the last 25 are kept', () => {
  let state = defaultClosed();
  for (let i = 0; i < MAX_CLOSED_TABS + 3; i++) {
    state = recordClosed(state, tab(`s${i}`), i);
  }
  assert.equal(state.tabs.length, MAX_CLOSED_TABS);
  assert.equal(state.tabs[0].title, 'S3');
});

test('a particular closed tab can be taken, and the list cleared', () => {
  let state = recordClosed(defaultClosed(), tab('a'), 1);
  state = recordClosed(state, tab('b'), 2);
  const wanted = state.tabs[0];
  const taken = takeClosedById(state, wanted.id)!;
  assert.equal(taken.tab.title, 'A');
  assert.deepEqual(
    taken.state.tabs.map((t) => t.title),
    ['B'],
  );
  assert.equal(takeClosedById(state, 999), null);
  assert.equal(clearClosed(state).tabs.length, 0);
  assert.equal(clearClosed(defaultClosed()).tabs.length, 0);
});

test('junk on disk is dropped, good entries survive', () => {
  const parsed = parseClosed({
    nextId: 5,
    tabs: [
      {
        id: 1,
        url: 'https://a.example/',
        title: 'A',
        spaceId: 2,
        closedAt: 10,
      },
      { id: 2, url: 'about:blank', title: 'Bad', spaceId: null, closedAt: 10 },
      {
        id: 1,
        url: 'https://dup.example/',
        title: 'Dup',
        spaceId: null,
        closedAt: 10,
      },
      {
        id: 3,
        url: 'https://c.example/',
        title: 'C',
        spaceId: 'x',
        closedAt: 'later',
      },
      'junk',
    ],
  });
  assert.deepEqual(
    parsed.tabs.map((t) => t.title),
    ['A', 'C'],
  );
  assert.equal(parsed.tabs[1].spaceId, null);
  assert.ok(parsed.nextId >= 5);
  for (const junk of [null, 5, 'x', [], {}, { tabs: 'no' }]) {
    assert.equal(parseClosed(junk).tabs.length, 0);
  }
});
