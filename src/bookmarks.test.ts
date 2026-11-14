import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addBookmark,
  defaultBookmarks,
  isBookmarked,
  MAX_BOOKMARKS,
  parseBookmarks,
  removeBookmark,
  removeBookmarkByUrl,
  searchBookmarks,
} from './bookmarks.ts';

test('a web page can be bookmarked once, and is found again by its address', () => {
  let state = addBookmark(
    defaultBookmarks(),
    'https://a.example/x?y=1#top',
    ' A  page\n',
    5,
  );
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].title, 'A page');
  assert.equal(state.items[0].url, 'https://a.example/x?y=1');
  assert.equal(isBookmarked(state, 'https://a.example/x?y=1'), true);
  // The # part and credentials do not make it a different page.
  assert.equal(isBookmarked(state, 'https://u:p@a.example/x?y=1#other'), true);
  assert.equal(isBookmarked(state, 'https://a.example/other'), false);
  assert.equal(
    addBookmark(state, 'https://a.example/x?y=1#again', 'Again', 9),
    state,
  );
});

test('anything that is not a web page is not bookmarked', () => {
  const state = defaultBookmarks();
  for (const bad of ['about:blank', 'file:///c:/a', 'junk', '', null, 5]) {
    assert.equal(addBookmark(state, bad, 'x', 1), state);
    assert.equal(isBookmarked(state, bad), false);
  }
});

test('a bookmark can be removed by address or by id', () => {
  let state = addBookmark(defaultBookmarks(), 'https://a.example/', 'A', 1);
  state = addBookmark(state, 'https://b.example/', 'B', 2);
  assert.deepEqual(
    removeBookmarkByUrl(state, 'https://a.example/#x').items.map(
      (b) => b.title,
    ),
    ['B'],
  );
  assert.deepEqual(
    removeBookmark(state, state.items[1].id).items.map((b) => b.title),
    ['A'],
  );
  assert.equal(removeBookmarkByUrl(state, 'https://zzz.example/'), state);
  assert.equal(removeBookmark(state, 999), state);
});

test('search needs every word, in the title or the address, newest first', () => {
  let state = defaultBookmarks();
  state = addBookmark(
    state,
    'https://docs.example/models',
    'Models overview',
    1,
  );
  state = addBookmark(state, 'https://shop.example/gpu', 'Graphics cards', 2);
  state = addBookmark(state, 'https://docs.example/pricing', 'Pricing', 3);
  assert.deepEqual(
    searchBookmarks(state, 'docs').map((b) => b.title),
    ['Pricing', 'Models overview'],
  );
  assert.deepEqual(
    searchBookmarks(state, 'docs models').map((b) => b.title),
    ['Models overview'],
  );
  assert.equal(searchBookmarks(state, 'nothing here').length, 0);
  assert.equal(searchBookmarks(state, '', 2).length, 2);
});

test('the list stops at its limit', () => {
  let state = defaultBookmarks();
  for (let i = 0; i < MAX_BOOKMARKS + 5; i++) {
    state = addBookmark(state, `https://s${i}.example/`, 't', i);
  }
  assert.equal(state.items.length, MAX_BOOKMARKS);
});

test('junk on disk is dropped, good entries and a repeated page survive once', () => {
  const parsed = parseBookmarks({
    nextId: 3,
    items: [
      { id: 1, url: 'https://a.example/', title: 'A', addedAt: 10 },
      { id: 1, url: 'https://dup-id.example/', title: 'Dup id', addedAt: 10 },
      {
        id: 2,
        url: 'https://a.example/#section',
        title: 'Same page',
        addedAt: 11,
      },
      { id: 3, url: 'about:blank', title: 'Bad', addedAt: 12 },
      { id: 'x', url: 'https://c.example/', title: 'C' },
      { id: 4, url: 'https://d.example/', title: 'D', addedAt: 'later' },
      'junk',
    ],
  });
  assert.deepEqual(
    parsed.items.map((b) => b.title),
    ['A', 'D'],
  );
  assert.equal(parsed.items[1].addedAt, 0);
  assert.ok(parsed.nextId >= 5);
  for (const junk of [null, 5, 'x', [], {}, { items: 'no' }]) {
    assert.equal(parseBookmarks(junk).items.length, 0);
  }
});
