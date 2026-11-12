import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addSpace,
  addTab,
  closeTab,
  defaultState,
  nudge,
  openArtifactTab,
  placeArtifactTab,
  placeSpace,
  placeTab,
} from './model.ts';
import type { SavedState } from './model.ts';

// Three open tabs outside any Space (a, b, c) and two Spaces (S1, S2).
function setup() {
  let state: SavedState = defaultState();
  state = { ...state, tabs: [] };
  const ids: Record<string, number> = {};
  for (const name of ['a', 'b', 'c']) {
    const added = addTab(state, { url: `https://${name}.example` });
    state = added.state;
    ids[name] = added.id;
  }
  const s1 = addSpace(state, 'S1');
  const s2 = addSpace(s1.state, 'S2');
  return { state: s2.state, ids, s1: s1.id, s2: s2.id };
}

const order = (state: SavedState, spaceId: number | null) =>
  state.tabs
    .filter((t) => t.spaceId === spaceId && !t.closed)
    .map((t) => new URL(t.url).hostname[0]);

test('a tab can be put before another tab in the same group', () => {
  const { state, ids } = setup();
  const moved = placeTab(state, ids.c, null, ids.a);
  assert.deepEqual(order(moved, null), ['c', 'a', 'b']);
  // Put at the end when no tab is given.
  assert.deepEqual(order(placeTab(state, ids.a, null, null), null), [
    'b',
    'c',
    'a',
  ]);
});

test('a tab dropped where it already is changes nothing (the same state back)', () => {
  const { state, ids } = setup();
  assert.equal(placeTab(state, ids.b, null, ids.c), state);
  assert.equal(placeTab(state, ids.c, null, null), state);
  assert.equal(placeTab(state, ids.a, null, ids.a), state);
});

test('a tab moves into a Space at a place, and back out as an open tab', () => {
  const { state, ids, s1 } = setup();
  let next = placeTab(state, ids.a, s1, null);
  next = placeTab(next, ids.b, s1, ids.a);
  assert.deepEqual(order(next, s1), ['b', 'a']);
  assert.deepEqual(order(next, null), ['c']);
  const out = placeTab(next, ids.a, null, ids.c);
  assert.deepEqual(order(out, null), ['a', 'c']);
  assert.equal(out.tabs.find((t) => t.id === ids.a)!.spaceId, null);
});

test('a "before" tab from another group is ignored: the tab goes to the end', () => {
  const { state, ids, s1 } = setup();
  const next = placeTab(state, ids.a, s1, ids.b); // b is not in S1
  assert.deepEqual(order(next, s1), ['a']);
});

test('nothing moves for an unknown tab or Space', () => {
  const { state, ids } = setup();
  assert.equal(placeTab(state, 9999, null, null), state);
  assert.equal(placeTab(state, ids.a, 9999, null), state);
});

test('moving never loses or duplicates a tab, and keeps the selected one', () => {
  const { state, ids, s1, s2 } = setup();
  const selected = { ...state, active: { kind: 'tab' as const, id: ids.b } };
  let next: SavedState = selected;
  next = placeTab(next, ids.a, s1, null);
  next = placeTab(next, ids.b, s2, null);
  next = placeTab(next, ids.c, s1, ids.a);
  assert.deepEqual(
    next.tabs.map((t) => t.id).sort(),
    state.tabs.map((t) => t.id).sort(),
  );
  assert.deepEqual(next.active, { kind: 'tab', id: ids.b });
});

test('a tab kept as a closed link in a Space is not touched by moves of others', () => {
  const { state, ids, s1 } = setup();
  let next = placeTab(state, ids.a, s1, null);
  next = closeTab(next, ids.a); // kept as a closed link in S1
  assert.equal(next.tabs.find((t) => t.id === ids.a)!.closed, true);
  next = placeTab(next, ids.b, s1, null);
  assert.equal(next.tabs.find((t) => t.id === ids.a)!.closed, true);
  assert.deepEqual(order(next, s1), ['b']);
});

test('Spaces are put in order', () => {
  const { state, s1, s2 } = setup();
  const swapped = placeSpace(state, s2, s1);
  assert.deepEqual(
    swapped.spaces.map((s) => s.id),
    [s2, s1],
  );
  assert.equal(placeSpace(state, s1, s2), state);
  assert.equal(placeSpace(state, s2, null), state);
  assert.equal(placeSpace(state, 9999, null), state);
});

test('open artifacts are put in order among the artifacts of their Space', () => {
  const { state } = setup();
  let next = openArtifactTab(state, 1, null);
  next = openArtifactTab(next, 2, null);
  next = openArtifactTab(next, 3, null);
  const moved = placeArtifactTab(next, 3, 1);
  assert.deepEqual(
    moved.artifactTabs.map((t) => t.artifactId),
    [3, 1, 2],
  );
  assert.equal(placeArtifactTab(next, 3, null), next);
  assert.equal(placeArtifactTab(next, 99, null), next);
});

test('Alt+Up and Alt+Down move an item one place, and stop at the edge', () => {
  const { state, ids, s1, s2 } = setup();
  assert.deepEqual(order(nudge(state, { kind: 'tab', id: ids.c }, -1), null), [
    'a',
    'c',
    'b',
  ]);
  assert.deepEqual(order(nudge(state, { kind: 'tab', id: ids.a }, 1), null), [
    'b',
    'a',
    'c',
  ]);
  assert.equal(nudge(state, { kind: 'tab', id: ids.a }, -1), state);
  assert.equal(nudge(state, { kind: 'tab', id: ids.c }, 1), state);
  assert.deepEqual(
    nudge(state, { kind: 'space', id: s2 }, -1).spaces.map((s) => s.id),
    [s2, s1],
  );
  assert.equal(nudge(state, { kind: 'space', id: s1 }, -1), state);
  let art = openArtifactTab(state, 1, null);
  art = openArtifactTab(art, 2, null);
  assert.deepEqual(
    nudge(art, { kind: 'artifact', id: 2 }, -1).artifactTabs.map(
      (t) => t.artifactId,
    ),
    [2, 1],
  );
  assert.equal(nudge(art, { kind: 'artifact', id: 1 }, -1), art);
});
