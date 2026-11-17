import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addUserMessage, defaultChats, newConversation } from './chats.ts';
import { menuIds } from './menuTypes.ts';
import type { MenuEntry, MenuItem } from './menuTypes.ts';
import {
  addSpace,
  addTab,
  closeTab,
  defaultState,
  setActive,
  updateTab,
} from './model.ts';
import {
  EMPTY_PER_GROUP,
  parseQuickChoice,
  quickSearchItems,
  TYPED_PER_GROUP,
} from './quickSearch.ts';
import type { QuickSources } from './quickSearch.ts';

function sources(): QuickSources & { tabIds: Record<string, number> } {
  let state = defaultState();
  const space = addSpace(state);
  state = space.state;
  const news = addTab(state, { url: 'https://www.news.example/today' });
  const docs = addTab(news.state, {
    url: 'https://docs.work.example/plan',
    spaceId: space.id,
  });
  const kept = addTab(docs.state, {
    url: 'https://kept.example/page',
    spaceId: space.id,
  });
  state = updateTab(kept.state, news.id, { title: 'Daily news' });
  state = updateTab(state, docs.id, { title: 'Project plan' });
  state = updateTab(state, kept.id, { title: 'Kept recipe' });
  state = closeTab(state, kept.id);
  state = setActive(state, { kind: 'tab', id: docs.id });

  let chats = newConversation(defaultChats(1), 1);
  const said = addUserMessage(
    chats.state,
    chats.id,
    'How do I bake sourdough bread?',
    2,
  );
  assert.ok(said);
  return {
    state,
    closed: [
      {
        id: 1,
        url: 'https://old.example/',
        title: 'Old page',
        spaceId: null,
        closedAt: 1,
      },
      {
        id: 2,
        url: 'https://newer.example/',
        title: 'Newer page',
        spaceId: null,
        closedAt: 2,
      },
    ],
    artifacts: [
      {
        id: 7,
        title: 'Packing list',
        kind: 'markdown',
        emoji: null,
        spaceId: space.id,
        content: 'Tent, stove and a sourdough starter',
        updatedAt: 5,
      },
      {
        id: 8,
        title: 'Budget',
        kind: 'markdown',
        emoji: null,
        spaceId: null,
        content: 'Rent 1000',
        updatedAt: 6,
      },
    ],
    chats: said.state,
    history: [
      {
        id: 1,
        url: 'https://history.example/a',
        title: 'Old history page',
        visitedAt: 1,
      },
      {
        id: 2,
        url: 'https://www.news.example/today',
        title: 'Daily news',
        visitedAt: 2,
      },
    ],
    bookmarks: [
      {
        id: 1,
        url: 'https://marks.example/tools',
        title: 'Handy tools',
        addedAt: 1,
      },
    ],
    engineName: 'DuckDuckGo',
    tabIds: { news: news.id, docs: docs.id, kept: kept.id, space: space.id },
  };
}

const entries = (items: MenuItem[]) =>
  items.filter((i): i is MenuEntry => i.type === 'item');
const headers = (items: MenuItem[]) =>
  items.flatMap((i) => (i.type === 'header' ? [i.label] : []));

test('with nothing typed it shows the most recent of each group, and no go / search / ask rows', () => {
  const s = sources();
  const items = quickSearchItems('', s);
  assert.deepEqual(headers(items), [
    'Open tabs',
    'Closed pages',
    'Spaces',
    'Artifacts',
    'Chats',
  ]);
  const ids = menuIds(items);
  assert.ok(!ids.some((id) => /^quick\.(go|search|ask)/.test(id)));
  assert.ok(ids.includes(`quick.tab:${s.tabIds.news}`));
  // Bookmarks and history are long lists: only when something is typed.
  assert.ok(!ids.some((id) => id.startsWith('quick.page:')));
});

test('a group is capped: a few with nothing typed, more once you type', () => {
  const s = sources();
  const many = {
    ...s,
    history: Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      url: `https://site${i}.example/page`,
      title: `Page ${i}`,
      visitedAt: i,
    })),
    closed: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      url: `https://c${i}.example/`,
      title: `Closed ${i}`,
      spaceId: null,
      closedAt: i,
    })),
  };
  const empty = entries(quickSearchItems('', many)).filter((i) =>
    i.id.startsWith('quick.closed:'),
  );
  // The group also holds the page kept in a Space, so one closed row less.
  assert.equal(empty.length, EMPTY_PER_GROUP - 1);
  const typed = entries(quickSearchItems('page', many)).filter((i) =>
    i.id.startsWith('quick.page:'),
  );
  assert.equal(typed.length, TYPED_PER_GROUP);
  const closedTyped = entries(quickSearchItems('closed', many)).filter((i) =>
    i.id.startsWith('quick.closed:'),
  );
  assert.equal(closedTyped.length, TYPED_PER_GROUP);
  // Recently closed: newest first.
  assert.equal(closedTyped[0].id, 'quick.closed:12');
});

test('typed text gives Search and Ask first, and Go to only when it looks like an address', () => {
  const s = sources();
  const words = entries(quickSearchItems('best pizza', s));
  assert.deepEqual(
    words.slice(0, 2).map((i) => i.id),
    ['quick.search:best pizza', 'quick.ask:best pizza'],
  );
  assert.equal(words[0].detail, 'Search with DuckDuckGo');
  const address = entries(quickSearchItems('example.com/path', s));
  assert.deepEqual(
    address.slice(0, 3).map((i) => i.id),
    [
      'quick.go:example.com/path',
      'quick.search:example.com/path',
      'quick.ask:example.com/path',
    ],
  );
  // Spaces in what was typed are tidied.
  assert.equal(
    entries(quickSearchItems('  best   pizza ', s))[0].id,
    'quick.search:best pizza',
  );
});

test('tabs match by name or site, mark the one you are on, and keep kept pages separate', () => {
  const s = sources();
  const plan = entries(quickSearchItems('plan', s));
  const row = plan.find((i) => i.id === `quick.tab:${s.tabIds.docs}`);
  assert.ok(row);
  assert.equal(row.checked, true);
  assert.ok(row.detail?.startsWith('docs.work.example'));
  assert.ok(
    entries(quickSearchItems('news.example', s)).some(
      (i) => i.id === `quick.tab:${s.tabIds.news}`,
    ),
  );
  // A page kept in a Space with no tab is under Closed pages and opens again.
  const kept = quickSearchItems('recipe', s);
  assert.deepEqual(headers(kept).slice(-1), ['Closed pages']);
  const keptRow = entries(kept).find(
    (i) => i.id === `quick.tab:${s.tabIds.kept}`,
  );
  assert.ok(keptRow?.detail?.startsWith('Open again'));
  // Every word has to match.
  assert.ok(
    !entries(quickSearchItems('plan zzz', s)).some((i) =>
      i.id.startsWith('quick.tab:'),
    ),
  );
});

test('artifacts match by name, then by what they say (with a piece of the text)', () => {
  const s = sources();
  const byName = entries(quickSearchItems('packing', s)).find(
    (i) => i.id === 'quick.artifact:7',
  );
  assert.equal(byName?.detail?.startsWith('Artifact'), true);
  const byText = entries(quickSearchItems('stove', s)).find(
    (i) => i.id === 'quick.artifact:7',
  );
  assert.ok(byText?.detail?.includes('stove'));
  assert.ok(
    !entries(quickSearchItems('stove', s)).some(
      (i) => i.id === 'quick.artifact:8',
    ),
  );
});

test('chats match by name and by what was said, with a snippet', () => {
  const s = sources();
  const row = entries(quickSearchItems('sourdough', s)).find((i) =>
    i.id.startsWith('quick.chat:'),
  );
  assert.ok(row);
  assert.ok(row.detail?.includes('sourdough'));
  // A chat nothing has happened in is not offered.
  const empty = { ...s, chats: newConversation(defaultChats(1), 1).state };
  assert.ok(
    !entries(quickSearchItems('', empty)).some((i) =>
      i.id.startsWith('quick.chat:'),
    ),
  );
});

test('bookmarks and history match, and a page already listed is not repeated', () => {
  const s = sources();
  const items = entries(quickSearchItems('tools', s));
  assert.ok(
    items.some((i) => i.id === 'quick.page:https://marks.example/tools'),
  );
  const news = entries(quickSearchItems('news', s));
  // The open tab shows; the same page from history does not come again.
  assert.equal(news.filter((i) => i.label === 'Daily news').length, 1);
  const old = entries(quickSearchItems('history', s)).find((i) =>
    i.id.startsWith('quick.page:'),
  );
  assert.equal(old?.id, 'quick.page:https://history.example/a');
});

test('a Space matches by name', () => {
  const s = sources();
  const name = s.state.spaces[0].name;
  const row = entries(quickSearchItems(name.toLowerCase(), s)).find(
    (i) => i.id === `quick.space:${s.tabIds.space}`,
  );
  assert.ok(row);
});

test('a chosen row is read back into what to do, and odd ids are refused', () => {
  assert.deepEqual(parseQuickChoice('quick.go:example.com'), {
    kind: 'go',
    text: 'example.com',
  });
  assert.deepEqual(parseQuickChoice('quick.search:best pizza'), {
    kind: 'search',
    text: 'best pizza',
  });
  assert.deepEqual(parseQuickChoice('quick.ask:what: is this?'), {
    kind: 'ask',
    text: 'what: is this?',
  });
  assert.deepEqual(parseQuickChoice('quick.page:https://a.example/x'), {
    kind: 'page',
    url: 'https://a.example/x',
  });
  assert.deepEqual(parseQuickChoice('quick.tab:4'), { kind: 'tab', id: 4 });
  assert.deepEqual(parseQuickChoice('quick.closed:2'), {
    kind: 'closed',
    id: 2,
  });
  assert.deepEqual(parseQuickChoice('quick.chat:9'), { kind: 'chat', id: 9 });
  assert.equal(parseQuickChoice('quick.tab:x'), null);
  assert.equal(parseQuickChoice('quick.go:   '), null);
  assert.equal(parseQuickChoice('menu.other'), null);
  assert.equal(parseQuickChoice(5), null);
  assert.equal(parseQuickChoice(`quick.ask:${'x'.repeat(2000)}`), null);
});
