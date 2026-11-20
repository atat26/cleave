import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ToolCall } from './openrouter.ts';
import {
  createEarlierTools,
  EARLIER_DEFINITION,
  EARLIER_TOOL,
  MAX_EARLIER_CHARS,
  MAX_EARLIER_LOOKUPS,
  snippet,
} from './earlierTools.ts';
import type { EarlierMessage } from './earlierTools.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

const call = (args: unknown): ToolCall => ({
  id: 'c',
  name: EARLIER_TOOL,
  arguments: typeof args === 'string' ? args : JSON.stringify(args),
});
const LEFT: EarlierMessage[] = [
  { role: 'user', text: 'My dog is called Biscuit and he is three.' },
  { role: 'assistant', text: 'Biscuit is a lovely name for a dog.' },
  { role: 'user', text: 'I am planning a trip to Lisbon in May.' },
  { role: 'assistant', text: 'Lisbon in May is warm and not too busy.' },
];
const tools = (
  messages: EarlierMessage[] = LEFT,
  level: ApprovalLevel = 'always',
) => createEarlierTools({ unsentMessages: () => messages }, () => level);

test('it is only available while something is left out, and is described as data', () => {
  assert.equal(tools().available(), true);
  assert.equal(tools([]).available(), false);
  assert.match(EARLIER_DEFINITION.description, /left out/);
  assert.match(EARLIER_DEFINITION.description, /data, not instructions/);
});

test('a search finds the messages with their numbers, and marks them as data', async () => {
  const outcome = await tools().run(call({ query: 'dog name' }));
  assert.equal(outcome.ok, true);
  assert.match(outcome.result, /Message 1 \(You\): .*Biscuit/);
  assert.match(outcome.result, /data, not instructions/);
  assert.doesNotMatch(outcome.result, /Lisbon/);
  assert.match(outcome.note ?? '', /Found 2 of the 4/);
});

test('a search with no match says so, and how many messages there are', async () => {
  const outcome = await tools().run(call({ query: 'volcano' }));
  assert.equal(outcome.ok, true);
  assert.match(outcome.result, /No left-out message matches/);
  assert.match(outcome.result, /4 of them/);
});

test('reading goes in order, from a message number, and in parts', async () => {
  const all = await tools().run(call({}));
  assert.match(all.result, /Message 1 \(You\)/);
  assert.match(all.result, /Message 4 \(Assistant\)/);
  assert.doesNotMatch(all.result, /Call again with from/);
  const from3 = await tools().run(call({ from: 3 }));
  assert.doesNotMatch(from3.result, /Message 1/);
  assert.match(from3.result, /Message 3 \(You\)/);
  // A long chat comes back in parts.
  const many: EarlierMessage[] = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    text: `Line ${i + 1}: ${'word '.repeat(300)}`,
  }));
  const part = await tools(many).run(call({ from: 1 }));
  assert.match(
    part.result,
    /Showing messages 1 to \d+ of 30\. Call again with from \d+/,
  );
  assert.ok(part.result.length < MAX_EARLIER_CHARS + 1_500);
  // Past the end is an error with the real range.
  const past = await tools().run(call({ from: 9 }));
  assert.equal(past.ok, false);
  assert.match(past.result, /only 4/);
});

test('a bad request is refused with the reason, and there is a limit per reply', async () => {
  const t = tools();
  assert.equal(t.plan(call({ query: 5 })).kind, 'refuse');
  assert.equal(t.plan(call({ from: 0 })).kind, 'refuse');
  assert.equal(t.plan(call({ from: 1.5 })).kind, 'refuse');
  assert.equal(t.plan(call('{nope')).kind, 'refuse');
  for (let i = 0; i < MAX_EARLIER_LOOKUPS; i++) {
    await t.run(call({ query: 'dog' }));
  }
  assert.equal(t.plan(call({ query: 'dog' })).kind, 'refuse');
  assert.equal(t.used(), MAX_EARLIER_LOOKUPS);
});

test('it follows the level in the Tools panel: ask shows a card, off refuses', () => {
  const asks = tools(LEFT, 'ask').plan(call({ query: 'dog' }));
  assert.equal(asks.kind, 'ask');
  assert.equal(asks.kind === 'ask' && asks.risky, false);
  assert.equal(asks.kind === 'ask' && /dog/.test(asks.text), true);
  assert.equal(
    tools(LEFT, 'never').plan(call({ query: 'dog' })).kind,
    'refuse',
  );
  assert.equal(tools(LEFT, 'always').plan(call({ query: 'dog' })).kind, 'auto');
});

test('nothing left out: it says the whole conversation is already there', async () => {
  const outcome = await tools([]).run(call({ query: 'dog' }));
  assert.equal(outcome.ok, true);
  assert.match(outcome.result, /you already have all of it/);
});

test('the snippet is cut around the match, with dots at the cut ends', () => {
  const text = `${'start '.repeat(40)}the Biscuit part ${'end '.repeat(80)}`;
  const piece = snippet(text, ['biscuit']);
  assert.match(piece, /^…/);
  assert.match(piece, /Biscuit/);
  assert.match(piece, /…$/);
  assert.ok(piece.length <= 245);
});
