import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landingTab, neighborSpaceId, spaceIdByNumber } from './spaceSwitch.ts';

test('next and previous Space wrap round at the ends', () => {
  const ids = [10, 20, 30];
  assert.equal(neighborSpaceId(ids, 10, 1), 20);
  assert.equal(neighborSpaceId(ids, 30, 1), 10);
  assert.equal(neighborSpaceId(ids, 10, -1), 30);
  assert.equal(neighborSpaceId(ids, 20, -1), 10);
  // No current Space (a page outside every Space): the first, or the last going back.
  assert.equal(neighborSpaceId(ids, null, 1), 10);
  assert.equal(neighborSpaceId(ids, null, -1), 30);
  assert.equal(neighborSpaceId(ids, 999, 1), 10);
  assert.equal(neighborSpaceId([], 10, 1), null);
  assert.equal(neighborSpaceId([7], 7, 1), 7);
});

test('a number picks the Space at that place, counting from 1', () => {
  const ids = [10, 20, 30];
  assert.equal(spaceIdByNumber(ids, 1), 10);
  assert.equal(spaceIdByNumber(ids, 3), 30);
  for (const bad of [0, 4, -1, 1.5, NaN]) {
    assert.equal(spaceIdByNumber(ids, bad), null, String(bad));
  }
});

test('going to a Space lands on the page you were last on, else the first open one', () => {
  const tabs = [
    { id: 1, spaceId: 5, closed: false },
    { id: 2, spaceId: 5, closed: false },
    { id: 3, spaceId: 5, closed: true },
    { id: 4, spaceId: 6, closed: false },
    { id: 5, spaceId: null, closed: false },
  ];
  assert.equal(landingTab(tabs, 5, 2), 2);
  // The remembered page is closed now, or in another Space: the first open one.
  assert.equal(landingTab(tabs, 5, 3), 1);
  assert.equal(landingTab(tabs, 5, 4), 1);
  assert.equal(landingTab(tabs, 5, undefined), 1);
  // A Space with no open page: none (its overview).
  assert.equal(landingTab(tabs, 7, undefined), null);
  assert.equal(landingTab([{ id: 9, spaceId: 8, closed: true }], 8, 9), null);
});
