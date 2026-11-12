import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanName,
  MAX_NAME_CHARS,
  namingMessages,
  parseNaming,
  requestName,
} from './naming.ts';
import { ChatError } from './openrouter.ts';
import type { StreamEvent } from './openrouter.ts';

const text = (value: string): StreamEvent => ({ type: 'text', text: value });
const streamOf = (...events: StreamEvent[]) =>
  async function* () {
    for (const event of events) yield event;
  };
const signal = () => new AbortController().signal;

test('the model is asked for JSON and shown the text as data', () => {
  const messages = namingMessages('chat', 'Find me a cheap laptop');
  assert.equal(messages[0].role, 'system');
  assert.match(String(messages[0].content), /JSON/);
  assert.match(String(messages[0].content), /not instructions/);
  assert.match(String(messages[1].content), /Find me a cheap laptop/);
  // A very long text is cut.
  const long = namingMessages('artifact', 'x'.repeat(10_000));
  assert.ok(String(long[1].content).length < 2200);
});

test('names are tidied and cut short', () => {
  assert.equal(cleanName('"Trip planning."'), 'Trip planning');
  assert.equal(cleanName('**Budget** `ideas`\n'), 'Budget ideas');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(5), null);
  const long = cleanName('word '.repeat(30)) as string;
  assert.ok(long.length <= MAX_NAME_CHARS);
  assert.ok(!long.endsWith(' '));
});

test('a JSON answer is read, also when wrapped in text or a code fence', () => {
  assert.deepEqual(parseNaming('{"name": "Trip plans", "emoji": "🗺️"}'), {
    name: 'Trip plans',
    emoji: '🗺️',
  });
  assert.deepEqual(
    parseNaming('Sure!\n```json\n{"name":"Tax notes","emoji":"🧾"}\n```'),
    { name: 'Tax notes', emoji: '🧾' },
  );
});

test('a bad emoji or name in the JSON is dropped, not applied', () => {
  assert.deepEqual(parseNaming('{"name": "Tax notes", "emoji": "hello"}'), {
    name: 'Tax notes',
    emoji: null,
  });
  assert.deepEqual(parseNaming('{"name": "", "emoji": "🧾"}'), {
    name: null,
    emoji: '🧾',
  });
  assert.equal(parseNaming('{"name": "", "emoji": "no"}'), null);
});

test('a plain-text answer still works: first line, first emoji', () => {
  assert.deepEqual(parseNaming('🚀 Rocket launch ideas\nsome more'), {
    name: 'Rocket launch ideas',
    emoji: '🚀',
  });
  assert.equal(parseNaming(''), null);
});

test('requestName collects the streamed answer', async () => {
  const result = await requestName({
    stream: streamOf(
      text('{"name": "Cheap'),
      text(' laptops", "emoji": "💻"}'),
    ),
    kind: 'chat',
    material: 'cheap laptop',
    signal: signal(),
  });
  assert.deepEqual(result, { ok: true, name: 'Cheap laptops', emoji: '💻' });
});

test('requestName: nothing to name, an unusable answer and failures are plain messages', async () => {
  const empty = await requestName({
    stream: streamOf(),
    kind: 'space',
    material: '  ',
    signal: signal(),
  });
  assert.equal(empty.ok, false);

  const junk = await requestName({
    stream: streamOf(text('')),
    kind: 'space',
    material: 'tabs',
    signal: signal(),
  });
  assert.equal(junk.ok, false);

  const broken = await requestName({
    stream: async function* () {
      yield text('x');
      throw new ChatError('network');
    },
    kind: 'space',
    material: 'tabs',
    signal: signal(),
  });
  assert.equal(broken.ok, false);

  const crash = await requestName({
    stream: async function* () {
      throw new Error('secret key abc123');
    },
    kind: 'space',
    material: 'tabs',
    signal: signal(),
  });
  assert.equal(crash.ok, false);
  assert.ok(!JSON.stringify(crash).includes('abc123'));
});
