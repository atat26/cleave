import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeConversation,
  addUserMessage,
  appendToMessage,
  autoTitle,
  DEFAULT_CHAT_TITLE,
  defaultChats,
  deleteConversation,
  finishMessage,
  findMessage,
  MAX_USER_CHARS,
  newConversation,
  parseChats,
  removeMessage,
  renameConversation,
  setActiveConversation,
  setConversationModel,
  startAssistantMessage,
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

// ---- Messages ----------------------------------------------------------------

test('addUserMessage trims, refuses empty or huge text, and ignores unknown chats', () => {
  const state = defaultChats(NOW);
  const id = state.activeId;
  const added = addUserMessage(state, id, '  Hello there  ', NOW + 1);
  assert.ok(added);
  const message = added.state.conversations[0].messages[0];
  assert.equal(message.content, 'Hello there');
  assert.equal(message.role, 'user');
  assert.equal(message.status, 'done');
  assert.equal(message.model, null);
  assert.equal(added.state.conversations[0].updatedAt, NOW + 1);
  assert.equal(addUserMessage(state, id, '   \n  ', NOW), null);
  assert.equal(
    addUserMessage(state, id, 'x'.repeat(MAX_USER_CHARS + 1), NOW),
    null,
  );
  assert.equal(addUserMessage(state, 9999, 'hi', NOW), null);
  assert.ok(addUserMessage(state, id, 'x'.repeat(MAX_USER_CHARS), NOW));
});

test('the first message names a chat that still has the default name, once', () => {
  const state = defaultChats(NOW);
  const id = state.activeId;
  const first = addUserMessage(
    state,
    id,
    'What is the capital of France?\nAnd its population?',
    NOW,
  );
  assert.equal(
    first?.state.conversations[0].title,
    'What is the capital of France?',
  );
  // A second message does not rename it.
  const second = addUserMessage(first!.state, id, 'Thanks', NOW);
  assert.equal(
    second?.state.conversations[0].title,
    'What is the capital of France?',
  );
  // A chat you already named keeps your name.
  const named = renameConversation(state, id, 'My trip');
  assert.equal(
    addUserMessage(named, id, 'Plan it', NOW)?.state.conversations[0].title,
    'My trip',
  );
});

test('autoTitle takes the first line, tidies spaces, and shortens long ones', () => {
  assert.equal(autoTitle('  Hello    world  \nsecond line'), 'Hello world');
  assert.equal(autoTitle('\n\n  third line only'), 'third line only');
  assert.equal(autoTitle('   \n  '), DEFAULT_CHAT_TITLE);
  const long = autoTitle('word '.repeat(30));
  assert.ok(long.endsWith('…'));
  assert.ok(long.length <= 41);
});

test('a reply is started, filled in piece by piece, and finished', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addUserMessage(state, chatId, 'Hi', NOW)!.state;
  const started = startAssistantMessage(
    state,
    chatId,
    'openai/gpt-4o',
    NOW + 1,
  )!;
  state = started.state;
  let reply = findMessage(state, chatId, started.id)!;
  assert.deepEqual(
    [reply.role, reply.status, reply.content, reply.model],
    ['assistant', 'streaming', '', 'openai/gpt-4o'],
  );

  state = appendToMessage(state, chatId, started.id, 'Hel');
  state = appendToMessage(state, chatId, started.id, 'lo!');
  state = finishMessage(
    state,
    chatId,
    started.id,
    { status: 'done', usage: { totalTokens: 12, cost: 0.002 } },
    NOW + 5,
  );
  reply = findMessage(state, chatId, started.id)!;
  assert.deepEqual(
    [reply.content, reply.status, reply.usage, reply.errorKind],
    ['Hello!', 'done', { totalTokens: 12, cost: 0.002 }, null],
  );
  assert.equal(state.conversations[0].updatedAt, NOW + 5);
});

test('a failed or stopped reply keeps its text; only failures record why', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  const a = startAssistantMessage(state, chatId, 'm/a', NOW)!;
  state = appendToMessage(a.state, chatId, a.id, 'partial');
  const failed = finishMessage(state, chatId, a.id, {
    status: 'error',
    errorKind: 'credit',
  });
  const failedReply = findMessage(failed, chatId, a.id)!;
  assert.deepEqual(
    [failedReply.content, failedReply.status, failedReply.errorKind],
    ['partial', 'error', 'credit'],
  );
  // An error with no kind given is "unknown"; a stop records no error.
  const unknown = finishMessage(state, chatId, a.id, { status: 'error' });
  assert.equal(findMessage(unknown, chatId, a.id)!.errorKind, 'unknown');
  const stopped = finishMessage(failed, chatId, a.id, { status: 'stopped' });
  const stoppedReply = findMessage(stopped, chatId, a.id)!;
  assert.deepEqual(
    [stoppedReply.status, stoppedReply.errorKind],
    ['stopped', null],
  );
});

test('removeMessage and unknown ids are safe', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  const a = startAssistantMessage(state, chatId, 'm/a', NOW)!;
  state = a.state;
  assert.equal(
    removeMessage(state, chatId, a.id).conversations[0].messages.length,
    0,
  );
  assert.equal(
    removeMessage(state, chatId, 9999).conversations[0].messages.length,
    1,
  );
  assert.equal(removeMessage(state, 9999, a.id), state);
  assert.equal(appendToMessage(state, 9999, a.id, 'x'), state);
  assert.equal(startAssistantMessage(state, 9999, 'm/a', NOW), null);
});

test('a chat can use its own model, validated', () => {
  const state = defaultChats(NOW);
  const id = state.activeId;
  assert.equal(
    setConversationModel(state, id, 'meta/llama-3:free').conversations[0].model,
    'meta/llama-3:free',
  );
  assert.equal(
    setConversationModel(setConversationModel(state, id, 'a/b'), id, null)
      .conversations[0].model,
    null,
  );
  assert.equal(setConversationModel(state, id, 'bad name!'), state);
});

test('a reply cut off when the app closed is marked stopped, keeping its text', () => {
  const state = parseChats(
    {
      conversations: [
        {
          id: 1,
          title: 'x',
          messages: [
            { id: 2, role: 'user', content: 'Hi', status: 'done' },
            {
              id: 3,
              role: 'assistant',
              content: 'Half an ans',
              status: 'streaming',
              model: 'm/a',
            },
          ],
        },
      ],
    },
    NOW,
  );
  const reply = state.conversations[0].messages[1];
  assert.deepEqual(
    [reply.status, reply.content, reply.model],
    ['stopped', 'Half an ans', 'm/a'],
  );
});

test('message fields are validated and repaired when loading', () => {
  const state = parseChats(
    {
      conversations: [
        {
          id: 1,
          model: 'bad model name',
          messages: [
            {
              id: 2,
              role: 'user',
              content: 'a',
              status: 'weird',
              model: 7,
              errorKind: 'nope',
              usage: 'cheap',
            },
            { id: 2, role: 'user', content: 'duplicate id' },
            {
              id: 3,
              role: 'assistant',
              content: 'b',
              status: 'error',
              errorKind: 'rate-limit',
              usage: { totalTokens: 'x', cost: 0.5 },
            },
          ],
        },
      ],
    },
    NOW,
  );
  const [first, second] = state.conversations[0].messages;
  assert.equal(state.conversations[0].model, null);
  assert.equal(state.conversations[0].messages.length, 2);
  assert.deepEqual(
    [first.status, first.model, first.errorKind, first.usage],
    ['done', null, null, null],
  );
  assert.deepEqual(
    [second.status, second.errorKind, second.usage],
    ['error', 'rate-limit', { totalTokens: null, cost: 0.5 }],
  );
});

test('a chat with messages survives a JSON round trip unchanged', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addUserMessage(state, chatId, 'Question', NOW)!.state;
  const reply = startAssistantMessage(state, chatId, 'openai/gpt-4o', NOW)!;
  state = appendToMessage(reply.state, chatId, reply.id, 'Answer');
  state = finishMessage(
    state,
    chatId,
    reply.id,
    { status: 'done', usage: { totalTokens: 5, cost: 0 } },
    NOW,
  );
  state = setConversationModel(state, chatId, 'openai/gpt-4o');
  assert.deepEqual(parseChats(JSON.parse(JSON.stringify(state)), NOW), state);
});
