import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ChatError,
  checkKey,
  errorKind,
  interpretData,
  isValidModelId,
  listModels,
  OPENROUTER_BASE,
  parseModels,
  streamChat,
  toApiMessage,
} from './openrouter.ts';
import type { FetchLike, StreamEvent } from './openrouter.ts';

const KEY = 'sk-or-v1-test-key-1234567890';
const encoder = new TextEncoder();

// A fake network response whose body arrives in the given pieces.
function streamResponse(pieces: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, { status });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

async function collect(
  stream: AsyncGenerator<StreamEvent>,
): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

const chunk = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`;

// ---- errorKind ---------------------------------------------------------------

test('errors are classified by error_type first, then code, then HTTP status', () => {
  const typed = (error_type: string, code?: number | string) => ({
    error: { code, message: 'x', metadata: { error_type } },
  });
  assert.equal(errorKind(200, typed('authentication')), 'auth');
  assert.equal(errorKind(200, typed('payment_required')), 'credit');
  assert.equal(errorKind(200, typed('rate_limit_exceeded')), 'rate-limit');
  assert.equal(errorKind(200, typed('timeout')), 'timeout');
  assert.equal(errorKind(200, typed('provider_overloaded')), 'provider');
  // error_type wins over a disagreeing code.
  assert.equal(errorKind(null, typed('payment_required', 500)), 'credit');
  // Numeric code in the body.
  assert.equal(
    errorKind(null, { error: { code: 429, message: 'x' } }),
    'rate-limit',
  );
  // A STRING code (the docs show both) is not trusted as a number: fall back.
  assert.equal(
    errorKind(null, { error: { code: 'server_error', message: 'x' } }),
    'unknown',
  );
  assert.equal(errorKind(401, { error: { code: 'server_error' } }), 'auth');
  // HTTP status alone.
  const byStatus: [number, string][] = [
    [400, 'bad-request'],
    [401, 'auth'],
    [402, 'credit'],
    [403, 'blocked'],
    [408, 'timeout'],
    [429, 'rate-limit'],
    [500, 'provider'],
    [502, 'provider'],
    [503, 'provider'],
    [504, 'timeout'],
    [418, 'unknown'],
  ];
  for (const [status, kind] of byStatus)
    assert.equal(errorKind(status, null), kind, String(status));
});

// ---- interpretData -------------------------------------------------------------

test('text, finish and usage chunks are read; [DONE] ends the stream', () => {
  const text = interpretData(
    JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
  );
  assert.deepEqual(text.events, [{ type: 'text', text: 'Hel' }]);

  const finish = interpretData(
    JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
  );
  assert.deepEqual(finish.events, [{ type: 'finish', reason: 'stop' }]);

  // OpenRouter's usage chunk has an empty delta (and a finish_reason).
  const usage = interpretData(
    JSON.stringify({
      choices: [{ delta: { content: '' }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 7,
        total_tokens: 12,
        cost: 0.0001,
      },
    }),
  );
  assert.deepEqual(usage.events, [
    { type: 'finish', reason: 'stop' },
    {
      type: 'usage',
      promptTokens: 5,
      completionTokens: 7,
      totalTokens: 12,
      cost: 0.0001,
    },
  ]);

  assert.equal(interpretData('[DONE]').done, true);
  assert.equal(interpretData('  [DONE]  ').done, true);
});

test("the model's thinking is read from reasoning_details (text and summary entries)", () => {
  const chunk = (details: unknown[]) =>
    interpretData(
      JSON.stringify({ choices: [{ delta: { reasoning_details: details } }] }),
    );
  assert.deepEqual(
    chunk([
      {
        type: 'reasoning.text',
        text: 'Let me think. ',
        id: null,
        format: 'unknown',
        index: 0,
      },
    ]).events,
    [{ type: 'reasoning', text: 'Let me think. ' }],
  );
  assert.deepEqual(
    chunk([
      { type: 'reasoning.summary', summary: 'Weighing options.', format: 'x' },
    ]).events,
    [{ type: 'reasoning', text: 'Weighing options.' }],
  );
  // Several entries in one piece join in order.
  assert.deepEqual(
    chunk([
      { type: 'reasoning.text', text: 'A' },
      { type: 'reasoning.text', text: 'B' },
    ]).events,
    [{ type: 'reasoning', text: 'AB' }],
  );
  // Scrambled (encrypted) data is not readable and is ignored, as is a placeholder.
  assert.deepEqual(
    chunk([{ type: 'reasoning.encrypted', data: 'U0VDUkVU' }]).events,
    [],
  );
  assert.deepEqual(
    chunk([{ type: 'reasoning.text', text: '[REDACTED]' }]).events,
    [],
  );
  // Unknown entry types and wrongly typed fields are skipped.
  assert.deepEqual(
    chunk([
      { type: 'mystery', text: 'x' },
      null,
      5,
      { type: 'reasoning.text', text: 9 },
    ]).events,
    [],
  );
});

test('a plain `reasoning` string is read too, but never doubled with reasoning_details', () => {
  const plain = interpretData(
    JSON.stringify({ choices: [{ delta: { reasoning: 'thinking aloud' } }] }),
  );
  assert.deepEqual(plain.events, [
    { type: 'reasoning', text: 'thinking aloud' },
  ]);

  // If a piece has both, only one source is used, so the text is not repeated.
  const both = interpretData(
    JSON.stringify({
      choices: [
        {
          delta: {
            reasoning: 'same words',
            reasoning_details: [{ type: 'reasoning.text', text: 'same words' }],
          },
        },
      ],
    }),
  );
  assert.deepEqual(both.events, [{ type: 'reasoning', text: 'same words' }]);

  // A "[REDACTED]" string is not shown; a non-string is ignored.
  assert.deepEqual(
    interpretData(
      JSON.stringify({ choices: [{ delta: { reasoning: '[REDACTED]' } }] }),
    ).events,
    [],
  );
  assert.deepEqual(
    interpretData(JSON.stringify({ choices: [{ delta: { reasoning: 5 } }] }))
      .events,
    [],
  );
});

test('thinking and the answer can arrive together, and stay separate', () => {
  const result = interpretData(
    JSON.stringify({
      choices: [{ delta: { reasoning: 'hmm', content: 'Hello' } }],
    }),
  );
  assert.deepEqual(result.events, [
    { type: 'reasoning', text: 'hmm' },
    { type: 'text', text: 'Hello' },
  ]);
});

test('streamChat passes thinking through as its own events, in order', async () => {
  const fetchImpl: FetchLike = async () =>
    streamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning: 'Step 1. ' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning: 'Step 2.' } }] })}\n\n`,
      chunk('Answer'),
      'data: [DONE]\n\n',
    ]);
  const events = await collect(
    streamChat({ apiKey: KEY, model: 'm', messages: [], fetchImpl }),
  );
  assert.deepEqual(events, [
    { type: 'reasoning', text: 'Step 1. ' },
    { type: 'reasoning', text: 'Step 2.' },
    { type: 'text', text: 'Answer' },
  ]);
});

test('unreadable chunks are skipped, not fatal', () => {
  for (const junk of [
    '',
    'not json',
    '42',
    'null',
    '[]',
    '{"choices":"no"}',
    '{"choices":[null]}',
  ]) {
    const result = interpretData(junk);
    assert.deepEqual(result.events, [], junk);
    assert.equal(result.error, null, junk);
    assert.equal(result.done, false, junk);
  }
  // Wrongly typed fields are ignored.
  assert.deepEqual(
    interpretData(JSON.stringify({ choices: [{ delta: { content: 5 } }] }))
      .events,
    [],
  );
});

test('a mid-stream error chunk becomes a ChatError (numeric or string code)', () => {
  const numeric = interpretData(
    JSON.stringify({
      error: { code: 429, message: 'secret detail' },
      choices: [],
    }),
  );
  assert.equal(numeric.error?.kind, 'rate-limit');
  const stringy = interpretData(
    JSON.stringify({ error: { code: 'server_error', message: 'boom' } }),
  );
  assert.equal(stringy.error?.kind, 'unknown');
  // finish_reason "error" with no error object is still a failure.
  const finish = interpretData(
    JSON.stringify({
      choices: [{ delta: { content: '' }, finish_reason: 'error' }],
    }),
  );
  assert.equal(finish.error?.kind, 'provider');
});

// ---- streamChat -----------------------------------------------------------------

test('streamChat sends the right request and yields the reply as it arrives', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    seen.push({ url, init: init ?? {} });
    const all =
      ': OPENROUTER PROCESSING\n\n' +
      chunk('Hel') +
      chunk('lo') +
      `data: ${JSON.stringify({ choices: [{ delta: { content: '' }, finish_reason: 'stop' }], usage: { total_tokens: 3 } })}\n\n` +
      'data: [DONE]\n\n';
    // Cut the stream into awkward 7-character pieces.
    const pieces = all.match(/[\s\S]{1,7}/g) ?? [];
    return streamResponse(pieces);
  };

  const events = await collect(
    streamChat({
      apiKey: KEY,
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
      fetchImpl,
    }),
  );
  assert.equal(
    events
      .filter(
        (e): e is Extract<StreamEvent, { type: 'text' }> => e.type === 'text',
      )
      .map((e) => e.text)
      .join(''),
    'Hello',
  );
  assert.ok(events.some((e) => e.type === 'finish'));
  assert.ok(events.some((e) => e.type === 'usage'));

  // The request: fixed address, key only in the Authorization header.
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, `${OPENROUTER_BASE}/chat/completions`);
  assert.equal(seen[0].init.method, 'POST');
  const headers = seen[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${KEY}`);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.ok(
    !String(seen[0].init.body).includes(KEY),
    'the key must not be in the body',
  );
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), {
    model: 'openai/gpt-4o',
    messages: [{ role: 'user', content: 'Hi' }],
    stream: true,
  });
});

test('streamChat stops at [DONE] and ignores anything after it', async () => {
  const fetchImpl: FetchLike = async () =>
    streamResponse([
      chunk('a'),
      'data: [DONE]\n\n',
      chunk('SHOULD NOT APPEAR'),
    ]);
  const events = await collect(
    streamChat({ apiKey: KEY, model: 'm', messages: [], fetchImpl }),
  );
  assert.deepEqual(events, [{ type: 'text', text: 'a' }]);
});

test('an unfinished last event is still read when the connection ends', async () => {
  const fetchImpl: FetchLike = async () =>
    streamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'tail' } }] })}`,
    ]);
  const events = await collect(
    streamChat({ apiKey: KEY, model: 'm', messages: [], fetchImpl }),
  );
  assert.deepEqual(events, [{ type: 'text', text: 'tail' }]);
});

test('errors before streaming become plain messages, never the server text', async () => {
  const cases: [Response, string][] = [
    [json({ error: { code: 401, message: `Bad key ${KEY}` } }, 401), 'auth'],
    [json({ error: { code: 402, message: 'no credits' } }, 402), 'credit'],
    [json({ error: { code: 429, message: 'slow down' } }, 429), 'rate-limit'],
    [new Response('<html>Bad gateway</html>', { status: 502 }), 'provider'],
    [json({ error: { message: 'what' } }, 418), 'unknown'],
  ];
  for (const [response, kind] of cases) {
    const fetchImpl: FetchLike = async () => response;
    await assert.rejects(
      collect(streamChat({ apiKey: KEY, model: 'm', messages: [], fetchImpl })),
      (error: unknown) => {
        assert.ok(error instanceof ChatError);
        assert.equal(error.kind, kind);
        // Our wording only: nothing from the server, and never the key.
        assert.ok(!error.message.includes(KEY));
        assert.ok(
          !/Bad key|no credits|slow down|Bad gateway/.test(error.message),
        );
        return true;
      },
    );
  }
});

test('an error as the very first event of a 200 stream is still an error', async () => {
  const fetchImpl: FetchLike = async () =>
    streamResponse([
      `data: ${JSON.stringify({
        error: {
          code: 402,
          message: 'x',
          metadata: { error_type: 'payment_required' },
        },
        choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
      })}\n\n`,
    ]);
  await assert.rejects(
    collect(streamChat({ apiKey: KEY, model: 'm', messages: [], fetchImpl })),
    (error: unknown) => error instanceof ChatError && error.kind === 'credit',
  );
});

test('text already received is kept when an error arrives mid-reply', async () => {
  const fetchImpl: FetchLike = async () =>
    streamResponse([
      chunk('partial '),
      `data: ${JSON.stringify({ error: { code: 503, message: 'x' } })}\n\n`,
    ]);
  const got: StreamEvent[] = [];
  await assert.rejects(async () => {
    for await (const event of streamChat({
      apiKey: KEY,
      model: 'm',
      messages: [],
      fetchImpl,
    })) {
      got.push(event);
    }
  }, ChatError);
  assert.deepEqual(got, [{ type: 'text', text: 'partial ' }]);
});

test('a network failure is a plain "could not reach" error, with no key in it', async () => {
  const fetchImpl: FetchLike = async () => {
    throw new TypeError(`fetch failed for ${KEY}`);
  };
  await assert.rejects(
    collect(streamChat({ apiKey: KEY, model: 'm', messages: [], fetchImpl })),
    (error: unknown) =>
      error instanceof ChatError &&
      error.kind === 'network' &&
      !error.message.includes(KEY),
  );
});

test('stopping mid-reply passes the abort through (not shown as an error)', async () => {
  const controller = new AbortController();
  const fetchImpl: FetchLike = async (_url, init) => {
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(chunk('first ')));
      },
      pull() {
        // After the first piece, wait until aborted, then fail like real fetch.
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            ),
          );
        });
      },
    });
    return new Response(body, { status: 200 });
  };

  const got: StreamEvent[] = [];
  await assert.rejects(
    async () => {
      for await (const event of streamChat({
        apiKey: KEY,
        model: 'm',
        messages: [],
        signal: controller.signal,
        fetchImpl,
      })) {
        got.push(event);
        controller.abort(); // The user pressed Stop.
      }
    },
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
  assert.deepEqual(got, [{ type: 'text', text: 'first ' }]);
});

// ---- checkKey ---------------------------------------------------------------------

test('checkKey reads the key info, treating null limits as "no limit"', async () => {
  const seen: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push(`${url} ${headers.Authorization}`);
    return json({
      data: { label: 'My key', usage: 1.5, limit: null, limit_remaining: null },
    });
  };
  assert.deepEqual(await checkKey(KEY, fetchImpl), {
    label: 'My key',
    usage: 1.5,
    limit: null,
    limitRemaining: null,
  });
  assert.deepEqual(seen, [`${OPENROUTER_BASE}/key Bearer ${KEY}`]);

  const limited = await checkKey(KEY, async () =>
    json({ data: { label: 'k', usage: 2, limit: 10, limit_remaining: 8 } }),
  );
  assert.equal(limited.limitRemaining, 8);
});

test('checkKey: a rejected key, junk, and a dead network are all plain errors', async () => {
  await assert.rejects(
    checkKey(KEY, async () =>
      json(
        { error: { code: 401, message: 'Missing Authentication header' } },
        401,
      ),
    ),
    (e: unknown) => e instanceof ChatError && e.kind === 'auth',
  );
  await assert.rejects(
    checkKey(KEY, async () => json({ data: {} })), // no label: not a real answer
    (e: unknown) => e instanceof ChatError && e.kind === 'unknown',
  );
  await assert.rejects(
    checkKey(KEY, async () => new Response('not json', { status: 200 })),
    (e: unknown) => e instanceof ChatError && e.kind === 'unknown',
  );
  await assert.rejects(
    checkKey(KEY, async () => {
      throw new TypeError('offline');
    }),
    (e: unknown) => e instanceof ChatError && e.kind === 'network',
  );
});

// ---- models -------------------------------------------------------------------------

test('parseModels converts prices to dollars per million tokens and skips bad entries', () => {
  const models = parseModels({
    data: [
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        context_length: 128000,
        pricing: { prompt: '0.0000025', completion: '0.00001' },
      },
      {
        id: 'meta/free-model:free',
        name: 'Free one',
        pricing: { prompt: '0', completion: '0' },
      },
      { id: 'no/name', pricing: {} }, // name falls back to the id
      { id: 'bad id with spaces', name: 'Nope' },
      { id: '', name: 'Empty' },
      { name: 'No id at all' },
      null,
      'junk',
      {
        id: 'anthropic/odd',
        name: 'Odd prices',
        pricing: { prompt: 'abc', completion: '-1' },
      },
    ],
  });
  // Sorted by display name: "Free one", "GPT-4o", "no/name", "Odd prices".
  assert.deepEqual(
    models.map((m) => m.id),
    ['meta/free-model:free', 'openai/gpt-4o', 'no/name', 'anthropic/odd'],
  );
  const gpt = models.find((m) => m.id === 'openai/gpt-4o');
  assert.equal(gpt?.contextLength, 128000);
  assert.equal(Math.round((gpt?.promptPerMillion ?? 0) * 100) / 100, 2.5);
  assert.equal(Math.round((gpt?.completionPerMillion ?? 0) * 100) / 100, 10);
  assert.equal(
    models.find((m) => m.id === 'meta/free-model:free')?.promptPerMillion,
    0,
  );
  assert.equal(models.find((m) => m.id === 'no/name')?.name, 'no/name');
  const odd = models.find((m) => m.id === 'anthropic/odd');
  assert.equal(odd?.promptPerMillion, null);
  assert.equal(odd?.completionPerMillion, null);
});

test('parseModels survives garbage', () => {
  for (const junk of [
    null,
    undefined,
    5,
    'x',
    [],
    {},
    { data: 'no' },
    { data: null },
  ]) {
    assert.deepEqual(parseModels(junk), []);
  }
});

test('listModels sends the key only when there is one, to the fixed address', async () => {
  const calls: { url: string; headers: unknown }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    return json({ data: [{ id: 'a/b', name: 'B' }] });
  };
  await listModels(null, fetchImpl);
  await listModels(KEY, fetchImpl);
  assert.equal(calls[0].url, `${OPENROUTER_BASE}/models`);
  assert.deepEqual(calls[0].headers, {});
  assert.deepEqual(calls[1].headers, { Authorization: `Bearer ${KEY}` });
  await assert.rejects(
    listModels(null, async () => json({ error: { code: 429 } }, 429)),
    (e: unknown) => e instanceof ChatError && e.kind === 'rate-limit',
  );
});

test('only sane model names are accepted for saving', () => {
  for (const ok of [
    'openai/gpt-4o',
    'meta/llama-3:free',
    '~anthropic/claude-latest',
    'a',
  ]) {
    assert.equal(isValidModelId(ok), true, ok);
  }
  for (const bad of [
    '',
    ' ',
    'has space',
    'semi;colon',
    'x'.repeat(201),
    5,
    null,
    undefined,
    '../x y',
  ]) {
    assert.equal(isValidModelId(bad), false, String(bad));
  }
});

// ---- Tools ---------------------------------------------------------------------

const toolPiece = (part: Record<string, unknown>) =>
  `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [part] } }] })}\n\n`;

test('tool calls arrive in pieces and come out whole, once, at the end', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return streamResponse([
      chunk('Let me look. '),
      toolPiece({
        index: 0,
        id: 'call_a',
        function: { name: 'read_page', arguments: '{"ta' },
      }),
      toolPiece({
        index: 1,
        id: 'call_b',
        function: { name: 'list_linked_tabs' },
      }),
      toolPiece({ index: 0, function: { arguments: 'b":3}' } }),
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`,
      'data: [DONE]\n\n',
    ]);
  };
  const events = await collect(
    streamChat({
      apiKey: KEY,
      model: 'm',
      messages: [
        { role: 'user', content: 'Hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'x', name: 'read_page', arguments: '{}' }],
        },
        { role: 'tool', toolCallId: 'x', content: 'page text' },
      ],
      tools: [
        { name: 'read_page', description: 'd', parameters: { type: 'object' } },
      ],
      fetchImpl,
    }),
  );
  assert.deepEqual(
    events.map((e) => e.type),
    ['text', 'finish', 'tool-calls'],
  );
  assert.deepEqual(events[2], {
    type: 'tool-calls',
    calls: [
      { id: 'call_a', name: 'read_page', arguments: '{"tab":3}' },
      { id: 'call_b', name: 'list_linked_tabs', arguments: '' },
    ],
  });
  // The request carries the tools and the tool messages in OpenRouter's shape.
  const body = bodies[0] as {
    tools: { type: string; function: { name: string } }[];
    messages: Record<string, unknown>[];
  };
  assert.equal(body.tools[0].function.name, 'read_page');
  assert.deepEqual(body.messages[2], {
    role: 'tool',
    tool_call_id: 'x',
    content: 'page text',
  });
  assert.equal((body.messages[1].tool_calls as { id: string }[])[0].id, 'x');
});

test('a plain chat sends no tools, and nameless or excess tool calls are dropped', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    const many = Array.from({ length: 12 }, (_, i) =>
      toolPiece({ index: i + 1, function: { name: `t${i}`, arguments: '{}' } }),
    );
    return streamResponse([
      toolPiece({ index: 0, id: 'nameless' }),
      ...many,
      'data: [DONE]\n\n',
    ]);
  };
  const events = await collect(
    streamChat({ apiKey: KEY, model: 'm', messages: [], fetchImpl }),
  );
  assert.equal('tools' in bodies[0], false);
  const calls = (events[0] as Extract<StreamEvent, { type: 'tool-calls' }>)
    .calls;
  assert.equal(calls.length, 8);
  assert.ok(calls.every((c) => c.name !== ''));
});

test('parseModels records what a model can do, and null when the list does not say', () => {
  const models = parseModels({
    data: [
      {
        id: 'a/vision-tools',
        name: 'A',
        supported_parameters: ['tools', 'temperature'],
        architecture: { input_modalities: ['text', 'image'] },
      },
      {
        id: 'b/text-only',
        name: 'B',
        supported_parameters: ['temperature'],
        architecture: { input_modalities: ['text'] },
      },
      { id: 'c/unknown', name: 'C' },
    ],
  });
  const by = (id: string) => models.find((m) => m.id === id);
  assert.deepEqual(
    [by('a/vision-tools')?.supportsTools, by('a/vision-tools')?.supportsImages],
    [true, true],
  );
  assert.deepEqual(
    [by('b/text-only')?.supportsTools, by('b/text-only')?.supportsImages],
    [false, false],
  );
  assert.deepEqual(
    [by('c/unknown')?.supportsTools, by('c/unknown')?.supportsImages],
    [null, null],
  );
});

test('a user message with a picture is sent as text and an image address', () => {
  assert.deepEqual(
    toApiMessage({
      role: 'user',
      content: [
        { type: 'text', text: 'Look' },
        { type: 'image', mime: 'image/png', data: 'AAAA' },
      ],
    }),
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Look' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,AAAA' },
        },
      ],
    },
  );
  // Plain messages are unchanged.
  assert.deepEqual(toApiMessage({ role: 'user', content: 'hi' }), {
    role: 'user',
    content: 'hi',
  });
});
