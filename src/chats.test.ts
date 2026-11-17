import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeConversation,
  addChoicesPart,
  addToolPart,
  finishToolPart,
  MAX_DETAILS,
  addRef,
  addUserMessage,
  appendReasoning,
  appendToMessage,
  autoTitle,
  DEFAULT_CHAT_TITLE,
  defaultChats,
  deleteConversation,
  dropUntouched,
  isUntouched,
  selectConversation,
  startNewChat,
  finishMessage,
  findMessage,
  MAX_LINKS,
  MAX_USER_CHARS,
  newConversation,
  parseChats,
  refreshRefs,
  removeMessage,
  removeRef,
  renameConversation,
  retargetEverywhere,
  retargetRef,
  setActiveConversation,
  branchConversation,
  truncateAfter,
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
  assert.deepEqual(state.conversations[0].refs, [
    { kind: 'space', id: 3, title: '', url: null },
  ]);
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

test('thinking is stored apart from the answer, and is capped and validated', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  const reply = startAssistantMessage(state, chatId, 'm/a', NOW)!;
  assert.equal(findMessage(reply.state, chatId, reply.id)!.reasoning, '');
  state = appendReasoning(reply.state, chatId, reply.id, 'Think ');
  state = appendReasoning(state, chatId, reply.id, 'more.');
  state = appendToMessage(state, chatId, reply.id, 'Answer');
  const message = findMessage(state, chatId, reply.id)!;
  assert.deepEqual(
    [message.reasoning, message.content],
    ['Think more.', 'Answer'],
  );

  // Capped, so one runaway reply cannot fill the save file.
  const huge = appendReasoning(state, chatId, reply.id, 'x'.repeat(200_000));
  assert.equal(findMessage(huge, chatId, reply.id)!.reasoning.length, 50_000);
  // Unknown chat or message: nothing happens.
  assert.equal(appendReasoning(state, 9999, reply.id, 'x'), state);

  // Your own messages have none. Saved data is repaired on load.
  const user = addUserMessage(defaultChats(NOW), 1, 'Hi', NOW)!;
  assert.equal(findMessage(user.state, 1, user.id)!.reasoning, '');
  const loaded = parseChats(
    {
      conversations: [
        {
          id: 1,
          messages: [
            { id: 2, role: 'assistant', content: 'a', reasoning: 'kept' },
            { id: 3, role: 'assistant', content: 'b', reasoning: 42 },
            {
              id: 4,
              role: 'assistant',
              content: 'c',
              reasoning: 'y'.repeat(99_999),
            },
            { id: 5, role: 'assistant', content: 'd' },
          ],
        },
      ],
    },
    NOW,
  );
  const reasonings = loaded.conversations[0].messages.map(
    (m) => m.reasoning.length,
  );
  assert.deepEqual(reasonings, [4, 0, 50_000, 0]);
});

// ---- Links ---------------------------------------------------------------------

const link = (
  kind: 'tab' | 'space' | 'artifact',
  id: number,
  title = '',
  url: string | null = null,
) => ({
  kind,
  id,
  title,
  url,
});

test('linking adds a Space or tab, updates an existing link, and respects the limit', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addRef(
    state,
    chatId,
    link('tab', 5, 'Docs', 'https://docs.example.com/x'),
  );
  state = addRef(state, chatId, link('space', 5, 'Research'));
  assert.deepEqual(
    state.conversations[0].refs.map((r) => [r.kind, r.id, r.title]),
    [
      ['tab', 5, 'Docs'],
      ['space', 5, 'Research'],
    ], // a tab and a Space may share an id
  );
  // The same item again updates what is remembered, without adding a second link.
  state = addRef(
    state,
    chatId,
    link('tab', 5, 'Docs (new title)', 'https://docs.example.com/y'),
  );
  assert.equal(state.conversations[0].refs.length, 2);
  assert.deepEqual(
    [state.conversations[0].refs[0].title, state.conversations[0].refs[0].url],
    ['Docs (new title)', 'https://docs.example.com/y'],
  );

  // Up to MAX_LINKS; beyond that nothing is added (but existing ones still update).
  let full = defaultChats(NOW);
  for (let i = 1; i <= MAX_LINKS + 5; i++)
    full = addRef(full, chatId, link('tab', i, `t${i}`));
  assert.equal(full.conversations[0].refs.length, MAX_LINKS);
  assert.equal(
    addRef(full, chatId, link('tab', 1, 'renamed')).conversations[0].refs[0]
      .title,
    'renamed',
  );
});

test('bad links are refused: unknown chat, bad id or kind; odd addresses are dropped', () => {
  const state = defaultChats(NOW);
  const chatId = state.activeId;
  assert.equal(addRef(state, 9999, link('tab', 1)), state);
  assert.equal(addRef(state, chatId, link('tab', 0)), state);
  assert.equal(addRef(state, chatId, link('tab', 1.5)), state);
  assert.equal(
    addRef(state, chatId, {
      kind: 'file' as never,
      id: 1,
      title: '',
      url: null,
    }),
    state,
  );
  // Only web addresses are kept, and only for tabs.
  const odd = addRef(state, chatId, link('tab', 1, 't', 'file:///C:/secret'));
  assert.equal(odd.conversations[0].refs[0].url, null);
  assert.equal(
    addRef(state, chatId, link('space', 2, 's', 'https://x.example/'))
      .conversations[0].refs[0].url,
    null,
  );
  // Long titles are cut.
  assert.equal(
    addRef(state, chatId, link('tab', 1, 'x'.repeat(500))).conversations[0]
      .refs[0].title.length,
    200,
  );
});

test('unlinking removes only that link', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addRef(
    addRef(state, chatId, link('tab', 1, 'a')),
    chatId,
    link('space', 1, 'b'),
  );
  state = removeRef(state, chatId, 'tab', 1);
  assert.deepEqual(
    state.conversations[0].refs.map((r) => [r.kind, r.id]),
    [['space', 1]],
  );
  assert.equal(
    removeRef(state, chatId, 'tab', 99).conversations[0].refs.length,
    1,
  );
});

test('a reopened tab is a new tab: the link follows it', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addRef(state, chatId, link('tab', 1, 'Old', 'https://old.example/'));
  state = retargetRef(state, chatId, 'tab', 1, {
    id: 50,
    title: 'Old',
    url: 'https://old.example/',
  });
  assert.deepEqual(
    state.conversations[0].refs.map((r) => r.id),
    [50],
  );
  // Unknown old link: nothing changes. Target already linked: just drops the old link.
  assert.equal(
    retargetRef(state, chatId, 'tab', 99, { id: 60, title: 'x', url: null }),
    state,
  );
  let twice = addRef(
    addRef(defaultChats(NOW), chatId, link('tab', 1)),
    chatId,
    link('tab', 2),
  );
  twice = retargetRef(twice, chatId, 'tab', 1, {
    id: 2,
    title: 'x',
    url: null,
  });
  assert.deepEqual(
    twice.conversations[0].refs.map((r) => r.id),
    [2],
  );
});

test('remembered names follow the workspace, and closed items keep their last copy', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addRef(
    addRef(state, chatId, link('tab', 1, 'Old title', 'https://a.example/')),
    chatId,
    link('tab', 2, 'Closed one', 'https://b.example/'),
  );
  const lookup = (kind: string, id: number) =>
    kind === 'tab' && id === 1
      ? { title: 'New title', url: 'https://a.example/new' }
      : null;
  const refreshed = refreshRefs(state, lookup);
  assert.deepEqual(
    refreshed.conversations[0].refs.map((r) => [r.id, r.title, r.url]),
    [
      [1, 'New title', 'https://a.example/new'],
      [2, 'Closed one', 'https://b.example/'],
    ],
  );
  // Nothing changed: the very same state comes back (cheap to detect).
  assert.equal(refreshRefs(refreshed, lookup), refreshed);
  assert.equal(
    refreshRefs(state, () => null),
    state,
  );
});

test('links with remembered names survive a round trip, and bad ones are repaired', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addRef(
    state,
    chatId,
    link('tab', 3, 'Docs', 'https://docs.example.com/'),
  );
  assert.deepEqual(parseChats(JSON.parse(JSON.stringify(state)), NOW), state);
  const repaired = parseChats(
    {
      conversations: [
        {
          id: 1,
          refs: [
            { kind: 'tab', id: 1, title: 'ok', url: 'https://ok.example/' },
            { kind: 'tab', id: 2, title: 7, url: 'file:///C:/x' },
            {
              kind: 'space',
              id: 3,
              title: 'S',
              url: 'https://not-for-spaces.example/',
            },
          ],
        },
      ],
    },
    NOW,
  );
  assert.deepEqual(
    repaired.conversations[0].refs.map((r) => [r.id, r.title, r.url]),
    [
      [1, 'ok', 'https://ok.example/'],
      [2, '', null],
      [3, 'S', null],
    ],
  );
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

test('a message keeps tokens for what it mentioned, even after the link is removed', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addRef(state, chatId, link('tab', 1, 'Old', 'https://old.example/'));
  const sent = addUserMessage(state, chatId, 'see @Old and @Other', NOW, [
    { kind: 'tab', id: 1, tag: '@Old' },
    // Not linked, not in the text, and junk: all dropped.
    { kind: 'tab', id: 2, tag: '@Other' },
    { kind: 'tab', id: 1, tag: '@Missing' },
    { kind: 'bad', id: 3, tag: '@Old' },
  ]);
  assert.ok(sent);
  state = sent.state;
  const expected = [
    {
      kind: 'tab',
      id: 1,
      tag: '@Old',
      title: 'Old',
      url: 'https://old.example/',
    },
  ];
  assert.deepEqual(state.conversations[0].messages[0].mentions, expected);

  // Removing the link leaves the token in the old message.
  state = removeRef(state, chatId, 'tab', 1);
  assert.deepEqual(state.conversations[0].refs, []);
  assert.deepEqual(state.conversations[0].messages[0].mentions, expected);

  // Reopening follows the token to the new tab, and survives a save and load.
  state = retargetRef(state, chatId, 'tab', 1, {
    id: 50,
    title: 'Old',
    url: 'https://old.example/',
  });
  assert.equal(state.conversations[0].messages[0].mentions[0].id, 50);
  const again = parseChats(JSON.parse(JSON.stringify(state)), NOW);
  assert.deepEqual(again.conversations[0].messages[0].mentions, [
    { ...expected[0], id: 50 },
  ]);
});

test('links added without an @name are attached to the next message once', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addRef(state, chatId, link('tab', 1, 'A', 'https://a.example/'));
  state = addUserMessage(state, chatId, 'first', NOW, [])!.state;
  assert.deepEqual(
    state.conversations[0].messages[0].mentions.map((m) => [m.id, m.tag]),
    [[1, '']],
  );
  // Still linked, but already shown: the next message does not repeat it.
  state = addUserMessage(state, chatId, 'second', NOW, [])!.state;
  const users = state.conversations[0].messages.filter(
    (m) => m.role === 'user',
  );
  assert.deepEqual(users[1].mentions, []);
  // A newly added link shows up on the message after that.
  state = addRef(state, chatId, link('space', 2, 'S'));
  state = addUserMessage(state, chatId, 'third', NOW, [])!.state;
  const third = state.conversations[0].messages.filter(
    (m) => m.role === 'user',
  )[2];
  assert.deepEqual(
    third.mentions.map((m) => [m.kind, m.id]),
    [['space', 2]],
  );
});

test('a reopened page is picked up by every chat that used it (a removed link stays removed)', () => {
  let state = defaultChats(NOW);
  const first = state.activeId;
  state = addRef(state, first, link('tab', 1, 'A', 'https://a.example/'));
  state = addUserMessage(state, first, 'hi', NOW, [])!.state;
  state = removeRef(state, first, 'tab', 1); // link gone, token stays
  const second = newConversation(state, NOW);
  state = second.state;
  state = addRef(state, second.id, link('tab', 1, 'A', 'https://a.example/'));

  const next = { id: 9, title: 'A', url: 'https://a.example/' };
  state = retargetEverywhere(state, 'tab', 1, next);

  const [c1, c2] = state.conversations;
  assert.deepEqual(c1.refs, []);
  assert.equal(c1.messages[0].mentions[0].id, 9);
  assert.deepEqual(
    c2.refs.map((r) => r.id),
    [9],
  );
});

test('replies saved before parts existed are converted, and parts survive a save and load', () => {
  const old = parseChats(
    {
      version: 1,
      nextId: 10,
      activeId: 1,
      conversations: [
        {
          id: 1,
          title: 'Old',
          messages: [
            { id: 2, role: 'user', content: 'hi' },
            {
              id: 3,
              role: 'assistant',
              content: 'The answer.',
              reasoning: 'Let me think.',
              steps: [{ id: 1, label: 'Read: Page', status: 'ok' }],
            },
          ],
        },
      ],
    },
    NOW,
  );
  const reply = old.conversations[0].messages[1];
  assert.deepEqual(
    reply.parts.map((p) => p.type),
    ['thinking', 'tool', 'text'],
  );
  assert.equal(reply.content, 'The answer.');
  assert.equal(reply.reasoning, 'Let me think.');

  // New style: a call left "running" is marked failed on load; bad parts are dropped.
  const saved = JSON.parse(JSON.stringify(old));
  saved.conversations[0].messages[1].parts = [
    { type: 'text', text: 'A' },
    {
      type: 'tool',
      id: 1,
      callId: 'c1',
      name: 'read_page',
      arguments: '{"tab":1}',
      label: 'Reading',
      status: 'running',
      outcome: '',
    },
    { type: 'bogus' },
    { type: 'text', text: 'B' },
  ];
  saved.conversations[0].messages[1].content = 'ignored';
  const again = parseChats(saved, NOW).conversations[0].messages[1];
  assert.deepEqual(
    again.parts.map((p) => p.type),
    ['text', 'tool', 'text'],
  );
  assert.equal(
    again.parts[1].type === 'tool' && again.parts[1].status,
    'error',
  );
  assert.equal(again.content, 'AB'); // rebuilt from the parts
});

test('choices are kept in place in a reply, tidied, and survive a save and load', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addUserMessage(state, chatId, 'hi', NOW, [])!.state;
  const reply = startAssistantMessage(state, chatId, 'm', NOW)!;
  state = appendToMessage(reply.state, chatId, reply.id, 'Which one?');
  state = addChoicesPart(state, chatId, reply.id, {
    question: 'Pick',
    options: ['One', 'Two'],
  });
  const message = findMessage(state, chatId, reply.id)!;
  assert.deepEqual(
    message.parts.map((p) => p.type),
    ['text', 'choices'],
  );
  const again = parseChats(JSON.parse(JSON.stringify(state)), NOW);
  const loaded = again.conversations[0].messages[1];
  assert.deepEqual(loaded.parts[1], {
    type: 'choices',
    question: 'Pick',
    options: ['One', 'Two'],
  });
  // Fewer than two usable options are dropped when loading.
  const saved = JSON.parse(JSON.stringify(state));
  saved.conversations[0].messages[1].parts[1].options = ['Only'];
  const dropped = parseChats(saved, NOW).conversations[0].messages[1];
  assert.deepEqual(
    dropped.parts.map((p) => p.type),
    ['text'],
  );
});

test('truncateAfter keeps a message and removes everything after it', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  const first = addUserMessage(state, chatId, 'one', NOW, [])!;
  state = first.state;
  state = addUserMessage(state, chatId, 'two', NOW, [])!.state;
  state = addUserMessage(state, chatId, 'three', NOW, [])!.state;
  const cut = truncateAfter(state, chatId, first.id);
  assert.deepEqual(
    cut.conversations[0].messages.map((m) => m.content),
    ['one'],
  );
  // Nothing to remove, or an unknown message: the same state comes back.
  assert.equal(truncateAfter(cut, chatId, first.id), cut);
  assert.equal(truncateAfter(state, chatId, 9999), state);
});

test('branching copies a message and its reply into a new active chat and leaves the original alone', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = renameConversation(state, chatId, 'Pandas');
  state = addRef(state, chatId, link('tab', 1, 'Zoo', 'https://zoo.example/'));
  const first = addUserMessage(state, chatId, 'one', NOW, [])!;
  state = first.state;
  const reply = startAssistantMessage(state, chatId, 'm', NOW)!;
  state = appendToMessage(reply.state, chatId, reply.id, 'answer one');
  state = finishMessage(state, chatId, reply.id, { status: 'done' });
  state = addUserMessage(state, chatId, 'two', NOW, [])!.state;

  const branched = branchConversation(state, chatId, first.id, NOW + 5)!;
  assert.ok(branched);
  const [original, copy] = branched.state.conversations;
  // The original is untouched.
  assert.equal(original.messages.length, 3);
  assert.equal(original.title, 'Pandas');
  // The copy ends after the chosen message and its reply, keeps the links, and
  // is now active.
  assert.deepEqual(
    copy.messages.map((m) => m.content),
    ['one', 'answer one'],
  );
  assert.equal(copy.title, 'Pandas (branch)');
  assert.deepEqual(
    copy.refs.map((r) => r.id),
    [1],
  );
  assert.equal(branched.state.activeId, copy.id);
  assert.notEqual(copy.id, original.id);
  assert.equal(branched.state.nextId, copy.id + 1);

  // Only one of your own messages can be branched from.
  assert.equal(branchConversation(state, chatId, reply.id, NOW), null);
  assert.equal(branchConversation(state, chatId, 9999, NOW), null);
  assert.equal(branchConversation(state, 9999, first.id, NOW), null);
});

test('stray blank text between tool calls makes no part, so no gap shows', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addUserMessage(state, chatId, 'go', NOW, [])!.state;
  const reply = startAssistantMessage(state, chatId, 'm', NOW)!;
  state = reply.state;
  state = addToolPart(state, chatId, reply.id, {
    callId: 'a',
    name: 'click',
    arguments: '{}',
    label: 'one',
  })!.state;
  // Blank text (and blank thinking) after a tool call: no new part.
  state = appendToMessage(state, chatId, reply.id, '\n\n');
  state = appendReasoning(state, chatId, reply.id, ' \n');
  state = addToolPart(state, chatId, reply.id, {
    callId: 'b',
    name: 'click',
    arguments: '{}',
    label: 'two',
  })!.state;
  // Real text starts a part without its leading blank space.
  state = appendToMessage(state, chatId, reply.id, '\n  Done');
  state = appendToMessage(state, chatId, reply.id, ' now.');
  const message = findMessage(state, chatId, reply.id)!;
  assert.deepEqual(
    message.parts.map((p) => p.type),
    ['tool', 'tool', 'text'],
  );
  assert.equal(
    message.parts[2].type === 'text' && message.parts[2].text,
    'Done now.',
  );
});

test('what a tool found is kept with the call, cut to a limit, and survives a save and load', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addUserMessage(state, chatId, 'search', NOW, [])!.state;
  const reply = startAssistantMessage(state, chatId, 'm', NOW)!;
  const added = addToolPart(reply.state, chatId, reply.id, {
    callId: 'c',
    name: 'web_search',
    arguments: '{"query":"pandas"}',
    label: 'Searching',
  })!;
  state = finishToolPart(added.state, chatId, reply.id, added.partId, {
    ok: true,
    details: 'Search: "pandas"\n[1] Zoo - https://zoo.example/',
  });
  const part = findMessage(state, chatId, reply.id)!.parts[0];
  assert.equal(
    part.type === 'tool' && part.details.startsWith('Search: "pandas"'),
    true,
  );
  const again = parseChats(JSON.parse(JSON.stringify(state)), NOW)
    .conversations[0].messages[1];
  assert.equal(
    again.parts[0].type === 'tool' &&
      again.parts[0].details.includes('zoo.example'),
    true,
  );
  // Too much is cut.
  state = finishToolPart(state, chatId, reply.id, added.partId, {
    ok: true,
    details: 'x'.repeat(20_000),
  });
  const cut = findMessage(state, chatId, reply.id)!.parts[0];
  assert.equal(cut.type === 'tool' && cut.details.length, MAX_DETAILS);
});

test('an artifact can be linked to a chat; it keeps no address and is saved and loaded', () => {
  let state = defaultChats(NOW);
  const chatId = state.activeId;
  state = addRef(
    state,
    chatId,
    link('artifact', 4, 'Notes', 'https://sneaky.example/'),
  );
  assert.deepEqual(state.conversations[0].refs, [
    { kind: 'artifact', id: 4, title: 'Notes', url: null },
  ]);
  const loaded = parseChats(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(loaded.conversations[0].refs, state.conversations[0].refs);
  // A tab and an artifact with the same number are different links.
  state = addRef(state, chatId, link('tab', 4, 'Tab'));
  assert.equal(state.conversations[0].refs.length, 2);
  // Unknown kinds are still refused.
  assert.equal(addRef(state, chatId, link('widget' as never, 5)), state);
});

test('a chat is untouched until it has a message, a link or a name you chose', () => {
  const fresh = defaultChats(NOW);
  assert.equal(isUntouched(fresh.conversations[0]), true);
  const named = renameConversation(fresh, fresh.activeId, 'Plans');
  assert.equal(isUntouched(named.conversations[0]), false);
  const linked = addRef(fresh, fresh.activeId, {
    kind: 'space',
    id: 1,
    title: 'Home',
    url: null,
  });
  assert.equal(isUntouched(linked.conversations[0]), false);
  const spoken =
    addUserMessage(fresh, fresh.activeId, 'hi', NOW)?.state ?? fresh;
  assert.equal(isUntouched(spoken.conversations[0]), false);
});

test('startNewChat reuses an untouched chat instead of piling up empty ones', () => {
  const first = defaultChats(NOW);
  const again = startNewChat(startNewChat(first, NOW).state, NOW);
  assert.equal(again.state.conversations.length, 1);
  assert.equal(again.id, first.activeId);
});

test('startNewChat from a chat with messages makes one new chat and keeps the old', () => {
  const first = defaultChats(NOW);
  const spoken =
    addUserMessage(first, first.activeId, 'hello', NOW)?.state ?? first;
  const added = startNewChat(spoken, NOW + 1);
  assert.equal(added.state.conversations.length, 2);
  assert.equal(added.state.activeId, added.id);
  assert.notEqual(added.id, first.activeId);
  assert.equal(
    startNewChat(added.state, NOW + 2).state.conversations.length,
    2,
  );
});

test('leaving an untouched chat throws it away; leaving a used one does not', () => {
  const first = defaultChats(NOW);
  const spoken =
    addUserMessage(first, first.activeId, 'hello', NOW)?.state ?? first;
  const added = startNewChat(spoken, NOW + 1);
  // Back to the used chat: the empty one goes.
  const back = selectConversation(added.state, first.activeId);
  assert.deepEqual(
    back.conversations.map((c) => c.id),
    [first.activeId],
  );
  // An id that does not exist changes nothing.
  assert.equal(selectConversation(added.state, 9999), added.state);
  // The one to keep is never dropped, even if untouched.
  assert.equal(dropUntouched(first, first.activeId), first);
});
