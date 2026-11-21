import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundary } from './boundary.ts';
import { chatHasReadWeb, readsTheWeb } from './webSeen.ts';

test('the marker lines carry a code, and a page cannot write a real one', () => {
  const a = boundary('page text');
  assert.match(a.start, /^----- start of page text \[[0-9a-f]{16}\] -----$/);
  assert.match(a.end, /^----- end of page text \[[0-9a-f]{16}\] -----$/);
  // The same code for the whole run, so an earlier request reads the same in a later one.
  assert.deepEqual(boundary('page text'), a);
  // The old fixed line is not the real one.
  assert.notEqual(a.end, '----- end of page text -----');
  assert.ok(a.note.includes(a.end.match(/\[([0-9a-f]+)\]/)![1]));
  // A different code gives different lines (the code is a plain argument).
  assert.notEqual(boundary('page text', 'abc').end, a.end);
});

test('a chat that read the web in any earlier reply counts, so a skill asks', () => {
  assert.equal(chatHasReadWeb([]), false);
  assert.equal(
    chatHasReadWeb([
      { name: 'create_artifact', status: 'ok' },
      { name: 'use_skill', status: 'ok' },
      { name: 'search_history', status: 'ok' },
    ]),
    false,
  );
  for (const name of [
    'read_page',
    'read_pages',
    'look_at_page',
    'screenshot_page',
    'read_link',
    'web_search',
    'go_to',
    'open_tab',
    'click',
    'save_page_as_artifact',
    'find_in_page',
    'read_tables',
  ]) {
    assert.ok(readsTheWeb(name), name);
    assert.equal(chatHasReadWeb([{ name, status: 'ok' }]), true, name);
    // One that was declined, blocked or failed read nothing.
    for (const status of ['declined', 'error', 'running', 'waiting']) {
      assert.equal(
        chatHasReadWeb([{ name, status }]),
        false,
        `${name} ${status}`,
      );
    }
  }
});
