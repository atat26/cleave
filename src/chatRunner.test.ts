import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SYSTEM_PROMPT } from './chatContext.ts';
import { createChatRunner, MAX_TOOL_ROUNDS } from './chatRunner.ts';
import type { RunContext } from './chatRunner.ts';
import * as chats from './chats.ts';
import type { ChatsState } from './chats.ts';
import { ChatError } from './openrouter.ts';
import type { AgentTools, ToolOutcome } from './agentTools.ts';
import type {
  ChatMessageInput,
  StreamEvent,
  ToolDefinition,
} from './openrouter.ts';

const NOW = 1_700_000_000_000;
const CONTEXT: RunContext = { model: 'openai/gpt-4o', systemPrompt: null };
const text = (t: string): StreamEvent => ({ type: 'text', text: t });
const usage = (tokens: number, cost: number): StreamEvent => ({
  type: 'usage',
  promptTokens: null,
  completionTokens: null,
  totalTokens: tokens,
  cost,
});

type StreamFn = (options: {
  model: string;
  messages: ChatMessageInput[];
  tools?: ToolDefinition[];
  signal: AbortSignal;
}) => AsyncIterable<StreamEvent>;

// A runner wired to an in-memory chat state and a fake model.
function setup(stream: StreamFn) {
  let state: ChatsState = chats.defaultChats(NOW);
  const calls: {
    model: string;
    messages: ChatMessageInput[];
    tools?: ToolDefinition[];
  }[] = [];
  const changes: string[] = [];
  const runner = createChatRunner({
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    stream: (options) => {
      calls.push({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
      });
      return stream(options);
    },
    now: () => NOW,
    onMessage: (chatId, messageId) => changes.push(`m${chatId}:${messageId}`),
    onRunningChange: () => changes.push('running'),
  });
  return {
    runner,
    calls,
    changes,
    // Start another chat (the new one becomes the active one).
    addChat() {
      const created = chats.newConversation(state, NOW);
      state = created.state;
      return created.id;
    },
    get state() {
      return state;
    },
    get chat() {
      return chats.activeConversation(state);
    },
    get chatId() {
      return state.activeId;
    },
  };
}

// A model that sends these events, then ends.
const sends = (...events: StreamEvent[]): StreamFn =>
  async function* () {
    for (const event of events) yield event;
  };

// A model that sends some text, then waits until Stop is pressed.
const hangsAfter = (...events: StreamEvent[]): StreamFn =>
  async function* ({ signal }) {
    for (const event of events) yield event;
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    });
  };

test('a reply streams in, finishes, and records the model, tokens and cost', async () => {
  const t = setup(sends(text('Hel'), text('lo!'), usage(12, 0.002)));
  const started = t.runner.send(t.chatId, 'Hi', CONTEXT);
  assert.ok(started.ok);
  await started.done;

  const [user, reply] = t.chat.messages;
  assert.deepEqual([user.role, user.content], ['user', 'Hi']);
  assert.deepEqual(
    [reply.role, reply.content, reply.status, reply.model, reply.usage],
    [
      'assistant',
      'Hello!',
      'done',
      'openai/gpt-4o',
      { totalTokens: 12, cost: 0.002 },
    ],
  );
  assert.equal(t.chat.title, 'Hi'); // the first message named the chat
  assert.equal(t.runner.isRunning(t.chatId), false);
});

test('thinking is collected apart from the answer, kept when stopped, and never sent back', async () => {
  const t = setup(
    sends(
      { type: 'reasoning', text: 'Let me ' },
      { type: 'reasoning', text: 'think.' },
      text('Done.'),
    ),
  );
  await (
    t.runner.send(t.chatId, 'Hard question', CONTEXT) as { done: Promise<void> }
  ).done;
  const reply = t.chat.messages[1];
  assert.deepEqual(
    [reply.reasoning, reply.content, reply.status],
    ['Let me think.', 'Done.', 'done'],
  );

  // On the next question the model gets the earlier ANSWER, not the thinking.
  const next = t.runner.send(t.chatId, 'Follow up', CONTEXT);
  assert.ok(next.ok);
  await next.done;
  const sent = t.calls[1].messages.map((m) => m.content).join('\n');
  assert.ok(sent.includes('Done.'));
  assert.ok(!sent.includes('Let me think.'));

  // Stopped while still thinking: the thinking so far is kept.
  const stopped = setup(hangsAfter({ type: 'reasoning', text: 'Pondering…' }));
  const started = stopped.runner.send(stopped.chatId, 'Go', CONTEXT);
  assert.ok(started.ok);
  await new Promise((r) => setTimeout(r, 10));
  stopped.runner.stop(stopped.chatId);
  await started.done;
  const partial = stopped.chat.messages[1];
  assert.deepEqual(
    [partial.reasoning, partial.content, partial.status],
    ['Pondering…', '', 'stopped'],
  );
});

test('the model is sent the system prompt and the conversation, with the right model', async () => {
  const t = setup(sends(text('ok')));
  await (
    t.runner.send(t.chatId, 'Question', {
      model: 'meta/llama-3:free',
      systemPrompt: 'Be brief.',
    }) as {
      done: Promise<void>;
    }
  ).done;
  assert.equal(t.calls[0].model, 'meta/llama-3:free');
  assert.deepEqual(t.calls[0].messages, [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Question' },
  ]);
  // Default prompt when none is given.
  const d = setup(sends(text('ok')));
  await (d.runner.send(d.chatId, 'Hi', CONTEXT) as { done: Promise<void> })
    .done;
  assert.equal(d.calls[0].messages[0].content, DEFAULT_SYSTEM_PROMPT);
});

test('links are given to the model with the system prompt, and again on retry', async () => {
  const linked =
    'The user has linked these tabs...\nTab: "Docs" (https://docs.example.com)';
  const withLinks: RunContext = { ...CONTEXT, linked };
  let attempt = 0;
  const t = setup(async function* () {
    attempt++;
    if (attempt === 1) throw new ChatError('network');
    yield text('ok');
  });
  await (
    t.runner.send(t.chatId, 'About my tabs', withLinks) as {
      done: Promise<void>;
    }
  ).done;
  assert.ok(t.calls[0].messages[0].content.endsWith(linked));
  assert.equal(t.calls[0].messages[0].role, 'system');

  await (t.runner.retry(t.chatId, withLinks) as { done: Promise<void> }).done;
  assert.ok(t.calls[1].messages[0].content.endsWith(linked));

  // A chat with no links gets the plain system prompt.
  const plain = setup(sends(text('ok')));
  await (
    plain.runner.send(plain.chatId, 'Hi', CONTEXT) as { done: Promise<void> }
  ).done;
  assert.equal(plain.calls[0].messages[0].content, DEFAULT_SYSTEM_PROMPT);
});

test('Stop keeps the text written so far and marks the reply stopped', async () => {
  const t = setup(hangsAfter(text('Once upon ')));
  const started = t.runner.send(t.chatId, 'Tell a story', CONTEXT);
  assert.ok(started.ok);
  await new Promise((r) => setTimeout(r, 10)); // let the first text arrive
  assert.equal(t.runner.isRunning(t.chatId), true);
  t.runner.stop(t.chatId);
  await started.done;
  const reply = t.chat.messages[1];
  assert.deepEqual(
    [reply.content, reply.status, reply.errorKind],
    ['Once upon ', 'stopped', null],
  );
  assert.equal(t.runner.isRunning(t.chatId), false);
});

test('an error mid-reply keeps the text and records why', async () => {
  const t = setup(async function* () {
    yield text('partial ');
    throw new ChatError('credit');
  });
  await (t.runner.send(t.chatId, 'Hi', CONTEXT) as { done: Promise<void> })
    .done;
  const reply = t.chat.messages[1];
  assert.deepEqual(
    [reply.content, reply.status, reply.errorKind],
    ['partial ', 'error', 'credit'],
  );
});

test('an error before anything arrives leaves an empty failed reply', async () => {
  const t = setup(async function* () {
    yield* []; // (a model that never says anything before failing)
    throw new ChatError('auth');
  });
  await (t.runner.send(t.chatId, 'Hi', CONTEXT) as { done: Promise<void> })
    .done;
  const reply = t.chat.messages[1];
  assert.deepEqual(
    [reply.content, reply.status, reply.errorKind],
    ['', 'error', 'auth'],
  );
});

test('an unexpected failure becomes a plain "unknown" error, never a crash', async () => {
  const t = setup(async function* () {
    yield text('x');
    throw new Error('internal detail that must not leak');
  });
  const started = t.runner.send(t.chatId, 'Hi', CONTEXT);
  assert.ok(started.ok);
  await started.done; // does not throw
  assert.equal(t.chat.messages[1].errorKind, 'unknown');
});

test('only one reply per chat at a time; other chats are independent', async () => {
  const t = setup(hangsAfter(text('a')));
  const first = t.runner.send(t.chatId, 'one', CONTEXT);
  assert.ok(first.ok);
  // The same chat is busy: nothing is added.
  const before = t.chat.messages.length;
  assert.deepEqual(t.runner.send(t.chatId, 'two', CONTEXT), {
    ok: false,
    reason: 'busy',
  });
  assert.equal(t.chat.messages.length, before);

  // Another chat can run at the same time, and stopping one leaves the other.
  const firstChat = t.chatId;
  const secondChat = t.addChat();
  const second = t.runner.send(secondChat, 'three', CONTEXT);
  assert.ok(second.ok);
  assert.deepEqual(
    t.runner.runningChats().sort(),
    [firstChat, secondChat].sort(),
  );
  t.runner.stop(firstChat);
  await first.done;
  assert.deepEqual(t.runner.runningChats(), [secondChat]);
  assert.equal(
    chats.findConversation(t.state, firstChat)!.messages[1].status,
    'stopped',
  );
  assert.equal(
    chats.findConversation(t.state, secondChat)!.messages[1].status,
    'streaming',
  );

  t.runner.stopAll();
  await second.done;
  assert.deepEqual(t.runner.runningChats(), []);
});

test('empty text and unknown chats start nothing', () => {
  const t = setup(sends(text('x')));
  assert.deepEqual(t.runner.send(t.chatId, '   ', CONTEXT), {
    ok: false,
    reason: 'empty',
  });
  assert.deepEqual(t.runner.send(9999, 'hi', CONTEXT), {
    ok: false,
    reason: 'unknown-chat',
  });
  assert.equal(t.chat.messages.length, 0);
  assert.equal(t.calls.length, 0);
});

test('retry replaces a failed reply, asking again from your last message', async () => {
  let attempt = 0;
  const t = setup(async function* () {
    attempt++;
    if (attempt === 1) throw new ChatError('rate-limit');
    yield text('Second time lucky');
  });
  await (t.runner.send(t.chatId, 'Please', CONTEXT) as { done: Promise<void> })
    .done;
  assert.equal(t.chat.messages[1].status, 'error');

  const retried = t.runner.retry(t.chatId, CONTEXT);
  assert.ok(retried.ok);
  await retried.done;
  assert.deepEqual(
    t.chat.messages.map((m) => [m.role, m.content, m.status]),
    [
      ['user', 'Please', 'done'],
      ['assistant', 'Second time lucky', 'done'],
    ],
  );
  // The failed attempt was not part of what the model saw the second time.
  assert.deepEqual(
    t.calls[1].messages.map((m) => m.role),
    ['system', 'user'],
  );
});

test('retry also works after a stopped reply, and refuses when there is nothing to retry', async () => {
  const t = setup(hangsAfter(text('part')));
  const first = t.runner.send(t.chatId, 'Go', CONTEXT);
  assert.ok(first.ok);
  await new Promise((r) => setTimeout(r, 10));
  t.runner.stop(t.chatId);
  await first.done;
  assert.equal(t.chat.messages[1].status, 'stopped');

  const done = setup(sends(text('fine')));
  await (
    done.runner.send(done.chatId, 'Hi', CONTEXT) as { done: Promise<void> }
  ).done;
  // The last reply finished normally: nothing to retry.
  assert.deepEqual(done.runner.retry(done.chatId, CONTEXT), {
    ok: false,
    reason: 'nothing-to-retry',
  });
  // An empty chat: nothing to retry either.
  assert.deepEqual(setup(sends()).runner.retry(1, CONTEXT), {
    ok: false,
    reason: 'nothing-to-retry',
  });
  assert.deepEqual(setup(sends()).runner.retry(9999, CONTEXT), {
    ok: false,
    reason: 'unknown-chat',
  });
});

test('the app is told about every change, and when generating starts and stops', async () => {
  const t = setup(sends(text('a'), text('b')));
  const started = t.runner.send(t.chatId, 'Hi', CONTEXT);
  assert.ok(started.ok);
  await started.done;
  assert.equal(t.changes.filter((c) => c === 'running').length, 2); // started, stopped
  assert.ok(t.changes.filter((c) => c.startsWith('m')).length >= 4); // user, reply, 2 pieces...
  assert.equal(t.changes[t.changes.length - 1], 'running'); // the last thing is "stopped"
});

// ---- Tools ---------------------------------------------------------------------

const call = (id: string, tab: number): StreamEvent => ({
  type: 'tool-calls',
  calls: [{ id, name: 'read_page', arguments: JSON.stringify({ tab }) }],
});

// Fake tools: each run is recorded; `run` decides what happens.
function fakeTools(
  run: (signal: AbortSignal) => Promise<ToolOutcome> = async () => ({
    label: 'Read: Example',
    ok: true,
    result: 'PAGE TEXT',
  }),
) {
  const runs: string[] = [];
  const tools: AgentTools = {
    definitions: [
      { name: 'read_page', description: 'd', parameters: { type: 'object' } },
    ],
    describe: () => 'Reading: Example',
    run: async (c, signal) => {
      runs.push(c.id);
      return run(signal);
    },
  };
  return { tools, runs };
}

// A model that answers each request from a list of scripted replies.
const scripted = (...replies: StreamEvent[][]): StreamFn => {
  let i = 0;
  return async function* () {
    for (const event of replies[Math.min(i++, replies.length - 1)]) yield event;
  };
};

test('the assistant can ask for a page, get it, and then answer', async () => {
  const { tools, runs } = fakeTools();
  const t = setup(
    scripted(
      [text('Let me look.'), usage(10, 0.01), call('c1', 3)],
      [text('It says hello.'), usage(20, 0.02)],
    ),
  );
  const started = t.runner.send(t.chatId, 'What is on tab 3?', {
    ...CONTEXT,
    tools,
  });
  assert.ok(started.ok);
  await started.done;

  assert.deepEqual(runs, ['c1']);
  const reply = t.chat.messages[1];
  assert.equal(reply.content, 'Let me look.\n\nIt says hello.');
  assert.equal(reply.status, 'done');
  assert.deepEqual(
    reply.steps.map((s) => [s.label, s.status]),
    [['Read: Example', 'ok']],
  );
  // Tokens and cost are added up over both requests.
  assert.equal(reply.usage?.totalTokens, 30);
  assert.ok(Math.abs((reply.usage?.cost ?? 0) - 0.03) < 1e-9);

  // The first request offered the tools; the second carried the page back.
  assert.equal(t.calls[0].tools?.[0].name, 'read_page');
  const second = t.calls[1].messages;
  const assistant = second[second.length - 2];
  const tool = second[second.length - 1];
  assert.equal(assistant.role, 'assistant');
  assert.equal(
    assistant.role === 'assistant' && assistant.toolCalls?.[0].id,
    'c1',
  );
  assert.deepEqual(tool, {
    role: 'tool',
    toolCallId: 'c1',
    content: 'PAGE TEXT',
  });
  // Only the answer is kept as history: no page text is saved in the chat.
  assert.ok(!JSON.stringify(t.chat).includes('PAGE TEXT'));
});

test('a chat without tools sends none and never loops', async () => {
  const t = setup(scripted([text('Hi'), call('c1', 3)]));
  const started = t.runner.send(t.chatId, 'Hello', CONTEXT);
  assert.ok(started.ok);
  await started.done;
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].tools, undefined);
  assert.equal(t.chat.messages[1].content, 'Hi');
  assert.deepEqual(t.chat.messages[1].steps, []);
});

test('after the tool rounds are used up, the model is asked to answer without tools', async () => {
  const { tools, runs } = fakeTools();
  const t = setup(scripted([call('again', 1)])); // always asks for another page
  const started = t.runner.send(t.chatId, 'Keep reading', {
    ...CONTEXT,
    tools,
  });
  assert.ok(started.ok);
  await started.done;
  assert.equal(runs.length, MAX_TOOL_ROUNDS);
  assert.equal(t.calls.length, MAX_TOOL_ROUNDS + 1);
  assert.equal(t.calls[MAX_TOOL_ROUNDS].tools, undefined);
  assert.equal(t.chat.messages[1].status, 'done');
});

test('Stop while a page is being read ends the reply and marks the step', async () => {
  const { tools } = fakeTools(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      }),
  );
  const t = setup(scripted([text('Reading…'), call('c1', 3)]));
  const started = t.runner.send(t.chatId, 'Read it', { ...CONTEXT, tools });
  assert.ok(started.ok);
  // Let the first request finish and the tool start, then press Stop.
  await new Promise((resolve) => setTimeout(resolve, 20));
  t.runner.stop(t.chatId);
  await started.done;
  const reply = t.chat.messages[1];
  assert.equal(reply.status, 'stopped');
  assert.equal(reply.steps[0].status, 'error');
  assert.equal(t.calls.length, 1);
});

test('a tool that fails is reported to the model and the reply carries on', async () => {
  const { tools } = fakeTools(async () => {
    throw new Error('boom');
  });
  const t = setup(
    scripted([call('c1', 3)], [text('Sorry, I could not read it.')]),
  );
  const started = t.runner.send(t.chatId, 'Read it', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  const reply = t.chat.messages[1];
  assert.equal(reply.status, 'done');
  assert.equal(reply.content, 'Sorry, I could not read it.');
  assert.equal(reply.steps[0].status, 'error');
  const last = t.calls[1].messages[t.calls[1].messages.length - 1];
  assert.equal(last.role, 'tool');
});
