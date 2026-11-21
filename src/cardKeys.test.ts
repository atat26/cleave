import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEY_GRACE_MS, keyMayAnswer } from './approvalCard.ts';

test('a card that has just appeared ignores the keys that allow it, but "no" always works', () => {
  for (const answer of ['allow', 'allow-rest'] as const) {
    assert.equal(keyMayAnswer(answer, 0), false, answer);
    assert.equal(keyMayAnswer(answer, KEY_GRACE_MS - 1), false, answer);
    assert.equal(keyMayAnswer(answer, KEY_GRACE_MS), true, answer);
    assert.equal(keyMayAnswer(answer, 60_000), true, answer);
  }
  assert.equal(keyMayAnswer('deny', 0), true);
  assert.equal(keyMayAnswer('deny', KEY_GRACE_MS), true);
});

test('the wait is short enough not to be noticed and long enough for a stray key', () => {
  assert.ok(KEY_GRACE_MS >= 300 && KEY_GRACE_MS <= 1000);
});
