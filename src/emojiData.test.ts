import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createArtifact,
  defaultArtifacts,
  parseArtifacts,
  updateArtifact,
} from './artifacts.ts';
import { defaultChats, parseChats, setConversationEmoji } from './chats.ts';
import { addSpace, defaultState, parseState, setSpaceEmoji } from './model.ts';

test('a Space starts with no emoji of its own, and can be given one and cleared', () => {
  const { state, id } = addSpace(defaultState(), 'Trip');
  assert.equal(state.spaces[0].emoji, null);
  const set = setSpaceEmoji(state, id, '🗺️');
  assert.equal(set.spaces[0].emoji, '🗺️');
  assert.equal(setSpaceEmoji(set, id, null).spaces[0].emoji, null);
});

test('a Space refuses an emoji that is not one, and it survives saving', () => {
  const { state, id } = addSpace(defaultState(), 'Trip');
  const set = setSpaceEmoji(state, id, '🗺️');
  assert.equal(setSpaceEmoji(set, id, 'abc').spaces[0].emoji, '🗺️');
  assert.equal(
    parseState(JSON.parse(JSON.stringify(set))).spaces[0].emoji,
    '🗺️',
  );
  const junk = JSON.parse(JSON.stringify(set));
  junk.spaces[0].emoji = '<script>';
  assert.equal(parseState(junk).spaces[0].emoji, null);
});

test('a chat can be given an emoji, cleared, and keeps it when reloaded', () => {
  const chats = defaultChats(1);
  const id = chats.activeId;
  const set = setConversationEmoji(chats, id, '🚀');
  assert.equal(set.conversations[0].emoji, '🚀');
  assert.equal(
    setConversationEmoji(set, id, 'no').conversations[0].emoji,
    '🚀',
  );
  assert.equal(
    setConversationEmoji(set, id, null).conversations[0].emoji,
    null,
  );
  assert.equal(
    parseChats(JSON.parse(JSON.stringify(set))).conversations[0].emoji,
    '🚀',
  );
});

test('an artifact can start with an emoji, change it, clear it, and keep it', () => {
  const made = createArtifact(
    defaultArtifacts(),
    { kind: 'markdown', title: 'Notes', emoji: '📚' },
    1,
  );
  assert.ok(made.ok);
  assert.equal(made.artifact.emoji, '📚');
  const plain = createArtifact(
    made.state,
    { kind: 'html', title: 'Page', emoji: 'nope' },
    2,
  );
  assert.ok(plain.ok);
  assert.equal(plain.artifact.emoji, null);

  const changed = updateArtifact(
    made.state,
    made.artifact.id,
    { emoji: '🧪' },
    3,
  );
  assert.ok(changed.ok);
  assert.equal(changed.artifact.emoji, '🧪');
  // A bad emoji leaves the old one; null clears it.
  const bad = updateArtifact(
    changed.state,
    made.artifact.id,
    { emoji: 'x' },
    4,
  );
  assert.ok(bad.ok);
  assert.equal(bad.artifact.emoji, '🧪');
  const cleared = updateArtifact(
    bad.state,
    made.artifact.id,
    { emoji: null },
    5,
  );
  assert.ok(cleared.ok);
  assert.equal(cleared.artifact.emoji, null);
  // Changing the emoji does not count as editing the text.
  assert.equal(changed.artifact.revision, made.artifact.revision);
  assert.equal(
    parseArtifacts(JSON.parse(JSON.stringify(changed.state))).artifacts[0]
      .emoji,
    '🧪',
  );
});
