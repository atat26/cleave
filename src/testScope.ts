// For the AI prompt pipeline inspection only (docs/pipeline/): with AIB_TEST_SCOPE=1 the assistant's
// tools see only the test fixtures, so a test run never sends the owner's real tabs, Spaces,
// history, bookmarks or chats to a model provider, and never changes them. Off in normal use.
//
// In scope: tabs whose address is on the fixture server, and Spaces made during the test (by the
// assistant, or named "Test Space ..."). Everything else is hidden from the tools (and cannot be
// changed through them). Pure code with no Electron, so it is easy to test.
import type { SpaceRow, TabChange, TabRow, TabsEnv } from './tabTools.ts';
import type { RecallEnv } from './recallTools.ts';

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

// The recall tools, with nothing of the owner's to find.
export function scopedRecall(
  store: Omit<RecallEnv, 'currentChatId'>,
): Omit<RecallEnv, 'currentChatId'> {
  return {
    now: store.now,
    searchHistory: () => [],
    searchBookmarks: () => [],
    searchChats: () => [],
    readChat: () => null,
  };
}
