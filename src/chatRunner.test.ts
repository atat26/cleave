import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SYSTEM_PROMPT } from './chatContext.ts';
import {
  createChatRunner,
  MAX_FAILURES_PER_TOOL,
  MAX_REFUSALS_PER_TOOL,
  MAX_STUCK_ROUNDS,
  MAX_TOOL_ROUNDS,
  NO_MORE_TOOLS_NOTE,
} from './chatRunner.ts';
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
  // What the user answers when asked to approve something (a test can change it).
  const asked: { text: string; risky: boolean; statusWhenAsked: string }[] = [];
  let decide: (
    signal: AbortSignal,
  ) => Promise<'allow' | 'allow-rest' | 'deny'> = async () => 'allow';
  const runner = createChatRunner({
    confirm: async (request, signal) => {
      const part = chats
        .findMessage(state, request.chatId, request.messageId)
        ?.parts.find((p) => p.type === 'tool' && p.id === request.partId);
      asked.push({
        text: request.text,
        risky: request.risky,
        statusWhenAsked: part && part.type === 'tool' ? part.status : '',
      });
      return decide(signal);
    },
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
    asked,
    answerWith(next: typeof decide) {
      decide = next;
    },
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
  assert.ok(String(t.calls[0].messages[0].content).endsWith(linked));
  assert.equal(t.calls[0].messages[0].role, 'system');

  await (t.runner.retry(t.chatId, withLinks) as { done: Promise<void> }).done;
  assert.ok(String(t.calls[1].messages[0].content).endsWith(linked));

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
    note: 'Returned 9 characters of page text.',
    result: 'PAGE TEXT',
  }),
) {
  const runs: string[] = [];
  let finished = 0;
  // What each call needs: read_page just goes ahead; `click` asks; `buy` asks as
  // risky; `forbidden` is refused.
  const tools: AgentTools = {
    definitions: [
      { name: 'read_page', description: 'd', parameters: { type: 'object' } },
    ],
    describe: (c) =>
      c.name === 'read_page' ? 'Reading: Example' : `Doing ${c.name}`,
    plan: (c) =>
      c.name === 'click'
        ? {
            kind: 'ask',
            text: 'Click the button "Go" on shop.example',
            risky: false,
          }
        : c.name === 'buy'
          ? {
              kind: 'ask',
              text: 'Click the button "Place order" on shop.example',
              risky: true,
            }
          : c.name === 'forbidden'
            ? {
                kind: 'refuse',
                label: 'Not allowed',
                note: 'Refused.',
                result: 'No.',
              }
            : { kind: 'auto' },
    run: async (c, signal) => {
      runs.push(c.id);
      return run(signal);
    },
    finish: () => {
      finished++;
    },
  };
  return { tools, runs, finishedCount: () => finished };
}

const toolParts = (message: chats.ChatMessage) =>
  message.parts.flatMap((p) => (p.type === 'tool' ? [p] : []));

const thinks = (t: string): StreamEvent => ({ type: 'reasoning', text: t });

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
    toolParts(reply).map((p) => [p.label, p.status]),
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

test('a reply that used up a limit is marked with it, so the chat can offer to go on', async () => {
  const { tools } = fakeTools();
  tools.reachedLimit = () => 'actions';
  const t = setup(scripted([call('c1', 3)], [text('That is all I can do.')]));
  const started = t.runner.send(t.chatId, 'Do a lot', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.equal(t.chat.messages[1].status, 'done');
  assert.equal(t.chat.messages[1].limit, 'actions');

  // Tools that reach no limit leave nothing on the reply.
  const plain = fakeTools();
  const u = setup(scripted([call('c1', 3)], [text('Done.')]));
  const startedPlain = u.runner.send(u.chatId, 'Read it', {
    ...CONTEXT,
    tools: plain.tools,
  });
  assert.ok(startedPlain.ok);
  await startedPlain.done;
  assert.equal('limit' in u.chat.messages[1], false);
});

test('a page that was cut gets a note from the app after the answer, unless the answer already says so', async () => {
  const cut = async (): Promise<ToolOutcome> => ({
    label: 'Read: Long',
    ok: true,
    cutOff: 1,
    note: 'Returned 20,000 characters (cut off at 20,000).',
    result: 'PAGE TEXT',
  });
  const quiet = fakeTools(cut);
  const a = setup(
    scripted([call('c1', 3)], [text('It is about lighthouses.')]),
  );
  const startedA = a.runner.send(a.chatId, 'Summarise tab 3', {
    ...CONTEXT,
    tools: quiet.tools,
  });
  assert.ok(startedA.ok);
  await startedA.done;
  assert.match(
    a.chat.messages[1].content,
    /^It is about lighthouses\.\n\n_Note from the app: that page was long/,
  );

  const honest = fakeTools(cut);
  const b = setup(
    scripted(
      [call('c1', 3)],
      [text('Only the first part was read: lighthouses.')],
    ),
  );
  const startedB = b.runner.send(b.chatId, 'Summarise tab 3', {
    ...CONTEXT,
    tools: honest.tools,
  });
  assert.ok(startedB.ok);
  await startedB.done;
  assert.equal(
    b.chat.messages[1].content,
    'Only the first part was read: lighthouses.',
  );

  // A page that was not cut adds nothing.
  const whole = fakeTools();
  const c = setup(scripted([call('c1', 3)], [text('Short page.')]));
  const startedC = c.runner.send(c.chatId, 'Summarise tab 3', {
    ...CONTEXT,
    tools: whole.tools,
  });
  assert.ok(startedC.ok);
  await startedC.done;
  assert.equal(c.chat.messages[1].content, 'Short page.');
});

test('a chat without tools sends none and never loops', async () => {
  const t = setup(scripted([text('Hi'), call('c1', 3)]));
  const started = t.runner.send(t.chatId, 'Hello', CONTEXT);
  assert.ok(started.ok);
  await started.done;
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].tools, undefined);
  assert.equal(t.chat.messages[1].content, 'Hi');
  assert.deepEqual(toolParts(t.chat.messages[1]), []);
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
  assert.equal(toolParts(reply)[0].status, 'error');
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
  assert.equal(toolParts(reply)[0].status, 'error');
  const last = t.calls[1].messages[t.calls[1].messages.length - 1];
  assert.equal(last.role, 'tool');
});

test('a reply keeps what happened in order, and each tool call keeps exactly what was called', async () => {
  const { tools } = fakeTools();
  const t = setup(
    scripted(
      [
        thinks('I should look. '),
        thinks('Tab 3 it is.'),
        text('One moment. '),
        call('c1', 3),
      ],
      [thinks('Now I know. '), text('It says hello.'), text(' Done.')],
    ),
  );
  const started = t.runner.send(t.chatId, 'What is on tab 3?', {
    ...CONTEXT,
    tools,
  });
  assert.ok(started.ok);
  await started.done;

  const reply = t.chat.messages[1];
  // Thinking, then the first words, then the tool, then thinking, then the answer.
  assert.deepEqual(
    reply.parts.map((p) => p.type),
    ['thinking', 'text', 'tool', 'thinking', 'text'],
  );
  assert.deepEqual(
    reply.parts.flatMap((p) => (p.type === 'thinking' ? [p.text] : [])),
    ['I should look. Tab 3 it is.', 'Now I know. '],
  );
  const tool = toolParts(reply)[0];
  assert.equal(tool.name, 'read_page');
  assert.equal(tool.arguments, '{"tab":3}');
  assert.equal(tool.callId, 'c1');
  assert.equal(tool.outcome, 'Returned 9 characters of page text.');
  // The joined texts still match, and no page text was saved anywhere.
  assert.equal(reply.content, 'One moment. \n\nIt says hello. Done.');
  assert.equal(reply.reasoning, 'I should look. Tab 3 it is.Now I know. ');
  assert.ok(!JSON.stringify(t.chat).includes('PAGE TEXT'));
});

// ---- Asking before acting ----------------------------------------------------------

const act = (id: string, name: string): StreamEvent => ({
  type: 'tool-calls',
  calls: [{ id, name, arguments: '{}' }],
});

test('something that needs approval waits, is marked waiting, and runs only after Allow', async () => {
  const { tools, runs } = fakeTools();
  const t = setup(scripted([act('a1', 'click')], [text('Done.')]));
  const started = t.runner.send(t.chatId, 'Click go', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.deepEqual(runs, ['a1']);
  // The question was asked with the call marked as waiting, in the app's words.
  assert.deepEqual(t.asked, [
    {
      text: 'Click the button "Go" on shop.example',
      risky: false,
      statusWhenAsked: 'waiting',
    },
  ]);
  const part = toolParts(t.chat.messages[1])[0];
  assert.equal(part.status, 'ok');
  assert.equal(part.ask, 'Click the button "Go" on shop.example');
  assert.equal(part.outcome.length > 0, true);
});

test('saying no does not run it, tells the model not to retry, and the reply carries on', async () => {
  const { tools, runs } = fakeTools();
  const t = setup(scripted([act('a1', 'click')], [text('Okay, I stopped.')]));
  t.answerWith(async () => 'deny');
  const started = t.runner.send(t.chatId, 'Click go', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.deepEqual(runs, []);
  const reply = t.chat.messages[1];
  assert.equal(reply.status, 'done');
  assert.equal(toolParts(reply)[0].status, 'declined');
  const last = t.calls[1].messages[t.calls[1].messages.length - 1];
  assert.equal(last.role, 'tool');
  assert.match(last.content, /did not allow this/);
  assert.equal(reply.content, 'Okay, I stopped.');
});

test('Allow the rest skips later questions, except for the kinds that always ask', async () => {
  const { tools, runs } = fakeTools();
  const t = setup(
    scripted(
      [act('a1', 'click')],
      [act('a2', 'click')],
      [act('a3', 'buy')],
      [act('a4', 'click')],
      [text('Finished.')],
    ),
  );
  t.answerWith(async () => 'allow-rest');
  const started = t.runner.send(t.chatId, 'Do things', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.deepEqual(runs, ['a1', 'a2', 'a3', 'a4']);
  // Asked for the first click, and for the risky one; not for the other clicks.
  assert.deepEqual(
    t.asked.map((a) => a.text),
    [
      'Click the button "Go" on shop.example',
      'Click the button "Place order" on shop.example',
    ],
  );
});

test('a risky action asks every time, and "Allow the rest" on it does not switch asking off', async () => {
  const { tools } = fakeTools();
  const t = setup(
    scripted([act('a1', 'buy')], [act('a2', 'click')], [text('Done.')]),
  );
  t.answerWith(async () => 'allow-rest');
  const started = t.runner.send(t.chatId, 'Buy it', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.deepEqual(
    t.asked.map((a) => a.risky),
    [true, false],
  );
});

test('Stop while waiting for an answer ends the reply and nothing runs', async () => {
  const { tools, runs } = fakeTools();
  const t = setup(scripted([act('a1', 'click')]));
  t.answerWith(
    (signal) =>
      new Promise((resolve) =>
        signal.addEventListener('abort', () => resolve('deny')),
      ),
  );
  const started = t.runner.send(t.chatId, 'Click go', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(t.chat.messages[1].status, 'streaming');
  assert.equal(toolParts(t.chat.messages[1])[0].status, 'waiting');
  t.runner.stop(t.chatId);
  await started.done;
  assert.deepEqual(runs, []);
  const reply = t.chat.messages[1];
  assert.equal(reply.status, 'stopped');
  assert.equal(toolParts(reply)[0].status, 'error'); // never ran
});

test('a refused action is shown and reported to the model without asking or running', async () => {
  const { tools, runs } = fakeTools();
  const t = setup(scripted([act('a1', 'forbidden')], [text('I cannot.')]));
  const started = t.runner.send(t.chatId, 'Do it', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.deepEqual(runs, []);
  assert.deepEqual(t.asked, []);
  const part = toolParts(t.chat.messages[1])[0];
  assert.equal(part.status, 'error');
  assert.equal(part.label, 'Not allowed');
  const last = t.calls[1].messages[t.calls[1].messages.length - 1];
  assert.deepEqual(last, { role: 'tool', toolCallId: 'a1', content: 'No.' });
});

test('the tools are told when a reply ends, however it ends', async () => {
  const done = fakeTools();
  const ok = setup(scripted([text('Hi')]));
  const started = ok.runner.send(ok.chatId, 'Hello', {
    ...CONTEXT,
    tools: done.tools,
  });
  assert.ok(started.ok);
  await started.done;
  assert.equal(done.finishedCount(), 1);

  const failing = fakeTools();
  const bad = setup(
    // eslint-disable-next-line require-yield
    async function* () {
      throw new ChatError('network');
    },
  );
  const failed = bad.runner.send(bad.chatId, 'Hello', {
    ...CONTEXT,
    tools: failing.tools,
  });
  assert.ok(failed.ok);
  await failed.done;
  assert.equal(failing.finishedCount(), 1);
});

test('choices the assistant offers are put in the reply right after the call', async () => {
  const tools = fakeTools().tools;
  const offering: AgentTools = {
    ...tools,
    plan: () => ({ kind: 'auto' }),
    run: async () => ({
      label: 'Offered choices',
      ok: true,
      note: 'Showed 2 buttons.',
      result: 'shown',
      choices: { question: 'Which?', options: ['A', 'B'] },
    }),
  };
  const t = setup(
    scripted(
      [text('Two options. '), act('o1', 'offer_choices')],
      [text('Tell me which.')],
    ),
  );
  const started = t.runner.send(t.chatId, 'Help', {
    ...CONTEXT,
    tools: offering,
  });
  assert.ok(started.ok);
  await started.done;
  assert.deepEqual(
    t.chat.messages[1].parts.map((p) => p.type),
    ['text', 'tool', 'choices', 'text'],
  );
});

test('retrying an earlier message removes what came after it and writes a new reply', async () => {
  const t = setup(
    scripted(
      [text('First answer')],
      [text('Second answer')],
      [text('Fresh answer')],
    ),
  );
  const one = t.runner.send(t.chatId, 'first', CONTEXT);
  assert.ok(one.ok);
  await one.done;
  const two = t.runner.send(t.chatId, 'second', CONTEXT);
  assert.ok(two.ok);
  await two.done;
  const firstUser = t.chat.messages[0];
  assert.equal(t.chat.messages.length, 4);

  const again = t.runner.retry(t.chatId, CONTEXT, firstUser.id);
  assert.ok(again.ok);
  await again.done;
  assert.deepEqual(
    t.chat.messages.map((m) => [m.role, m.content]),
    [
      ['user', 'first'],
      ['assistant', 'Fresh answer'],
    ],
  );
  // The model was asked again with only the first prompt in the conversation.
  const lastCall = t.calls[t.calls.length - 1].messages;
  assert.deepEqual(
    lastCall.filter((m) => m.role !== 'system').map((m) => m.content),
    ['first'],
  );

  // An id that is not one of your messages cannot be retried.
  const bad = t.runner.retry(t.chatId, CONTEXT, t.chat.messages[1].id);
  assert.deepEqual(bad, { ok: false, reason: 'nothing-to-retry' });
  assert.deepEqual(t.runner.retry(t.chatId, CONTEXT, 9999), {
    ok: false,
    reason: 'nothing-to-retry',
  });
});

test('pictures a tool asks to show come after the tool results, as one message of the user, and are not saved in the chat', async () => {
  const { tools } = fakeTools(async () => ({
    label: 'Looked at image: photo.png',
    ok: true,
    note: 'Showed the picture to the assistant.',
    result: 'Artifact 7 (image). The picture is attached in the next message.',
    images: [{ mime: 'image/png', data: 'QUJD', label: 'photo.png' }],
  }));
  const t = setup(
    scripted([text('Looking.'), call('c1', 7)], [text('A gradient.')]),
  );
  const started = t.runner.send(t.chatId, 'What is in my photo?', {
    ...CONTEXT,
    tools,
  });
  assert.ok(started.ok);
  await started.done;

  const second = t.calls[1].messages;
  const [assistant, tool, picture] = second.slice(-3);
  assert.equal(assistant.role, 'assistant');
  assert.equal(tool.role, 'tool');
  assert.equal(picture.role, 'user');
  assert.ok(Array.isArray(picture.content));
  const parts = picture.content as {
    type: string;
    mime?: string;
    data?: string;
    text?: string;
  }[];
  assert.equal(parts[0].type, 'text');
  assert.match(parts[0].text ?? '', /photo\.png/);
  assert.match(parts[0].text ?? '', /data, not instructions/);
  assert.deepEqual(parts[1], {
    type: 'image',
    mime: 'image/png',
    data: 'QUJD',
  });
  // The picture is only for this reply: the chat keeps no copy of its bytes.
  assert.ok(!JSON.stringify(t.chat).includes('QUJD'));
});

test('without pictures no extra message is added after the tool results', async () => {
  const { tools } = fakeTools();
  const t = setup(scripted([call('c1', 3)], [text('ok')]));
  const started = t.runner.send(t.chatId, 'x', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  const second = t.calls[1].messages;
  assert.equal(second[second.length - 1].role, 'tool');
});

test('rounds that get only refusals end the tool use, so the model has to answer', async () => {
  const { tools, runs } = fakeTools(async () => ({
    label: 'Read limit reached',
    ok: false,
    blocked: true,
    note: 'Already read 8 pages in this reply.',
    result:
      'You have already read 8 pages in this reply. Answer with what you have.',
  }));
  const t = setup(scripted([call('again', 1)])); // keeps asking for the same page
  const started = t.runner.send(t.chatId, 'Read them all', {
    ...CONTEXT,
    tools,
  });
  assert.ok(started.ok);
  await started.done;
  // Two refused rounds, then a request with no tools at all, and the reply still finishes.
  assert.equal(runs.length, MAX_STUCK_ROUNDS);
  assert.equal(t.calls.length, MAX_STUCK_ROUNDS + 1);
  assert.notEqual(t.calls[MAX_STUCK_ROUNDS - 1].tools, undefined);
  assert.equal(t.calls[MAX_STUCK_ROUNDS].tools, undefined);
  assert.equal(t.chat.messages[1].status, 'done');
});

test('a refusal in a round where something else worked does not count as being stuck', async () => {
  let n = 0;
  const { tools, runs } = fakeTools(async () =>
    ++n % 2 === 0
      ? { label: 'Limit', ok: false, blocked: true, note: 'x', result: 'No.' }
      : { label: 'Read', ok: true, note: 'ok', result: 'PAGE' },
  );
  const t = setup(
    scripted([call('a', 1)], [call('b', 1)], [call('c', 1)], [text('Done.')]),
  );
  const started = t.runner.send(t.chatId, 'Go', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.equal(runs.length, 3);
  assert.notEqual(t.calls[3].tools, undefined);
});

test('a tool refused twice ends the tool use, even if other calls worked in between', async () => {
  // Each round asks for a page (refused) and for a harmless call (works), so no round is all refusals.
  const mixed = (round: number): StreamEvent => ({
    type: 'tool-calls',
    calls: [
      { id: `r${round}`, name: 'read_page', arguments: '{"tab":1}' },
      { id: `l${round}`, name: 'list_linked_tabs', arguments: '{}' },
    ],
  });
  const { tools, runs } = fakeTools(async () => ({
    label: 'x',
    ok: true,
    note: 'ok',
    result: 'fine',
  }));
  // Make read_page come back blocked, and the other call work.
  const original = tools.run.bind(tools);
  tools.run = async (c, signal) =>
    c.name === 'read_page'
      ? (await original(c, signal),
        {
          label: 'Read limit reached',
          ok: false,
          blocked: true,
          note: 'limit',
          result: 'Answer with what you have.',
        })
      : original(c, signal);
  let i = 0;
  const stream: StreamFn = async function* () {
    yield mixed(i++);
  };
  const t = setup(stream);
  const started = t.runner.send(t.chatId, 'Go', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  // read_page was refused in rounds 1 and 2, so round 3 has no tools and the reply finishes.
  assert.equal(runs.length, MAX_REFUSALS_PER_TOOL * 2);
  assert.equal(t.calls[t.calls.length - 1].tools, undefined);
  assert.equal(t.chat.messages[1].status, 'done');
});

test('a tool that keeps failing is not tried more than a few times, and the model is told it must answer plainly', async () => {
  const { tools, runs } = fakeTools(async () => ({
    label: 'Could not read',
    ok: false,
    note: 'The request did not name a tab.',
    result: 'The request did not name a tab.',
  }));
  const t = setup(scripted([call('again', 1)])); // keeps asking, and it keeps failing
  const started = t.runner.send(t.chatId, 'Read them', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.equal(runs.length, MAX_FAILURES_PER_TOOL);
  const last = t.calls[t.calls.length - 1];
  assert.equal(last.tools, undefined);
  // The last request carries the note, once.
  const notes = last.messages.filter(
    (m) => m.role === 'user' && m.content === NO_MORE_TOOLS_NOTE,
  );
  assert.equal(notes.length, 1);
  assert.equal(t.chat.messages[1].status, 'done');
});

test('a failure caused by you closing the tab is not counted against the tool', async () => {
  const { tools, runs } = fakeTools(async () => ({
    label: 'Skipped',
    ok: false,
    skipped: true,
    note: 'You closed this tab, so this step was skipped.',
    result: 'The tab was closed.',
  }));
  const t = setup(
    scripted(
      [call('a', 1)],
      [call('b', 1)],
      [call('c', 1)],
      [call('d', 1)],
      [text('Done.')],
    ),
  );
  const started = t.runner.send(t.chatId, 'Go', { ...CONTEXT, tools });
  assert.ok(started.ok);
  await started.done;
  assert.equal(runs.length, 4);
  assert.notEqual(t.calls[4].tools, undefined);
});
