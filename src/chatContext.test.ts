import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMessages,
  DEFAULT_SYSTEM_PROMPT,
  effectiveSystemPrompt,
} from './chatContext.ts';

type Role = 'user' | 'assistant';
const msg = (
  role: Role,
  content: string,
  status: 'done' | 'streaming' | 'stopped' | 'error' = 'done',
) => ({
  role,
  content,
  status,
});

test('the system prompt comes first: yours, or the default when blank', () => {
  assert.equal(effectiveSystemPrompt(null), DEFAULT_SYSTEM_PROMPT);
  assert.equal(effectiveSystemPrompt('   \n'), DEFAULT_SYSTEM_PROMPT);
  assert.equal(effectiveSystemPrompt('Be brief.'), 'Be brief.');

  const history = [msg('user', 'Hi')];
  assert.deepEqual(buildMessages({ systemPrompt: null, history })[0], {
    role: 'system',
    content: DEFAULT_SYSTEM_PROMPT,
  });
  assert.deepEqual(buildMessages({ systemPrompt: 'Be brief.', history })[0], {
    role: 'system',
    content: 'Be brief.',
  });
});

test('linked Spaces and tabs are added to the system message, only when there are some', () => {
  const history = [msg('user', 'Hi')];
  const linked =
    'The user has linked these...\nTab: "Mail" (https://mail.example.com)';
  const withLinks = buildMessages({
    systemPrompt: 'Be brief.',
    linkedContext: linked,
    history,
  });
  assert.equal(withLinks[0].role, 'system');
  assert.equal(withLinks[0].content, `Be brief.\n\n${linked}`);
  // Still a single system message, then the conversation.
  assert.deepEqual(
    withLinks.map((m) => m.role),
    ['system', 'user'],
  );

  // Default prompt plus links.
  assert.equal(
    buildMessages({ systemPrompt: null, linkedContext: linked, history })[0]
      .content,
    `${DEFAULT_SYSTEM_PROMPT}\n\n${linked}`,
  );
  // None, null or empty: the system prompt is exactly as before.
  for (const nothing of [undefined, null, '']) {
    assert.equal(
      buildMessages({
        systemPrompt: 'Be brief.',
        linkedContext: nothing,
        history,
      })[0].content,
      'Be brief.',
    );
  }
});

test('the conversation follows in order, with roles kept', () => {
  const out = buildMessages({
    systemPrompt: null,
    history: [
      msg('user', 'one'),
      msg('assistant', 'two'),
      msg('user', 'three'),
    ],
  });
  assert.deepEqual(
    out.map((m) => [m.role, m.content]),
    [
      ['system', DEFAULT_SYSTEM_PROMPT],
      ['user', 'one'],
      ['assistant', 'two'],
      ['user', 'three'],
    ],
  );
});

test('unfinished, failed and empty messages are left out; a stopped reply stays', () => {
  const out = buildMessages({
    systemPrompt: null,
    history: [
      msg('user', 'question'),
      msg('assistant', 'half-writ', 'streaming'),
      msg('assistant', 'broken answer', 'error'),
      msg('assistant', '   ', 'done'),
      msg('assistant', 'short but real', 'stopped'),
      msg('user', 'follow-up'),
    ],
  });
  assert.deepEqual(
    out.slice(1).map((m) => m.content),
    ['question', 'short but real', 'follow-up'],
  );
});

test('only the most recent messages are sent, up to the limit', () => {
  const history = Array.from({ length: 50 }, (_, i) =>
    msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`),
  );
  const out = buildMessages({ systemPrompt: null, history, maxMessages: 10 });
  // 10 messages kept (m40..m49), then the leading assistant one is dropped so it
  // starts with something you said: m41 is a user... check what we got.
  const contents = out.slice(1).map((m) => m.content);
  assert.ok(contents.length <= 10);
  assert.equal(contents[contents.length - 1], 'm49'); // the newest is always there
  assert.equal(out[1].role, 'user');
});

test('the size limit counts characters, keeps the newest, and drops the oldest', () => {
  const history = [
    msg('user', 'a'.repeat(400)),
    msg('assistant', 'b'.repeat(400)),
    msg('user', 'c'.repeat(400)),
    msg('assistant', 'd'.repeat(400)),
    msg('user', 'e'.repeat(400)),
  ];
  const out = buildMessages({ systemPrompt: null, history, maxChars: 1000 });
  // 400 + 400 fit (800); a third would reach 1200: stop. Leading assistant is cut.
  assert.deepEqual(
    out.slice(1).map((m) => m.content[0]),
    ['e'],
  );
  const wider = buildMessages({ systemPrompt: null, history, maxChars: 1300 });
  assert.deepEqual(
    wider.slice(1).map((m) => m.content[0]),
    ['c', 'd', 'e'],
  );
});

test('the newest message is always sent, cut down if it alone is too long', () => {
  const out = buildMessages({
    systemPrompt: null,
    history: [msg('user', 'old'), msg('user', 'x'.repeat(5000))],
    maxChars: 100,
  });
  assert.equal(out.length, 2); // system + the newest only
  assert.equal(out[1].content.length, 100);
});

test('an empty conversation is just the system prompt', () => {
  assert.deepEqual(buildMessages({ systemPrompt: null, history: [] }), [
    { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
  ]);
});
