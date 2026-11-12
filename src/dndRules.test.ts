import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyDrop,
  dropForItem,
  dropForSpaceHeader,
  sameDrop,
} from './dndRules.ts';
import type { DropAt } from './dndRules.ts';

const tab = (id: number) => ({ kind: 'tab' as const, id });
const artifact = (id: number) => ({ kind: 'artifact' as const, id });
const space = (id: number) => ({ kind: 'space' as const, id });

test('a tab over a tab goes before it (top half) or before the next one (bottom half)', () => {
  const place = { spaceId: 5, nextId: 9 };
  assert.deepEqual(dropForItem(tab(1), tab(2), place, true), {
    type: 'tab',
    spaceId: 5,
    beforeId: 2,
  });
  assert.deepEqual(dropForItem(tab(1), tab(2), place, false), {
    type: 'tab',
    spaceId: 5,
    beforeId: 9,
  });
  // The last tab: the bottom half means the end of the group.
  assert.deepEqual(
    dropForItem(tab(1), tab(2), { spaceId: 5, nextId: null }, false),
    {
      type: 'tab',
      spaceId: 5,
      beforeId: null,
    },
  );
});

test('a tab over an artifact joins that Space; artifacts reorder among artifacts', () => {
  const place = { spaceId: null, nextId: null };
  assert.deepEqual(dropForItem(tab(1), artifact(3), place, true), {
    type: 'into',
    spaceId: null,
  });
  assert.deepEqual(
    dropForItem(artifact(3), artifact(4), { spaceId: 2, nextId: 8 }, false),
    {
      type: 'artifact',
      spaceId: 2,
      beforeId: 8,
    },
  );
  assert.deepEqual(
    dropForItem(artifact(3), tab(1), { spaceId: 2, nextId: 8 }, true),
    {
      type: 'into',
      spaceId: 2,
    },
  );
});

test('a Space dragged over tabs or artifacts has no target there', () => {
  assert.equal(
    dropForItem(space(1), tab(2), { spaceId: 1, nextId: null }, true),
    null,
  );
});

test('over a Space header: tabs and artifacts join it; a Space goes before or after it', () => {
  assert.deepEqual(dropForSpaceHeader(tab(1), 7, 8, true), {
    type: 'into',
    spaceId: 7,
  });
  assert.deepEqual(dropForSpaceHeader(artifact(1), 7, 8, false), {
    type: 'into',
    spaceId: 7,
  });
  assert.deepEqual(dropForSpaceHeader(space(3), 7, 8, true), {
    type: 'space',
    beforeId: 7,
  });
  assert.deepEqual(dropForSpaceHeader(space(3), 7, 8, false), {
    type: 'space',
    beforeId: 8,
  });
  assert.deepEqual(dropForSpaceHeader(space(3), 7, null, false), {
    type: 'space',
    beforeId: null,
  });
  // Over itself: nothing.
  assert.equal(dropForSpaceHeader(space(7), 7, 8, true), null);
});

function recorder() {
  const calls: unknown[][] = [];
  return {
    calls,
    api: {
      moveTab: (...a: unknown[]) => calls.push(['tab', ...a]),
      moveArtifactTab: (...a: unknown[]) => calls.push(['artifact', ...a]),
      moveSpace: (...a: unknown[]) => calls.push(['space', ...a]),
    } as Parameters<typeof applyDrop>[2],
  };
}

test('a drop asks the app for the right move', () => {
  const r = recorder();
  assert.equal(
    applyDrop(tab(1), { type: 'tab', spaceId: 5, beforeId: 2 }, r.api),
    true,
  );
  assert.equal(applyDrop(tab(1), { type: 'into', spaceId: null }, r.api), true);
  assert.equal(
    applyDrop(
      artifact(3),
      { type: 'artifact', spaceId: 2, beforeId: null },
      r.api,
    ),
    true,
  );
  assert.equal(
    applyDrop(artifact(3), { type: 'into', spaceId: 4 }, r.api),
    true,
  );
  assert.equal(
    applyDrop(space(6), { type: 'space', beforeId: 9 }, r.api),
    true,
  );
  assert.deepEqual(r.calls, [
    ['tab', 1, 5, 2],
    ['tab', 1, null, null],
    ['artifact', 3, 2, null],
    ['artifact', 3, 4, null],
    ['space', 6, 9],
  ]);
});

test('a drop on a place that does not suit the dragged thing does nothing', () => {
  const r = recorder();
  assert.equal(applyDrop(tab(1), { type: 'space', beforeId: 2 }, r.api), false);
  assert.equal(
    applyDrop(tab(1), { type: 'artifact', spaceId: 1, beforeId: null }, r.api),
    false,
  );
  assert.equal(
    applyDrop(artifact(1), { type: 'tab', spaceId: 1, beforeId: null }, r.api),
    false,
  );
  assert.equal(applyDrop(space(1), { type: 'into', spaceId: 2 }, r.api), false);
  assert.deepEqual(r.calls, []);
});

test('two drop places are the same when they point at the same thing', () => {
  const a: DropAt = { type: 'tab', spaceId: 1, beforeId: 2 };
  assert.equal(sameDrop(a, { type: 'tab', spaceId: 1, beforeId: 2 }), true);
  assert.equal(sameDrop(a, { type: 'tab', spaceId: 1, beforeId: 3 }), false);
  assert.equal(
    sameDrop(a, { type: 'artifact', spaceId: 1, beforeId: 2 }),
    false,
  );
  assert.equal(sameDrop(a, null), false);
  assert.equal(sameDrop(null, null), true);
});
