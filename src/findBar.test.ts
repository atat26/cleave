import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FIND_BAR_HEIGHT,
  FIND_BAR_WIDTH,
  findBarRect,
  findLabel,
} from './findBar.ts';

test('the find bar sits at the top right of the page card', () => {
  const rect = findBarRect({ x: 100, y: 48, width: 800, height: 600 });
  assert.equal(rect.width, FIND_BAR_WIDTH);
  assert.equal(rect.height, FIND_BAR_HEIGHT);
  assert.equal(rect.x + rect.width, 100 + 800 - 8);
  assert.equal(rect.y, 48 + 8);
});

test('in a narrow page the bar shrinks and stays inside it', () => {
  const rect = findBarRect({ x: 0, y: 0, width: 200, height: 300 });
  assert.equal(rect.width, 184);
  assert.ok(rect.x >= 0 && rect.x + rect.width <= 200);
  // A page with no room at all gives an empty bar, never a negative size.
  assert.equal(findBarRect({ x: 5, y: 5, width: 0, height: 0 }).width, 0);
});

test('the label says how many matches, or that there are none', () => {
  assert.deepEqual(findLabel('', 0, 0), { text: '', none: false });
  assert.deepEqual(findLabel('dock', 3, 12), { text: '3 of 12', none: false });
  assert.deepEqual(findLabel('dock', 0, 0), { text: 'No matches', none: true });
  // An out-of-range position is pulled back into range.
  assert.deepEqual(findLabel('dock', 0, 4), { text: '1 of 4', none: false });
  assert.deepEqual(findLabel('dock', 9, 4), { text: '4 of 4', none: false });
});
