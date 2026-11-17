import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HINT_TEXT, hintUrl } from './fullscreenHint.ts';

test('the hint is a plain page that tells you how to leave full screen', () => {
  const url = hintUrl();
  assert.ok(url.startsWith('data:text/html'));
  const page = decodeURIComponent(url.slice(url.indexOf(',') + 1));
  assert.ok(page.includes(HINT_TEXT));
  assert.ok(HINT_TEXT.includes('Esc'));
  assert.ok(!page.includes('<script'));
});
