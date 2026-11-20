import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTestScope,
  scopedRecall,
  scopedTabs,
  TEST_ORIGIN,
  testScope,
} from './testScope.ts';
import type { SpaceRow, TabRow, TabsEnv } from './tabTools.ts';

const tab = (
  id: number,
  url: string,
  spaceId: number | null = null,
): TabRow => ({
  id,
  title: `Tab ${id}`,
  url,
  spaceId,
  closed: false,
  asleep: false,
  active: false,
});
const space = (id: number, name: string): SpaceRow => ({
  id,
  name,
  emoji: '📁',
  hasNote: false,
});

function fakeStore() {
  const calls: string[] = [];
  const store: Omit<TabsEnv, 'linkedSpaces'> = {
    allTabs: () => [
      tab(1, 'https://real.example/mine'),
      tab(2, `${TEST_ORIGIN}article`),
      tab(3, `${TEST_ORIGIN}form`, 20),
    ],
    allSpaces: () => [
      space(10, 'Shopping'),
      space(20, 'Test Space Reading'),
      space(30, 'Made by the assistant'),
    ],
    moveTab: (t, s) => (calls.push(`move ${t}->${s}`), { ok: true }),
    closeTab: (t) => (calls.push(`close ${t}`), { ok: true }),
    sleepTab: (t) => (calls.push(`sleep ${t}`), { ok: true }),
    reopenTab: (t) => (calls.push(`reopen ${t}`), { ok: true }),
    spaceNote: (id) => `note of ${id}`,
    setSpaceNote: (id) => (calls.push(`note ${id}`), { ok: true }),
  };
  return { store, calls };
}

test('off unless AIB_TEST_SCOPE=1', () => {
  assert.equal(testScope, null);
});

test('only fixture tabs and test Spaces are visible', () => {
  const scope = createTestScope();
  const { store } = fakeStore();
  const scoped = scopedTabs(scope, store);
  assert.deepEqual(
    scoped.allTabs().map((t) => t.id),
    [2, 3],
  );
  // Real Spaces are hidden, a test-named one is shown, and one the assistant made appears once made.
  assert.deepEqual(
    scoped.allSpaces().map((s) => s.id),
    [20],
  );
  scope.created.add(30);
  assert.deepEqual(
    scoped.allSpaces().map((s) => s.id),
    [20, 30],
  );
});

test('what is out of scope cannot be changed or read through the tools', () => {
  const scope = createTestScope();
  const { store, calls } = fakeStore();
  const scoped = scopedTabs(scope, store);
  // A real tab cannot be moved, closed or slept, and a real Space cannot be moved into.
  assert.deepEqual(scoped.moveTab(1, 20), { ok: false, reason: 'no-tab' });
  assert.deepEqual(scoped.moveTab(2, 10), { ok: false, reason: 'no-space' });
  assert.deepEqual(scoped.closeTab(1), { ok: false, reason: 'no-tab' });
  assert.deepEqual(scoped.sleepTab(1), { ok: false, reason: 'no-tab' });
  assert.deepEqual(scoped.reopenTab(1), { ok: false, reason: 'no-tab' });
  assert.equal(scoped.spaceNote(10), null);
  assert.deepEqual(scoped.setSpaceNote(10, 'x'), { ok: false });
  assert.deepEqual(calls, []);
  // In scope, they go through.
  assert.deepEqual(scoped.moveTab(2, 20), { ok: true });
  assert.deepEqual(scoped.moveTab(2, null), { ok: true });
  assert.deepEqual(scoped.closeTab(3), { ok: true });
  assert.equal(scoped.spaceNote(20), 'note of 20');
  assert.deepEqual(scoped.setSpaceNote(20, 'hello'), { ok: true });
  assert.deepEqual(calls, ['move 2->20', 'move 2->null', 'close 3', 'note 20']);
});

test("the recall tools find nothing of the owner's", () => {
  const recall = scopedRecall({
    now: () => 5,
    searchHistory: () => [{ title: 't', url: 'u', visitedAt: 1 } as never],
    searchBookmarks: () => [{ title: 't', url: 'u' } as never],
    searchChats: () => [{ id: 1 } as never],
    readChat: () => ({ id: 1 }) as never,
  });
  assert.deepEqual(recall.searchHistory('x', 5), []);
  assert.deepEqual(recall.searchBookmarks('x', 5), []);
  assert.deepEqual(recall.searchChats('x', 5), []);
  assert.equal(recall.readChat(1), null);
  assert.equal(recall.now(), 5);
});
