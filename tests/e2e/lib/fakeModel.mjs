// A fake model for the tests: a small web server on this computer that speaks the part of OpenRouter's
// API the app uses (key check, model list, streaming chat). The app is started with AIB_API_BASE
// pointing here (only a development copy takes that setting), so a test decides exactly what the
// "model" says and which tools it asks for, and can then check what the app did and what it sent next.
// Free, instant, and the same every time.
//
// A script is a list of replies; each model request takes the next one:
//   { text: 'Hello' }                                       a plain answer
//   { tools: [{ name: 'go_to', args: { tab: 1, url } }] }   asks for tools (and may also have text)
//   { status: 429 }                                         an HTTP error (401, 402, 429, 500...)
//   { midStreamError: true }                                an error inside the stream
//   { ..., finish: 'length' }                               ends the reply the way the length limit does
//   (request) => reply                                      decides from what it was sent
// A request that finds the script empty gets a plain "(no more script)" answer and is counted in
// `unscripted`, so a test can assert the app did not ask for more than expected.
//
// The "name it" requests (naming a chat, Space or document) are answered on their own and never use
// up the script; they are kept in `namingRequests`.
import http from 'node:http';

export const FAKE_KEY = 'sk-or-v1-e2e-fake-key-0123456789';
export const FAKE_MODEL = 'fake/e2e-model';

const NAMING = 'You give short names to things in a web browser app.';

export async function startFakeModel() {
  const state = {
    requests: [], // every chat request: { messages, tools, body }
    namingRequests: [],
    keyChecks: [], // the Authorization header of each key check
    unscripted: 0,
    queue: [],
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const body = chunks.length
        ? safeJson(Buffer.concat(chunks).toString('utf8'))
        : null;
      handle(req, res, url.pathname, body);
    });
  });

  function handle(req, res, path, body) {
    const json = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (path.endsWith('/key')) {
      state.keyChecks.push(req.headers.authorization ?? '');
      return json(200, {
        data: {
          label: 'e2e test key',
          usage: 0,
          limit: null,
          limit_remaining: null,
        },
      });
    }
    if (path.endsWith('/models')) {
      return json(200, {
        data: [
          {
            id: FAKE_MODEL,
            name: 'Fake model (tests)',
            context_length: 32000,
            pricing: { prompt: '0', completion: '0' },
            supported_parameters: ['tools'],
            architecture: { input_modalities: ['text'] },
          },
        ],
      });
    }
    if (path.endsWith('/chat/completions')) {
      const messages = body?.messages ?? [];
      const system = messages.find((m) => m.role === 'system');
      if (
        typeof system?.content === 'string' &&
        system.content.startsWith(NAMING)
      ) {
        state.namingRequests.push({ messages });
        return stream(res, {
          text: '{"name": "E2E test name", "emoji": "🧪"}',
        });
      }
      const request = {
        messages,
        tools: body?.tools ?? [],
        authorization: req.headers.authorization ?? '',
        body,
      };
      state.requests.push(request);
      let reply = state.queue.shift();
      if (typeof reply === 'function') reply = reply(request);
      if (reply === undefined) {
        state.unscripted += 1;
        reply = { text: '(no more script)' };
      }
      if (reply.status !== undefined) {
        return json(reply.status, {
          error: { message: 'scripted error', code: reply.status },
        });
      }
      return stream(res, reply);
    }
    json(404, { error: { message: 'not found' } });
  }

  // Send a reply as a server-sent stream, the way OpenRouter does.
  function stream(res, reply) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    const send = (value) => res.write(`data: ${JSON.stringify(value)}\n\n`);
    if (reply.midStreamError) {
      send({ error: { message: 'scripted mid-stream error', code: 500 } });
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    const text = reply.text ?? '';
    // The words in a few pieces, as a real model streams them.
    for (let i = 0; i < text.length; i += 24) {
      send({ choices: [{ delta: { content: text.slice(i, i + 24) } }] });
    }
    const tools = reply.tools ?? [];
    tools.forEach((tool, index) => {
      const args =
        typeof tool.args === 'string'
          ? tool.args
          : JSON.stringify(tool.args ?? {});
      send({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index,
                  id: tool.id ?? `call_${state.requests.length}_${index}`,
                  type: 'function',
                  function: { name: tool.name, arguments: args },
                },
              ],
            },
          },
        ],
      });
    });
    send({
      choices: [
        {
          delta: {},
          finish_reason:
            reply.finish ?? (tools.length > 0 ? 'tool_calls' : 'stop'),
        },
      ],
    });
    send({
      usage: {
        prompt_tokens: 100,
        completion_tokens: Math.max(1, Math.ceil(text.length / 4)),
        total_tokens: 100 + Math.max(1, Math.ceil(text.length / 4)),
        cost: 0,
      },
    });
    res.write('data: [DONE]\n\n');
    res.end();
  }

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    base: `http://127.0.0.1:${port}/v1`,
    get requests() {
      return state.requests;
    },
    get namingRequests() {
      return state.namingRequests;
    },
    get keyChecks() {
      return state.keyChecks;
    },
    get unscripted() {
      return state.unscripted;
    },
    // Replace the script.
    script(list) {
      state.queue = [...list];
      state.unscripted = 0;
    },
    // Forget what was recorded and any script left over.
    reset() {
      state.requests = [];
      state.namingRequests = [];
      state.queue = [];
      state.unscripted = 0;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
