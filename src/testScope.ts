// For the AI prompt pipeline inspection only (docs/pipeline/): with AIB_TEST_SCOPE=1 the assistant's
// tools see only the test fixtures, so a test run never sends the owner's real tabs, Spaces,
// history, bookmarks or chats to a model provider (the recall tools search a small made-up set instead), and never changes them. Off in normal use.
//
// In scope: tabs whose address is on the fixture server, and Spaces made during the test (by the
// assistant, or named "Test Space ..."). Everything else is hidden from the tools (and cannot be
// changed through them). Pure code with no Electron, so it is easy to test.
import type { SpaceRow, TabChange, TabRow, TabsEnv } from './tabTools.ts';
import type { RecallEnv } from './recallTools.ts';
import { looseSearch } from './looseSearch.ts';

export const TEST_ORIGIN = 'http://127.0.0.1:5290/';
export const TEST_SPACE_PREFIX = 'Test Space';

export interface TestScope {
  // Spaces the assistant created during this run of the app.
  created: Set<number>;
  tabs<T extends { url: string }>(rows: T[]): T[];
  spaces<T extends { id: number; name: string }>(rows: T[]): T[];
}

export function createTestScope(): TestScope {
  const created = new Set<number>();
  return {
    created,
    tabs: (rows) => rows.filter((row) => row.url.startsWith(TEST_ORIGIN)),
    spaces: (rows) =>
      rows.filter(
        (row) => created.has(row.id) || row.name.startsWith(TEST_SPACE_PREFIX),
      ),
  };
}

// The scope for this run of the app: null unless AIB_TEST_SCOPE=1.
export const testScope: TestScope | null =
  typeof process !== 'undefined' && process.env?.AIB_TEST_SCOPE === '1'
    ? createTestScope()
    : null;

const NO_TAB: TabChange = { ok: false, reason: 'no-tab' };
const NO_SPACE: TabChange = { ok: false, reason: 'no-space' };

// The tab and Space tools, seeing only what is in scope.
export function scopedTabs(
  scope: TestScope,
  store: Omit<TabsEnv, 'linkedSpaces'>,
): Omit<TabsEnv, 'linkedSpaces'> {
  const tabRows = (): TabRow[] => scope.tabs(store.allTabs());
  const spaceRows = (): SpaceRow[] => scope.spaces(store.allSpaces());
  const tabOk = (id: number) => tabRows().some((row) => row.id === id);
  const spaceOk = (id: number) => spaceRows().some((row) => row.id === id);
  return {
    allTabs: tabRows,
    allSpaces: spaceRows,
    moveTab: (tabId, spaceId) =>
      !tabOk(tabId)
        ? NO_TAB
        : spaceId !== null && !spaceOk(spaceId)
          ? NO_SPACE
          : store.moveTab(tabId, spaceId),
    closeTab: (id) => (tabOk(id) ? store.closeTab(id) : NO_TAB),
    sleepTab: (id) => (tabOk(id) ? store.sleepTab(id) : NO_TAB),
    reopenTab: (id) => (tabOk(id) ? store.reopenTab(id) : NO_TAB),
    spaceNote: (id) => (spaceOk(id) ? store.spaceNote(id) : null),
    setSpaceNote: (id, text) =>
      spaceOk(id) ? store.setSpaceNote(id, text) : { ok: false },
  };
}

// The owner's own data is never searched in a test run. Instead the recall tools search this small
// made-up set (the same pages as FACTS.history in tests/pipeline/fixtures.mjs), so a scenario about
// "my history" can be run and checked without any of the owner's real history, bookmarks or chats.
const DAY = 86_400_000;
const FAKE_HISTORY = [
  {
    title: 'Top 3 Graphics Cards from eBay Search',
    url: 'https://shop.example/gpus',
    daysAgo: 3,
  },
  {
    title: 'Nvidia Tesla K80 for sale',
    url: 'https://shop.example/tesla',
    daysAgo: 4,
  },
  {
    title: 'Best Buy Store Locator',
    url: 'https://stores.example/',
    daysAgo: 9,
  },
];
const FAKE_BOOKMARKS = [
  {
    title: 'Trail running shoe reviews',
    url: 'https://runners.example/shoes',
    daysAgo: 20,
  },
];
const FAKE_CHAT = {
  id: 9001,
  title: 'Planning a weekend in Lisbon',
  daysAgo: 6,
  messages: [
    { role: 'user' as const, text: 'Help me plan two days in Lisbon.' },
    {
      role: 'assistant' as const,
      text: 'Day one: Alfama and the castle. Day two: Belem and the pastry shop.',
    },
  ],
};

// The words of a query must all be in the title or address (case does not matter).
const matches = (query: string, ...texts: string[]) => {
  const hay = texts.join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
};

// The recall tools, searching only the made-up set above.
export function scopedRecall(
  store: Omit<RecallEnv, 'currentChatId'>,
): Omit<RecallEnv, 'currentChatId'> {
  const at = (daysAgo: number) => store.now() - daysAgo * DAY;
  return {
    now: store.now,
    // The same forgiving search as the real one (looseSearch.ts), over the made-up pages.
    searchHistory: (query, limit, since) =>
      looseSearch(
        FAKE_HISTORY.map((p) => ({ ...p, at: at(p.daysAgo) })),
        query,
        (p) => `${p.title} ${p.url}`,
        (p) => p.at,
        limit,
        since,
      ).map((p) => ({ title: p.title, url: p.url, at: p.at })),
    searchBookmarks: (query, limit, since) =>
      looseSearch(
        FAKE_BOOKMARKS.map((p) => ({ ...p, at: at(p.daysAgo) })),
        query,
        (p) => `${p.title} ${p.url}`,
        (p) => p.at,
        limit,
        since,
      ).map((p) => ({ title: p.title, url: p.url, at: p.at })),
    searchChats: (query, limit) =>
      matches(query, FAKE_CHAT.title, ...FAKE_CHAT.messages.map((m) => m.text))
        ? [
            {
              id: FAKE_CHAT.id,
              title: FAKE_CHAT.title,
              at: at(FAKE_CHAT.daysAgo),
              snippet: null,
            },
          ].slice(0, limit)
        : [],
    readChat: (id) =>
      id === FAKE_CHAT.id
        ? {
            title: FAKE_CHAT.title,
            at: at(FAKE_CHAT.daysAgo),
            messages: FAKE_CHAT.messages,
          }
        : null,
  };
}
