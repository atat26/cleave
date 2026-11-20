import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  setTraceSink,
  summarizeRequest,
  traced,
  tracing,
} from './requestTrace.ts';
import type { TraceEntry } from './requestTrace.ts';
import type {
  ChatMessageInput,
  StreamEvent,
  ToolDefinition,
} from './openrouter.ts';

afterEach(() => setTraceSink(null));

const SECRET_PAGE = 'SECRET-PAGE-TEXT about a private matter';
const SECRET_SAID = 'SECRET-THING-YOU-SAID';
const tools: ToolDefinition[] = [
  {
    name: 'read_page',
    description: 'Read a page.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'click',
    description: 'Click.',
    parameters: { type: 'object', properties: {} },
  },
];
const conversation: ChatMessageInput[] = [
  { role: 'system', content: 'You help.' },
  { role: 'user', content: `${SECRET_SAID} please` },
  {
    role: 'assistant',
    content: 'Looking.',
    toolCalls: [{ id: 'c1', name: 'read_page', arguments: '{"tab":1}' }],
  },
  { role: 'tool', toolCallId: 'c1', content: SECRET_PAGE },
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Here is the picture.' },
      { type: 'image', mime: 'image/png', data: 'AAAABBBB' },
    ],
  },
];

test('a request is summed up in sizes and counts, by kind and by tool', () => {
  const s = summarizeRequest('free/model', conversation, tools);
  assert.equal(s.model, 'free/model');
  assert.equal(s.messages, 5);
  assert.equal(s.systemChars, 'You help.'.length);
  assert.equal(
    s.userChars,
    `${SECRET_SAID} please`.length + 'Here is the picture.'.length,
  );
  assert.equal(s.assistantChars, 'Looking.'.length);
  assert.equal(s.toolResultChars, SECRET_PAGE.length);
  assert.deepEqual(s.toolResults, {
    read_page: { count: 1, chars: SECRET_PAGE.length },
  });
  assert.deepEqual(s.images, { count: 1, chars: 8 });
  assert.equal(s.toolDefs.count, 2);
  assert.ok(s.toolDefs.chars > 100);
  assert.equal(s.rounds, 1);
  // No tools offered: no definitions counted.
  assert.deepEqual(summarizeRequest('m', conversation).toolDefs, {
    count: 0,
    chars: 0,
  });
});

test('the summary never contains what was said or read', () => {
  const s = JSON.stringify(summarizeRequest('m', conversation, tools));
  assert.equal(s.includes('SECRET'), false);
  assert.equal(s.includes('private matter'), false);
  assert.equal(s.includes('AAAABBBB'), false);
});

async function* events(list: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const event of list) yield event;
}

test('off by default: the stream passes straight through and nothing is written', async () => {
  assert.equal(tracing(), false);
  const seen: string[] = [];
  for await (const e of traced({ model: 'm', messages: [] }, () =>
    events([{ type: 'text', text: 'hi' }]),
  )) {
    seen.push(e.type);
  }
  assert.deepEqual(seen, ['text']);
});

test('on: one entry per call, with usage, tool names and timing, and no content', async () => {
  const written: TraceEntry[] = [];
  setTraceSink((e) => written.push(e));
  assert.equal(tracing(), true);
  let t = 1000;
  const now = () => (t += 10);
  const out: StreamEvent[] = [];
  for await (const e of traced(
    { model: 'free/model', messages: conversation, tools },
    () =>
      events([
        { type: 'reasoning', text: 'secret thought' },
        { type: 'text', text: 'Hello there' },
        {
          type: 'usage',
          promptTokens: 120,
          completionTokens: 8,
          totalTokens: 128,
          cost: 0,
          cachedTokens: 96,
        },
        { type: 'finish', reason: 'tool_calls' },
        {
          type: 'tool-calls',
          calls: [{ id: 'x', name: 'click', arguments: '{}' }],
        },
      ]),
    now,
  )) {
    out.push(e);
  }
  assert.equal(out.length, 5);
  assert.equal(written.length, 1);
  const entry = written[0];
  assert.equal(entry.model, 'free/model');
  assert.equal(entry.replyChars, 'Hello there'.length);
  assert.equal(entry.reasoningChars, 'secret thought'.length);
  assert.deepEqual(entry.toolCalls, ['click']);
  assert.equal(entry.usage?.totalTokens, 128);
  assert.equal(entry.usage?.cost, 0);
  assert.equal(entry.usage?.cachedTokens, 96);
  assert.equal(entry.finish, 'tool_calls');
  assert.equal(entry.error, null);
  assert.ok(entry.ms > 0 && entry.firstEventMs !== null);
  const text = JSON.stringify(entry);
  assert.equal(text.includes('Hello there'), false);
  assert.equal(text.includes('secret thought'), false);
  assert.equal(text.includes('SECRET'), false);
});

test('a failed call is recorded with its kind, and a stopped one as aborted', async () => {
  const written: TraceEntry[] = [];
  setTraceSink((e) => written.push(e));
  class Boom extends Error {
    kind = 'rate-limit';
  }
  async function* failing(): AsyncGenerator<StreamEvent> {
    yield { type: 'text', text: 'partial' };
    throw new Boom('x');
  }
  await assert.rejects(async () => {
    for await (const e of traced({ model: 'm', messages: [] }, failing)) {
      void e;
    }
  });
  assert.equal(written[0].error, 'rate-limit');
  assert.equal(written[0].replyChars, 'partial'.length);

  // The reader gives up half way (Stop).
  for await (const e of traced({ model: 'm', messages: [] }, () =>
    events([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ]),
  )) {
    void e;
    break;
  }
  assert.equal(written[1].error, 'aborted');
});

test('a recorder that fails never breaks the chat', async () => {
  setTraceSink(() => {
    throw new Error('disk full');
  });
  const seen: string[] = [];
  for await (const e of traced({ model: 'm', messages: [] }, () =>
    events([{ type: 'text', text: 'ok' }]),
  )) {
    seen.push(e.type);
  }
  assert.deepEqual(seen, ['text']);
});
