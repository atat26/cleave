import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addToolPart,
  addUserMessage,
  appendToMessage,
  branchBeforeMessage,
  branchConversation,
  defaultChats,
  deleteConversation,
  findMessage,
  restoreConversation,
  startAssistantMessage,
} from './chats.ts';
import type { ChatsState, MessagePart } from './chats.ts';

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

const NOW = 1_700_000_000_000;

// A chat in the middle of a reply: some text, a step that is running and one waiting for approval.
function midReply() {
  let state: ChatsState = defaultChats(NOW);
  const chat = state.activeId;
  const user = addUserMessage(state, chat, 'Do the thing', NOW, [])!;
  state = user.state;
  const reply = startAssistantMessage(state, chat, 'm', NOW)!;
  state = appendToMessage(reply.state, chat, reply.id, 'Working on it');
  const running = addToolPart(state, chat, reply.id, {
    callId: 'a',
    name: 'read_page',
    arguments: '{}',
    label: 'Reading',
  })!;
  const waiting = addToolPart(running.state, chat, reply.id, {
    callId: 'b',
    name: 'click',
    arguments: '{}',
    label: 'Click',
    ask: 'Click Buy?',
  })!;
  return { state: waiting.state, chat, user: user.id, reply: reply.id };
}

const toolsOf = (state: ChatsState, chat: number, message: number) =>
  findMessage(state, chat, message)!.parts.filter(
    (p): p is ToolPart => p.type === 'tool',
  );

test('deleting a chat in the middle of a reply puts it away settled, so it comes back usable', () => {
  const { state, chat, reply } = midReply();
  assert.equal(findMessage(state, chat, reply)!.status, 'streaming');
  const gone = deleteConversation(state, chat, NOW + 1);
  const away = gone.trash[0].messages.find((m) => m.id === reply)!;
  assert.equal(away.status, 'stopped');
  assert.equal(away.content, 'Working on it');
  for (const part of away.parts) {
    if (part.type === 'tool') {
      assert.equal(part.status, 'error');
      assert.equal(part.skipped, true);
    }
  }
  // Brought back, nothing is still running or waiting, and a retry is possible (the reply is "stopped").
  const back = restoreConversation(gone, chat);
  const restored = findMessage(back, chat, reply)!;
  assert.equal(restored.status, 'stopped');
  assert.ok(toolsOf(back, chat, reply).every((p) => p.status === 'error'));
});

test('a chat put away by an older version with a reply that never finished is settled when it is restored', () => {
  const { state, chat, reply } = midReply();
  // (As an older version left it: the reply still "streaming" in the trash.)
  const trashed: ChatsState = {
    ...state,
    conversations: [],
    trash: [{ ...state.conversations[0], deletedAt: NOW }],
  };
  const back = restoreConversation(trashed, chat);
  assert.equal(findMessage(back, chat, reply)!.status, 'stopped');
});

test('branching a chat that is still replying copies the reply settled, and leaves the original running', () => {
  const { state, chat, user, reply } = midReply();
  const branched = branchConversation(state, chat, user, NOW + 1)!;
  const copy = branched.state.conversations.find((c) => c.id === branched.id)!;
  const copied = copy.messages.find((m) => m.role === 'assistant')!;
  assert.equal(copied.status, 'stopped');
  assert.ok(
    copied.parts.every(
      (p) =>
        p.type !== 'tool' || (p.status !== 'running' && p.status !== 'waiting'),
    ),
  );
  // The original is untouched: its reply is still going.
  assert.equal(findMessage(branched.state, chat, reply)!.status, 'streaming');
  assert.ok(
    toolsOf(branched.state, chat, reply).some((p) => p.status === 'waiting'),
  );
  // Branching before a message (to edit it) settles whatever it copies too.
  const before = branchBeforeMessage(state, chat, user, NOW + 2)!;
  const editCopy = before.state.conversations.find((c) => c.id === before.id)!;
  assert.equal(editCopy.messages.length, 0);
});
