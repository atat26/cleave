import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeConversation,
  DEFAULT_CHAT_TITLE,
  defaultChats,
  deleteConversation,
  newConversation,
  parseChats,
  renameConversation,
  setActiveConversation,
} from './chats.ts';

const NOW = 1_700_000_000_000;

test('a fresh state has one empty, active conversation', () => {
  const state = defaultChats(NOW);
  assert.equal(state.conversations.length, 1);
  assert.equal(activeConversation(state).title, DEFAULT_CHAT_TITLE);
  assert.deepEqual(activeConversation(state).messages, []);
  assert.deepEqual(activeConversation(state).refs, []);
});

test('parseChats survives garbage and always leaves one conversation', () => {
  for (const junk of [
    null,
    undefined,
    42,
    'x',
    [],
    {},
    { conversations: 'no' },
  ]) {
    const state = parseChats(junk, NOW);
    assert.equal(state.conversations.length, 1);
    assert.equal(state.activeId, state.conversations[0].id);
  }
  // Every entry invalid: still one fresh conversation.
  assert.equal(
    parseChats({ conversations: [null, 5, { id: -1 }] }, NOW).conversations
      .length,
    1,
  );
});

test('parseChats repairs ids, titles, messages and links', () => {
  const state = parseChats(
    {
      conversations: [
        {
          id: 5,
          title: '  Trip  ',
          createdAt: 10,
          updatedAt: 20,
          refs: [
            { kind: 'space', id: 3 },
            { kind: 'space', id: 3 }, // duplicate
            { kind: 'hack', id: 4 }, // unknown kind
            { kind: 'tab', id: 'x' }, // bad id
          ],
          messages: [
            { id: 9, role: 'user', content: 'hi', createdAt: 11 },
            { id: 10, role: 'system', content: 'no' }, // unknown role
            { id: 11, role: 'assistant', content: 7 }, // bad content
          ],
        },
        { id: 5, title: 'duplicate id' },
        { id: 6, title: '', messages: 'nope' },
      ],
      activeId: 999, // does not exist
      nextId: 1,
    },
    NOW,
  );
  assert.deepEqual(
    state.conversations.map((c) => [c.id, c.title]),
    [
      [5, 'Trip'],
      [6, DEFAULT_CHAT_TITLE],
    ],
  );
  assert.deepEqual(state.conversations[0].refs, [{ kind: 'space', id: 3 }]);
  assert.deepEqual(
    state.conversations[0].messages.map((m) => m.id),
    [9],
  );
  assert.equal(state.activeId, 5); // fell back to the first
  assert.ok(state.nextId > 9); // new ids never collide with kept conversations or messages
});

test('a state survives a JSON round trip unchanged', () => {
  let state = defaultChats(NOW);
  state = newConversation(state, NOW + 1).state;
  state = renameConversation(state, state.activeId, 'Research');
  assert.deepEqual(parseChats(JSON.parse(JSON.stringify(state)), NOW), state);
});

test('newConversation adds an empty chat and switches to it', () => {
  const first = defaultChats(NOW);
  const added = newConversation(first, NOW + 5);
  assert.equal(added.state.conversations.length, 2);
  assert.equal(added.state.activeId, added.id);
  assert.notEqual(added.id, first.activeId);
  assert.equal(activeConversation(added.state).createdAt, NOW + 5);
});

test('setActiveConversation ignores chats that do not exist', () => {
  const first = defaultChats(NOW);
  const two = newConversation(first, NOW).state;
  assert.equal(
    setActiveConversation(two, first.activeId).activeId,
    first.activeId,
  );
  assert.equal(setActiveConversation(two, 9999), two);
});

test('renameConversation trims, caps the length, and ignores empty names', () => {
  const state = defaultChats(NOW);
  const id = state.activeId;
  assert.equal(
    renameConversation(state, id, '  Plans  ').conversations[0].title,
    'Plans',
  );
  assert.equal(
    renameConversation(state, id, '   ').conversations[0].title,
    DEFAULT_CHAT_TITLE,
  );
  assert.equal(
    renameConversation(state, id, 'x'.repeat(500)).conversations[0].title
      .length,
    80,
  );
});

test('deleteConversation picks a neighbour, and never leaves zero chats', () => {
  let state = defaultChats(NOW);
  const a = state.activeId;
  state = newConversation(state, NOW).state;
  const b = state.activeId;
  state = newConversation(state, NOW).state;
  const c = state.activeId;

  // Delete the active one (c): the one before it (b) becomes active.
  const afterC = deleteConversation(state, c, NOW);
  assert.deepEqual(
    afterC.conversations.map((x) => x.id),
    [a, b],
  );
  assert.equal(afterC.activeId, b);
  // Delete one that is not active: the active one is unchanged.
  assert.equal(deleteConversation(state, a, NOW).activeId, c);
  // Delete the first while active: the next one becomes active.
  const onA = setActiveConversation(state, a);
  assert.equal(deleteConversation(onA, a, NOW).activeId, b);
  // Delete everything: one fresh conversation is left.
  let last = deleteConversation(deleteConversation(afterC, a, NOW), b, NOW);
  assert.equal(last.conversations.length, 1);
  assert.equal(last.activeId, last.conversations[0].id);
  assert.ok(last.conversations[0].id > c);
  // Unknown id: nothing happens.
  assert.equal(deleteConversation(state, 9999, NOW), state);
});
