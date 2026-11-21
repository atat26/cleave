import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatError, streamChat } from './openrouter.ts';
import type { FetchLike, StreamEvent } from './openrouter.ts';

const KEY = 'sk-or-v1-test-key-1234567890';
const encoder = new TextEncoder();

const streamResponse = (pieces: string[]): Response =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    }),
    { status: 200 },
  );

const dataLine = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const words = (content: string) =>
  dataLine({ choices: [{ index: 0, delta: { content } }] });
const finish = (reason: string) =>
  dataLine({ choices: [{ delta: {}, finish_reason: reason }] });

async function collect(
  stream: AsyncGenerator<StreamEvent>,
): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

const run = (fetchImpl: FetchLike, stallMs?: number) =>
  collect(
    streamChat({ apiKey: KEY, model: 'm', messages: [], fetchImpl, stallMs }),
  );

const isError = (kind: string) => (error: unknown) =>
  error instanceof ChatError && error.kind === kind;

test('a stream that stops with no finish and no [DONE] is a cut-off reply, but a finish reason alone is enough', async () => {
  await assert.rejects(
    run(async () => streamResponse([words('half an ans')])),
    isError('network'),
  );
  const events = await run(async () =>
    streamResponse([words('whole'), finish('stop')]),
  );
  assert.ok(events.some((e) => e.type === 'finish'));
  const done = await run(async () =>
    streamResponse([words('whole'), 'data: [DONE]\n\n']),
  );
  assert.ok(done.some((e) => e.type === 'text'));
});

test('a provider that goes quiet is given up on after a while', async () => {
  const fetchImpl: FetchLike = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(words('start')));
          // ...and then nothing, and the stream is never closed.
        },
      }),
      { status: 200 },
    );
  await assert.rejects(run(fetchImpl, 50), isError('timeout'));
});

const toolCall = (id: string | undefined, name: string, args: string) =>
  dataLine({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              ...(id === undefined ? {} : { id }),
              type: 'function',
              function: { name, arguments: args },
            },
          ],
        },
      },
    ],
  });

test('parallel tool calls that all say index 0 but have different ids stay separate calls', async () => {
  const events = await run(async () =>
    streamResponse([
      toolCall('a', 'read_page', '{"tab":1}'),
      toolCall('b', 'read_page', '{"tab":2}'),
      finish('tool_calls'),
    ]),
  );
  const found = events.find((e) => e.type === 'tool-calls');
  assert.ok(found && found.type === 'tool-calls');
  assert.deepEqual(
    found.calls.map((c) => [c.id, c.name, c.arguments]),
    [
      ['a', 'read_page', '{"tab":1}'],
      ['b', 'read_page', '{"tab":2}'],
    ],
  );
});

test('one call streamed in pieces (the id only on the first) is still one call', async () => {
  const piece = (args: string) =>
    dataLine({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: args } }],
          },
        },
      ],
    });
  const events = await run(async () =>
    streamResponse([
      toolCall('only', 'read_page', '{"ta'),
      piece('b":3}'),
      finish('tool_calls'),
    ]),
  );
  const found = events.find((e) => e.type === 'tool-calls');
  assert.ok(found && found.type === 'tool-calls');
  assert.equal(found.calls.length, 1);
  assert.equal(found.calls[0].arguments, '{"tab":3}');
});

test('a call the provider gave no id gets an id that no other call has', async () => {
  const ids: string[] = [];
  for (let round = 0; round < 3; round++) {
    const events = await run(async () =>
      streamResponse([
        toolCall(undefined, 'read_page', '{}'),
        finish('tool_calls'),
      ]),
    );
    const found = events.find((e) => e.type === 'tool-calls');
    assert.ok(found && found.type === 'tool-calls');
    ids.push(found.calls[0].id);
  }
  assert.equal(new Set(ids).size, 3, ids.join(' '));
});
