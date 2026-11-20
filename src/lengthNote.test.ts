import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lengthNote } from './lengthNote.ts';

test('a reply that reached the limit gets a note from the app after it; one that ended on its own gets none', () => {
  const note = lengthNote('length', 'The essay so far...', 16_000);
  assert.match(note ?? '', /^\n\n_Note from the app: this reply was cut off/);
  assert.match(note ?? '', /16,000 tokens/);
  for (const finish of ['stop', 'tool_calls', null, 'content_filter']) {
    assert.equal(lengthNote(finish, 'Done.', 16_000), null, String(finish));
  }
});

test('a reply cut off before it had any words says that instead', () => {
  const note = lengthNote('length', '   ', 16_000);
  assert.match(note ?? '', /before it had any words/);
  assert.ok(!(note ?? '').startsWith('\n\n'));
});
