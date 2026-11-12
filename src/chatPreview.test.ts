import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chatNeedOf,
  finishedNotice,
  hasApprovalWaiting,
  liveLine,
} from './chatPreview.ts';
import type { ChatMessage, MessagePart } from './chats.ts';

const message = (
  role: 'user' | 'assistant',
  parts: MessagePart[],
  status: ChatMessage['status'] = 'done',
): ChatMessage =>
  ({
    id: 1,
    role,
    content: '',
    reasoning: '',
    status,
    parts,
    mentions: [],
  }) as unknown as ChatMessage;

const tool = (
  status: 'waiting' | 'running' | 'ok',
  label: string,
  ask = '',
): MessagePart =>
  ({
    type: 'tool',
    id: 1,
    callId: 'c',
    name: 'click',
    arguments: '{}',
    label,
    status,
    outcome: '',
    details: '',
    ask,
    risky: false,
  }) as unknown as MessagePart;

const text = (value: string): MessagePart =>
  ({ type: 'text', text: value }) as unknown as MessagePart;
const thinking = (value: string): MessagePart =>
  ({ type: 'thinking', text: value }) as unknown as MessagePart;

test('the chat needs room for an approval first, then for a reply being written', () => {
  const waiting = [
    message('assistant', [tool('waiting', 'x', 'Click Buy')], 'streaming'),
  ];
  assert.equal(hasApprovalWaiting(waiting), true);
  assert.equal(chatNeedOf(waiting, true), 'approval');
  const writing = [message('assistant', [text('Hello')], 'streaming')];
  assert.equal(chatNeedOf(writing, true), 'activity');
  assert.equal(chatNeedOf(writing, false), 'none');
  assert.equal(chatNeedOf([], false), 'none');
  // An approval from an older reply is not waiting any more.
  const older = [
    message('assistant', [tool('waiting', 'x')]),
    message('user', []),
  ];
  assert.equal(hasApprovalWaiting(older), false);
});

test('the live line is the latest text, cleaned, or what the assistant is doing', () => {
  const line = liveLine([
    message(
      'assistant',
      [text('# Title\n\nFirst point\n- **Second** point here')],
      'streaming',
    ),
  ]);
  assert.deepEqual(line, { text: 'Second point here', working: true });
  assert.deepEqual(
    liveLine([message('assistant', [thinking('hmm')], 'streaming')]),
    {
      text: 'Thinking…',
      working: true,
    },
  );
  assert.deepEqual(
    liveLine([
      message(
        'assistant',
        [text('Done.'), tool('running', 'Reading: Docs')],
        'streaming',
      ),
    ]),
    { text: 'Reading: Docs', working: true },
  );
  // Waiting for approval shows what it wants to do.
  assert.equal(
    liveLine([
      message('assistant', [tool('waiting', 'x', 'Click “Buy”')], 'streaming'),
    ])?.text,
    'Click “Buy”',
  );
  // Nothing yet: still thinking. A finished empty reply: nothing to show.
  assert.deepEqual(liveLine([message('assistant', [], 'streaming')]), {
    text: 'Thinking…',
    working: true,
  });
  assert.equal(liveLine([message('assistant', [], 'done')]), null);
  // Your own newest message: no reply to show.
  assert.equal(liveLine([message('user', [text('hi')])]), null);
  // A very long line is cut.
  const long = liveLine([message('assistant', [text('a'.repeat(500))])]);
  assert.equal(long?.text.length, 200);
});

test('a finished reply gets a notice for the slim chat; one still being written does not', () => {
  assert.match(
    finishedNotice(message('assistant', [text('x')], 'done')) ?? '',
    /ready/,
  );
  assert.match(
    finishedNotice(message('assistant', [], 'stopped')) ?? '',
    /stopped/,
  );
  assert.match(
    finishedNotice(message('assistant', [], 'error')) ?? '',
    /could not/,
  );
  assert.equal(finishedNotice(message('assistant', [], 'streaming')), null);
  assert.equal(finishedNotice(message('user', [])), null);
  assert.equal(finishedNotice(undefined), null);
});
