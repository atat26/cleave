import assert from 'node:assert/strict';
import { test } from 'node:test';
import { menuIds } from './menuTypes.ts';
import type { MenuEntry } from './menuTypes.ts';
import {
  addSpace,
  addTab,
  closeTab,
  defaultState,
  setActive,
} from './model.ts';
import type { ClosedTab } from './recentlyClosed.ts';
import {
  filterTabSearch,
  MAX_CLOSED_SHOWN,
  parseTabSearchChoice,
  tabSearchItems,
} from './tabSearch.ts';

function build() {
  let state = defaultState();
  const space = addSpace(state);
  state = space.state;
  const loose = addTab(state, { url: 'https://www.news.example/today' });
  const work = addTab(loose.state, {
    url: 'https://docs.work.example/plan',
    spaceId: space.id,
  });
  state = setActive(work.state, { kind: 'tab', id: work.id });
  return { state, loose: loose.id, work: work.id, spaceId: space.id };
}

const closed = (id: number, url: string, title: string): ClosedTab => ({
  id,
  url,
  title,
  spaceId: null,
  closedAt: id,
});

test('open tabs come first (loose ones, then each Space), then recently closed, newest first', () => {
  const { state, loose, work } = build();
  const items = tabSearchItems(state, [
    closed(1, 'https://old.example/', 'Old page'),
    closed(2, 'https://newer.example/', 'Newer page'),
  ]);
  assert.deepEqual(menuIds(items), [
    `tabsearch.open:${loose}`,
    `tabsearch.open:${work}`,
    'tabsearch.closed:2',
    'tabsearch.closed:1',
  ]);
  const headers = items.filter((i) => i.type === 'header');
  assert.deepEqual(
    headers.map((h) => (h as { label: string }).label),
    ['Open tabs', 'Recently closed'],
  );
});

test('a row names the page and its site, and marks the tab you are on', () => {
  const { state, loose, work } = build();
  const items = tabSearchItems(state, []);
  const find = (id: number) =>
    items.find(
      (i) => i.type === 'item' && i.id === `tabsearch.open:${id}`,
    ) as MenuEntry;
  assert.equal(find(loose).detail, 'news.example');
  assert.equal(find(loose).label, 'news.example');
  assert.equal(find(loose).checked, false);
  assert.equal(find(work).checked, true);
  assert.ok(find(work).detail?.startsWith('docs.work.example · '));
});

test('a closed link in a Space is not an open tab, and only so many closed tabs are offered', () => {
  const { state, work } = build();
  const withClosedLink = closeTab(state, work);
  assert.ok(
    !menuIds(tabSearchItems(withClosedLink, [])).includes(
      `tabsearch.open:${work}`,
    ),
  );
  const many = Array.from({ length: 30 }, (_, i) =>
    closed(i + 1, `https://s${i}.com/`, `S${i}`),
  );
  const rows = menuIds(tabSearchItems(defaultState(), many));
  assert.equal(rows.length, MAX_CLOSED_SHOWN);
  assert.equal(rows[0], 'tabsearch.closed:30');
});

test('typing keeps the rows where every word matches, and drops headings with no rows', () => {
  const { state, loose, work } = build();
  const items = tabSearchItems(state, [
    closed(1, 'https://old.example/', 'Old page'),
  ]);
  assert.deepEqual(filterTabSearch(items, ''), items);
  assert.deepEqual(menuIds(filterTabSearch(items, 'WORK docs')), [
    `tabsearch.open:${work}`,
  ]);
  assert.deepEqual(menuIds(filterTabSearch(items, 'news')), [
    `tabsearch.open:${loose}`,
  ]);
  const onlyClosed = filterTabSearch(items, 'old');
  assert.deepEqual(menuIds(onlyClosed), ['tabsearch.closed:1']);
  assert.equal(onlyClosed.filter((i) => i.type === 'header').length, 1);
  assert.deepEqual(filterTabSearch(items, 'zzzz'), []);
});

test('only the two kinds of row can be chosen', () => {
  assert.deepEqual(parseTabSearchChoice('tabsearch.open:7'), {
    kind: 'open',
    id: 7,
  });
  assert.deepEqual(parseTabSearchChoice('tabsearch.closed:12'), {
    kind: 'closed',
    id: 12,
  });
  for (const bad of [
    '',
    'tabsearch.open:x',
    'tabsearch.other:1',
    'tab.close',
  ]) {
    assert.equal(parseTabSearchChoice(bad), null, bad);
  }
});
