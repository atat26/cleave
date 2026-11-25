import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  clearScrollMemory,
  forgetScroll,
  recallScroll,
  rememberScroll,
  scrollMemorySize,
} from './scrollMemory.ts';

beforeEach(() => clearScrollMemory());

test('a chat scrolled up is remembered, and a chat at the bottom is not', () => {
  rememberScroll(1, 420.4, false);
  assert.equal(recallScroll(1), 420);
  assert.equal(recallScroll(2), null);
  // Scrolling back to the bottom forgets the note (the chat opens at the bottom again).
  rememberScroll(1, 900, true);
  assert.equal(recallScroll(1), null);
});

test('each chat has its own place', () => {
  rememberScroll(1, 100, false);
  rememberScroll(2, 300, false);
  assert.equal(recallScroll(1), 100);
  assert.equal(recallScroll(2), 300);
  forgetScroll(1);
  assert.equal(recallScroll(1), null);
  assert.equal(recallScroll(2), 300);
});

test('nonsense positions are not kept', () => {
  rememberScroll(1, Number.NaN, false);
  rememberScroll(2, -5, false);
  rememberScroll(3, 0, false);
  assert.equal(scrollMemorySize(), 0);
});

test('only the most recent chats are kept', () => {
  for (let id = 1; id <= 250; id++) rememberScroll(id, 100 + id, false);
  assert.equal(scrollMemorySize(), 200);
  assert.equal(recallScroll(1), null);
  assert.equal(recallScroll(250), 350);
});
