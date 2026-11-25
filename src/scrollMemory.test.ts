import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScrollMemory } from './scrollMemory.ts';

test('a place that is not the start is remembered, and one at the end is not', () => {
  const memory = createScrollMemory();
  memory.remember(1, 420.5);
  assert.equal(memory.recall(1), 420.5);
  assert.equal(memory.recall(2), null);
  // Scrolling back to the end forgets the note (a chat opens at the bottom again).
  memory.remember(1, 900, true);
  assert.equal(memory.recall(1), null);
});

test('each thing has its own place', () => {
  const memory = createScrollMemory();
  memory.remember(1, 100);
  memory.remember(2, 300);
  assert.equal(memory.recall(1), 100);
  assert.equal(memory.recall(2), 300);
  memory.forget(1);
  assert.equal(memory.recall(1), null);
  assert.equal(memory.recall(2), 300);
});

test('a share of a document (0 to 1) works the same way', () => {
  const memory = createScrollMemory();
  memory.remember(7, 0.37);
  assert.equal(memory.recall(7), 0.37);
  // Back at the very top: nothing to go back to.
  memory.remember(7, 0);
  assert.equal(memory.recall(7), null);
});

test('nonsense places are not kept', () => {
  const memory = createScrollMemory();
  memory.remember(1, Number.NaN);
  memory.remember(2, -5);
  memory.remember(3, 0);
  memory.remember(4, Number.POSITIVE_INFINITY);
  assert.equal(memory.size(), 0);
});

test('only the most recent places are kept', () => {
  const memory = createScrollMemory(200);
  for (let id = 1; id <= 250; id++) memory.remember(id, 100 + id);
  assert.equal(memory.size(), 200);
  assert.equal(memory.recall(1), null);
  assert.equal(memory.recall(250), 350);
});

test('two memories do not share places', () => {
  const a = createScrollMemory();
  const b = createScrollMemory();
  a.remember(1, 10);
  assert.equal(b.recall(1), null);
});
