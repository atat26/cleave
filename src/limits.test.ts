import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addTab,
  defaultState,
  LOAD_MAX_SPACES,
  LOAD_MAX_TABS,
  MAX_SPACES,
  MAX_TABS,
  parseState,
} from './model.ts';
import { addRef, defaultChats, retargetEverywhere } from './chats.ts';
import {
  defaultSpaceTrash,
  MAX_TRASHED_PAGES,
  parseSpaceTrash,
  trashSpace,
} from './spaceTrash.ts';

const space = (id: number) => ({ id, name: `Space ${id}` });
const tab = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  url: `https://example.com/${id}`,
  title: `Page ${id}`,
  favicon: null,
  spaceId: null,
  closed: false,
  ...over,
});

test('nothing you have is dropped at start: well over the old limits all load', () => {
  const tabs = Array.from({ length: MAX_TABS + 500 }, (_, i) => tab(i + 1));
  const spaces = Array.from({ length: MAX_SPACES + 100 }, (_, i) =>
    space(10_000 + i),
  );
  const state = parseState({ version: 1, spaces, tabs, nextId: 20_000 });
  assert.equal(state.tabs.length, MAX_TABS + 500);
  assert.equal(state.spaces.length, MAX_SPACES + 100);
  // The newest are still there (they used to be the ones that vanished).
  assert.equal(state.tabs.at(-1)?.id, MAX_TABS + 500);
  assert.equal(state.spaces.at(-1)?.id, 10_000 + MAX_SPACES + 99);
});

test('a damaged or hostile file is still bounded', () => {
  const tabs = Array.from({ length: LOAD_MAX_TABS + 50 }, (_, i) => tab(i + 1));
  const spaces = Array.from({ length: LOAD_MAX_SPACES + 50 }, (_, i) =>
    space(100_000 + i),
  );
  const state = parseState({ version: 1, spaces, tabs });
  assert.equal(state.tabs.length, LOAD_MAX_TABS);
  assert.equal(state.spaces.length, LOAD_MAX_SPACES);
});

test('at the limit a new tab lets go of the oldest closed link, never of an open page', () => {
  const spaceId = 7;
  const tabs = Array.from({ length: MAX_TABS }, (_, i) =>
    // Every tenth is a closed link kept in the Space.
    i % 10 === 0 ? tab(i + 1, { spaceId, closed: true }) : tab(i + 1),
  );
  const state = parseState({
    version: 1,
    spaces: [space(spaceId)],
    tabs,
    nextId: MAX_TABS + 10,
  });
  assert.equal(state.tabs.length, MAX_TABS);
  const added = addTab(state, { url: 'https://new.example/' });
  assert.equal(added.state.tabs.length, MAX_TABS, 'still at the limit');
  assert.ok(
    !added.state.tabs.some((t) => t.id === 1),
    'the oldest closed link (tab 1) was let go',
  );
  assert.ok(
    added.state.tabs.some((t) => t.id === 11),
    'the next one is kept',
  );
  assert.equal(added.state.tabs.at(-1)?.id, added.id);
  // Every open page is still there.
  const open = (s: typeof state) => s.tabs.filter((t) => !t.closed).length;
  assert.equal(open(added.state), open(state) + 1);
});

test('with no closed link to let go of, a new tab is added anyway (open pages are never dropped)', () => {
  const tabs = Array.from({ length: MAX_TABS }, (_, i) => tab(i + 1));
  const state = parseState({ version: 1, spaces: [], tabs });
  const added = addTab(state, { url: 'https://new.example/' });
  assert.equal(added.state.tabs.length, MAX_TABS + 1);
  // Below the limit nothing is let go.
  const small = addTab(defaultState(), { url: 'https://a.example/' });
  assert.equal(small.state.tabs.length, defaultState().tabs.length + 1);
});

// ---- Recently deleted Spaces ----------------------------------------------------------

test('deleting a big Space keeps every page and long addresses, and remembers its number', () => {
  const pages = Array.from({ length: MAX_TRASHED_PAGES - 1 }, (_, i) => ({
    title: `Page ${i}`,
    url: `https://example.com/${i}`,
  }));
  pages.push({
    title: 'A long sign-in address',
    url: `https://example.com/oauth?state=${'a'.repeat(3500)}`,
  });
  const trash = trashSpace(
    defaultSpaceTrash(),
    {
      spaceId: 42,
      name: 'Big',
      color: 'blue',
      emoji: null,
      about: '',
      pages,
      artifactIds: [],
    },
    1000,
  );
  const item = trash.items[0];
  assert.equal(item.spaceId, 42);
  assert.equal(item.pages.length, MAX_TRASHED_PAGES);
  // Saved and read back (the trash is a file): still whole.
  const back = parseSpaceTrash(JSON.parse(JSON.stringify(trash)));
  assert.equal(back.items[0].pages.length, MAX_TRASHED_PAGES);
  assert.equal(back.items[0].spaceId, 42);
  assert.ok(back.items[0].pages.some((p) => p.url.length > 3500));
});

test('a Space put away by an older version has no remembered number, and a bad one is ignored', () => {
  const old = parseSpaceTrash({
    nextId: 3,
    items: [
      { id: 1, name: 'Old', pages: [] },
      { id: 2, name: 'Odd', spaceId: -4, pages: [] },
      { id: 3, name: 'Good', spaceId: 9, pages: [] },
    ],
  });
  assert.deepEqual(
    old.items.map((i) => i.spaceId),
    [null, null, 9],
  );
});

test('bringing a Space back relinks the chats that were linked to it', () => {
  let chats = defaultChats(1);
  const chatId = chats.activeId;
  chats = addRef(chats, chatId, {
    kind: 'space',
    id: 7,
    title: 'Trip',
    url: null,
  });
  // The Space is brought back as a new Space (number 31).
  const relinked = retargetEverywhere(chats, 'space', 7, {
    id: 31,
    title: 'Trip',
    url: null,
  });
  const refs = relinked.conversations[0].refs;
  assert.deepEqual(
    refs.map((r) => [r.kind, r.id]),
    [['space', 31]],
  );
});
