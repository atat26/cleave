import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countPending, pendingChanges } from './pendingChanges.ts';

const tabs = [
  { id: 1, spaceId: null, closed: false },
  { id: 2, spaceId: 10, closed: false },
  { id: 3, spaceId: 10, closed: false },
  { id: 4, spaceId: 10, closed: true },
];
const spaces = [
  { id: 10, name: 'Shopping' },
  { id: 11, name: 'A very long Space name that goes on and on' },
];
const step = (name: string, args: unknown, status = 'waiting') => ({
  name,
  arguments: JSON.stringify(args),
  status,
});

test('a close request tints the one tab with "Close"', () => {
  const result = pendingChanges(step('close_tab', { tab: 2 }), tabs, spaces);
  assert.deepEqual(
    [...result],
    [[2, { kind: 'close', tag: 'Close', words: 'Will be closed' }]],
  );
});

test('a move request tints each tab with where it goes, in your own Space names', () => {
  const result = pendingChanges(
    step('move_tabs', {
      moves: [
        { tab: 1, space: 10 },
        { tab: 2, space: 11 },
        { tab: 3, space: null },
      ],
    }),
    tabs,
    spaces,
  );
  assert.equal(result.get(1)?.tag, '→ Shopping');
  assert.equal(result.get(1)?.words, 'Will move to Shopping');
  assert.equal(result.get(1)?.kind, 'move');
  // A long name is cut.
  assert.equal(result.get(2)?.tag, '→ A very long Space name …');
  assert.equal(result.get(3)?.tag, '→ No Space');
});

test('moves that change nothing, or point at nothing real, are left out', () => {
  const result = pendingChanges(
    step('move_tabs', {
      moves: [
        { tab: 2, space: 10 }, // already there
        { tab: 1, space: 99 }, // no such Space
        { tab: 99, space: 10 }, // no such tab
        { tab: 4, space: 11 }, // a closed link: no row
        { tab: 1, space: null }, // already in no Space
        { tab: '2', space: 10 },
        { tab: 3 },
        null,
        'x',
      ],
    }),
    tabs,
    spaces,
  );
  assert.equal(result.size, 0);
  // A close of a closed link or a missing tab.
  assert.equal(
    pendingChanges(step('close_tab', { tab: 4 }), tabs, spaces).size,
    0,
  );
  assert.equal(
    pendingChanges(step('close_tab', { tab: 99 }), tabs, spaces).size,
    0,
  );
});

test('only a step that is waiting for you tints anything, and only these two tools', () => {
  assert.equal(
    pendingChanges(step('close_tab', { tab: 2 }, 'running'), tabs, spaces).size,
    0,
  );
  assert.equal(
    pendingChanges(step('close_tab', { tab: 2 }, 'ok'), tabs, spaces).size,
    0,
  );
  for (const name of ['sleep_tab', 'reopen_tab', 'click', 'look_at_page']) {
    assert.equal(
      pendingChanges(step(name, { tab: 2 }), tabs, spaces).size,
      0,
      name,
    );
  }
  assert.equal(pendingChanges(null, tabs, spaces).size, 0);
});

test('odd arguments never throw', () => {
  for (const raw of ['', 'not json', 'null', '[]', '{"moves":"x"}', '{}']) {
    assert.doesNotThrow(() =>
      pendingChanges(
        { name: 'move_tabs', arguments: raw, status: 'waiting' },
        tabs,
        spaces,
      ),
    );
  }
});

test('a collapsed Space counts the tabs in it that would change', () => {
  assert.equal(countPending([]), 0);
  assert.equal(
    countPending([
      { pending: null },
      { pending: { kind: 'close', tag: 'Close', words: 'Will be closed' } },
      { pending: { kind: 'move', tag: '→ X', words: 'Will move to X' } },
    ]),
    2,
  );
});
