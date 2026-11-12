import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanEmoji,
  defaultArtifactEmoji,
  EMOJI_GROUPS,
  emojiOr,
} from './emoji.ts';

test('a single emoji is kept, including ones made of several parts', () => {
  for (const e of ['🗺️', '🧾', '👍🏽', '🇨🇦', '👩‍💻', '❤️', '🏳️‍🌈']) {
    assert.equal(cleanEmoji(e), e);
  }
  assert.equal(cleanEmoji('  🚀 '), '🚀');
});

test('anything else is refused', () => {
  for (const bad of [
    '',
    ' ',
    'a',
    '1',
    'ab',
    '🚀🚀',
    'hi 🚀',
    '<b>',
    null,
    5,
    {},
  ]) {
    assert.equal(cleanEmoji(bad), null);
  }
  assert.equal(cleanEmoji('🚀'.repeat(30)), null);
});

test('an item without a valid emoji shows its default', () => {
  assert.equal(emojiOr('🚀', '📁'), '🚀');
  assert.equal(emojiOr('nope', '📁'), '📁');
  assert.equal(emojiOr(null, '💬'), '💬');
  assert.equal(defaultArtifactEmoji('html'), '🌐');
  assert.equal(defaultArtifactEmoji('unknown'), '📄');
});

test('every emoji in the picker is valid, and none is listed twice in a group', () => {
  for (const group of EMOJI_GROUPS) {
    assert.equal(new Set(group.emojis).size, group.emojis.length, group.name);
    for (const e of group.emojis) assert.equal(cleanEmoji(e), e, e);
  }
});
