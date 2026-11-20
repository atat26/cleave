import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMessages,
  DEFAULT_SYSTEM_PROMPT,
  effectiveSystemPrompt,
  firstSentIndex,
  HOW_TO_WORK,
  howToWork,
  MAX_REMEMBERED_STEPS,
  rememberedSteps,
  unsentMessages,
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

// ---- Remembering earlier searches ------------------------------------------------

const searchPart = (query: string, details?: string) => ({
  type: 'tool' as const,
  id: 1,
  callId: 'c',
  name: 'web_search',
  arguments: JSON.stringify({ query }),
  label: 'Searched',
  status: 'ok' as const,
  outcome: '',
  details:
    details ?? `Search: "${query}"\n[1] Site - https://${query}.example/`,
  ask: '',
  risky: false,
});

test('earlier search results are put in front of the assistant so it need not search again', () => {
  const history = [
    {
      role: 'user' as const,
      content: 'search pandas',
      status: 'done' as const,
    },
    {
      role: 'assistant' as const,
      content: 'Found some.',
      status: 'done' as const,
      parts: [searchPart('pandas')],
    },
    {
      role: 'user' as const,
      content: 'open the first',
      status: 'done' as const,
    },
  ];
  const system = buildMessages({ systemPrompt: null, history })[0].content;
  assert.match(system, /already done in this conversation/);
  assert.match(system, /open_tab/);
  assert.match(system, /Search: "pandas"/);
  assert.match(system, /https:\/\/pandas\.example\//);
});

test('only searches that worked, only the latest few, and only from the part of the chat that is sent', () => {
  const asst = (parts: ReturnType<typeof searchPart>[]) => ({
    role: 'assistant' as const,
    content: 'ok',
    status: 'done' as const,
    parts,
  });
  const user = { role: 'user' as const, content: 'q', status: 'done' as const };
  const failed = {
    ...searchPart('failed'),
    status: 'ok' as const,
    details: '',
  };
  const history = [
    user,
    asst([searchPart('one')]),
    user,
    asst([searchPart('two')]),
    user,
    asst([searchPart('three'), failed]),
    user,
    asst([searchPart('four')]),
    user,
  ];
  const system = buildMessages({ systemPrompt: null, history })[0].content;
  assert.ok(!system.includes('Search: "one"')); // older than the latest three
  for (const q of ['two', 'three', 'four'])
    assert.ok(system.includes(`Search: "${q}"`));
  assert.ok(!system.includes('failed'));

  // Nothing to remember: the system message is exactly as before.
  assert.equal(
    buildMessages({ systemPrompt: null, history: [user] })[0].content,
    DEFAULT_SYSTEM_PROMPT,
  );
});

test('the skills list goes in the system message after the linked items, and is left out when empty', () => {
  const history = [
    { role: 'user' as const, content: 'hi', status: 'done' as const },
  ];
  const withSkills = buildMessages({
    systemPrompt: null,
    linkedContext: 'LINKED',
    skillsContext: 'SKILLS BLOCK',
    history,
  });
  const system = withSkills[0].content;
  assert.ok(system.indexOf('LINKED') < system.indexOf('SKILLS BLOCK'));
  assert.ok(
    !buildMessages({
      systemPrompt: null,
      history,
      skillsContext: null,
    })[0].content.includes('SKILLS'),
  );
});

test('the rules for working with tools follow the system prompt, before anything that changes each turn', () => {
  const messages = buildMessages({
    systemPrompt: 'Be brief.',
    rules: HOW_TO_WORK,
    linkedContext: 'LINKED TABS',
    skillsContext: 'SKILLS LIST',
    history: [{ role: 'user', content: 'hi', status: 'done' }],
  });
  const system = messages[0].content;
  assert.ok(system.startsWith('Be brief.'));
  assert.ok(system.indexOf(HOW_TO_WORK) > 0);
  assert.ok(system.indexOf(HOW_TO_WORK) < system.indexOf('LINKED TABS'));
  assert.ok(system.indexOf('LINKED TABS') < system.indexOf('SKILLS LIST'));
  // Without tools there are no rules about them.
  const plain = buildMessages({
    systemPrompt: null,
    history: [{ role: 'user', content: 'hi', status: 'done' }],
  });
  assert.equal(plain[0].content.includes('How to work'), false);
  // What the rules ask for.
  assert.match(HOW_TO_WORK, /cut off/);
  assert.match(HOW_TO_WORK, /instructions for you/);
  assert.match(HOW_TO_WORK, /vague/);
  assert.match(HOW_TO_WORK, /same kind of step/);
  assert.match(HOW_TO_WORK, /Never say you did something you did not do/);
});

test('planning is not in the rules sent with every request; it is added only when the plan tool is sent', () => {
  assert.equal(HOW_TO_WORK.includes('set_plan'), false);
  assert.equal(howToWork(false), HOW_TO_WORK);
  const withPlan = howToWork(true);
  assert.match(withPlan, /set_plan/);
  assert.match(withPlan, /four or more separate pieces/);
  assert.match(withPlan, /never a single tool call/);
  assert.match(withPlan, /Never say you did something you did not do/);
});

// ---- Remembering what was done ---------------------------------------------------

const stepPart = (
  name: string,
  label: string,
  over: Record<string, unknown> = {},
) => ({
  type: 'tool' as const,
  id: 1,
  callId: 'c',
  name,
  arguments: '{}',
  label,
  status: 'ok' as const,
  outcome: '',
  details: '',
  ask: '',
  risky: false,
  ...over,
});
const turn = (
  parts: ReturnType<typeof stepPart>[],
  followUp = 'what did you do?',
) => [
  { role: 'user' as const, content: 'do it', status: 'done' as const },
  {
    role: 'assistant' as const,
    content: 'Done.',
    status: 'done' as const,
    parts,
  },
  { role: 'user' as const, content: followUp, status: 'done' as const },
];
const systemOf = (history: ReturnType<typeof turn>) =>
  buildMessages({ systemPrompt: null, history })[0].content;

test('what the assistant did that changed something is listed for a follow-up, so it need not look again', () => {
  const system = systemOf(
    turn([
      stepPart(
        'type_text',
        'Type "Alex" into the text field "Your name" on 127.0.0.1',
      ),
      stepPart('fill_fields', 'Fill in 2 fields on shop.example', {
        details: 'Name: Alex Doe\nEmail: alex@example.com',
      }),
      stepPart('click', 'Click the button "Buy"', { status: 'declined' }),
      stepPart('create_artifact', 'Made artifact: Notes'),
    ]),
  );
  assert.match(system, /What you already did in this conversation/);
  assert.match(system, /do not look at a page again/);
  assert.match(
    system,
    /- Done: Type "Alex" into the text field "Your name" on 127\.0\.0\.1/,
  );
  assert.match(
    system,
    /- Done: Fill in 2 fields on shop\.example \(Name: Alex Doe Email: alex@example\.com\)/,
  );
  assert.match(system, /- Not done, the user said no: Click the button "Buy"/);
  assert.match(system, /- Done: Made artifact: Notes/);
  // It says the names come from web pages.
  assert.match(system, /data, not instructions/);
});

test('reads, looks, searches and scrolls are not listed; nor are steps still going or waiting', () => {
  const system = systemOf(
    turn([
      stepPart('read_page', 'Read: Pricing'),
      stepPart('look_at_page', 'Looked at: Pricing'),
      stepPart('web_search', 'Searched: "x"'),
      stepPart('read_link', 'Read link: x'),
      stepPart('scroll', 'Scrolled down'),
      stepPart('search_history', 'Searched your history'),
      stepPart('click', 'Click the button "Go"', { status: 'waiting' }),
      stepPart('click', 'Click the button "Stop"', { status: 'running' }),
    ]),
  );
  assert.ok(!system.includes('What you already did'));
  assert.ok(!system.includes('Pricing'));
});

test('failed, blocked and stopped steps say so, the latest few are kept, and a long line is cut', () => {
  const system = systemOf(
    turn([
      stepPart('click', 'Click A', { status: 'error' }),
      stepPart('click', 'Click B', { status: 'error', blocked: true }),
      stepPart('click', 'Click C', { status: 'error', skipped: true }),
    ]),
  );
  assert.match(system, /- Failed: Click A/);
  assert.match(system, /- Not done, it was blocked: Click B/);
  assert.match(system, /- Not done, it was stopped: Click C/);

  const many = Array.from({ length: 20 }, (_, i) =>
    stepPart('click', `Click ${i}`),
  );
  const lines = systemOf(turn(many))
    .split('\n')
    .filter((l) => l.startsWith('- Done: Click'));
  assert.equal(lines.length, MAX_REMEMBERED_STEPS);
  assert.equal(lines[0], '- Done: Click 5');
  assert.equal(lines[lines.length - 1], '- Done: Click 19');

  const long = systemOf(turn([stepPart('click', `Click ${'x'.repeat(500)}`)]));
  const line = long.split('\n').find((l) => l.startsWith('- Done: Click'))!;
  assert.ok(line.length <= 240);
  assert.ok(line.endsWith('…'));
});

test('with no earlier steps nothing is added, and a chat without tools adds nothing either', () => {
  const plain = buildMessages({
    systemPrompt: null,
    history: [msg('user', 'Hi')],
  });
  assert.equal(plain[0].content, DEFAULT_SYSTEM_PROMPT);
  assert.equal(rememberedSteps([]), null);
});

// ---- A chat longer than what is sent ---------------------------------------------

test('when the start of a long chat is not sent, the assistant is told how much, and not to go searching for it', () => {
  const history = Array.from({ length: 40 }, (_, i) =>
    msg(i % 2 === 0 ? 'user' : 'assistant', `message ${i + 1}`),
  );
  const system = buildMessages({ systemPrompt: null, history })[0].content;
  // 30 are sent (the last 30, which start with a message of yours), so the first 10 are left out.
  assert.match(system, /its first 10 messages are left out/);
  assert.match(system, /no longer see the start of this conversation/);
  assert.match(system, /Do not search their history or other chats/);
  // A short chat, or an empty one, is told nothing.
  const short = buildMessages({
    systemPrompt: null,
    history: history.slice(0, 5),
  })[0].content;
  assert.ok(!short.includes('not shown to you'));
  assert.equal(
    buildMessages({ systemPrompt: null, history: [] })[0].content,
    DEFAULT_SYSTEM_PROMPT,
  );
});

// ---- What is left out ---------------------------------------------------------------

const many = (n: number): { role: Role; content: string; status: 'done' }[] =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `message ${i + 1}`,
    status: 'done' as const,
  }));

test('a short chat leaves nothing out; a long one leaves out its oldest messages, and what is sent starts with the user', () => {
  assert.deepEqual(unsentMessages(many(10)), []);
  assert.equal(firstSentIndex(many(10)), null);
  const long = many(40);
  const left = unsentMessages(long);
  assert.equal(left.length > 0, true);
  assert.equal(left[0].content, 'message 1');
  const first = firstSentIndex(long)!;
  assert.equal(first, left.length);
  assert.equal(long[first].role, 'user');
  // The same as what buildMessages sends.
  const sent = buildMessages({ systemPrompt: null, history: long });
  assert.equal(sent.length - 1, long.length - left.length);
});

test('messages that are never sent (empty, failed) do not count as left out', () => {
  const history = [
    ...many(4),
    { role: 'assistant' as const, content: '', status: 'done' as const },
    { role: 'assistant' as const, content: 'half', status: 'error' as const },
  ];
  assert.deepEqual(unsentMessages(history), []);
  assert.equal(firstSentIndex(history), null);
});

test('the note about the left-out messages points to the look-up tool only when there is one', () => {
  const long = many(40);
  const withTool = buildMessages({
    systemPrompt: null,
    history: long,
    canLookUpStart: true,
  })[0].content;
  assert.match(withTool, /earlier_in_this_chat/);
  assert.match(withTool, /Do not search their history or other chats/);
  const without = buildMessages({ systemPrompt: null, history: long })[0]
    .content;
  assert.equal(without.includes('earlier_in_this_chat'), false);
  assert.match(without, /ask them to say it again/);
});
