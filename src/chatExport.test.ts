import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addToolPart,
  addUserMessage,
  appendToMessage,
  defaultChats,
  finishMessage,
  renameConversation,
  startAssistantMessage,
  activeConversation,
  addRef,
} from './chats.ts';
import type { ChatsState } from './chats.ts';
import { chatMarkdown } from './chatExport.ts';
import { exportFileName } from './spaceExport.ts';

const NOW = 1_700_000_000_000;
const DAY = new Date('2026-11-17T10:00:00Z');

// A chat with one exchange: you ask, the assistant uses a tool and answers.
function exchange(): ChatsState {
  let state = defaultChats(NOW);
  const id = state.activeId;
  state = renameConversation(state, id, 'Goldfish *plans*');
  state = addRef(state, id, {
    kind: 'tab',
    id: 4,
    title: 'Pet shop',
    url: 'https://user:secret@shop.example/fish?x=1',
  });
  state = addRef(state, id, {
    kind: 'space',
    id: 2,
    title: 'Shopping',
    url: null,
  });
  const asked = addUserMessage(state, id, 'Where can I buy goldfish?', NOW);
  assert.ok(asked);
  state = asked.state;
  const reply = startAssistantMessage(state, id, 'openrouter/free', NOW);
  assert.ok(reply);
  state = reply.state;
  const tool = addToolPart(state, id, reply.id, {
    callId: 'c1',
    name: 'read_page',
    arguments: '{}',
    label: 'Reading: Pet shop',
    risky: false,
  });
  assert.ok(tool);
  state = tool.state;
  state = appendToMessage(state, id, reply.id, 'Try the **pet shop**.');
  state = finishMessage(state, id, reply.id, { status: 'done' }, NOW);
  return state;
}

test('a chat becomes a Markdown file with its links, your words and the answers', () => {
  const text = chatMarkdown(activeConversation(exchange()), DAY);
  assert.match(text, /^# Goldfish \\\*plans\\\*\n/);
  assert.match(text, /_Exported 2026-11-17/);
  // Addresses lose passwords; a Space is named, not linked.
  assert.match(text, /- \[Pet shop\]\(https:\/\/shop\.example\/fish\?x=1\)/);
  assert.ok(!text.includes('secret'));
  assert.match(text, /- Shopping \(space\)/);
  assert.match(text, /### You\n\nWhere can I buy goldfish\?/);
  assert.match(
    text,
    /### Assistant\n\n_Reading: Pet shop_\n\nTry the \*\*pet shop\*\*\./,
  );
});

test('stopped and failed replies are marked, and an empty chat says so', () => {
  const base = defaultChats(NOW);
  const id = base.activeId;
  const asked = addUserMessage(base, id, 'Hi', NOW);
  assert.ok(asked);
  const reply = startAssistantMessage(asked.state, id, 'm', NOW);
  assert.ok(reply);
  const stopped = finishMessage(
    reply.state,
    id,
    reply.id,
    { status: 'stopped' },
    NOW,
  );
  assert.match(chatMarkdown(activeConversation(stopped), DAY), /_\(stopped\)_/);
  const failed = finishMessage(
    reply.state,
    id,
    reply.id,
    { status: 'error', errorKind: 'network' },
    NOW,
  );
  assert.match(
    chatMarkdown(activeConversation(failed), DAY),
    /this reply failed/,
  );
  assert.match(
    chatMarkdown(activeConversation(base), DAY),
    /_No messages yet\._/,
  );
});

test('the file name comes from the chat name, with "Chat" when it has none', () => {
  assert.equal(
    exportFileName('Goldfish: plans/2', 'Chat'),
    'Goldfish plans 2.md',
  );
  assert.equal(exportFileName('   ', 'Chat'), 'Chat.md');
  assert.equal(exportFileName('   '), 'Space.md');
});
