import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatMessage, MessagePart } from './chats.ts';
import {
  blocksOf,
  canRetry,
  groupState,
  groupTitle,
  isOwnDataTool,
  recentSteps,
  retryRequest,
  runningNote,
  runOf,
  splitLabel,
  stepKind,
  stepSite,
  stepTabId,
  stepState,
  stepView,
} from './runModel.ts';
import {
  CONTINUE_TEXT,
  LIMIT_WORDS,
  RUN_WORDS,
  STATE_WORDS,
} from './runModel.ts';
import type { ToolPartView } from './runModel.ts';

let nextId = 1;
const tool = (over: Partial<ToolPartView> = {}): ToolPartView => ({
  type: 'tool',
  id: nextId++,
  callId: 'c',
  name: 'read_page',
  arguments: '{"tab":4}',
  label: 'Read: Shop A',
  status: 'ok',
  outcome: 'About 800 words',
  details: '',
  ask: '',
  risky: false,
  ...over,
});
const message = (
  parts: MessagePart[],
  status: ChatMessage['status'] = 'done',
): ChatMessage =>
  ({ role: 'assistant', status, parts, content: '' }) as unknown as ChatMessage;

test('a step is in one of seven states, from its status and how the reply ended', () => {
  assert.equal(stepState(tool({ status: 'running' }), 'streaming'), 'running');
  assert.equal(stepState(tool({ status: 'waiting' }), 'streaming'), 'waiting');
  assert.equal(stepState(tool({ status: 'ok' }), 'done'), 'done');
  assert.equal(stepState(tool({ status: 'declined' }), 'done'), 'declined');
  assert.equal(stepState(tool({ status: 'error' }), 'done'), 'failed');
  assert.equal(
    stepState(tool({ status: 'error', blocked: true }), 'done'),
    'blocked',
  );
  // A step still going when the reply was stopped did not finish.
  assert.equal(stepState(tool({ status: 'running' }), 'stopped'), 'stopped');
  assert.equal(stepState(tool({ status: 'waiting' }), 'stopped'), 'stopped');
});

test('the line "Verb: target" is split, and a line with no target stays whole', () => {
  assert.deepEqual(splitLabel('Read: Best Buy: Store Locator'), {
    verb: 'Read',
    target: 'Best Buy: Store Locator',
  });
  assert.deepEqual(splitLabel('Moved 3 tabs'), {
    verb: 'Moved 3 tabs',
    target: null,
  });
  assert.deepEqual(splitLabel('Searched: "gpu"'), {
    verb: 'Searched',
    target: '"gpu"',
  });
});

test('a step view carries its words, result, kind and whether you allowed it', () => {
  const view = stepView(
    tool({
      name: 'click',
      label: 'Clicked: Add to cart',
      ask: 'Click Add to cart',
      outcome: 'Done',
    }),
    'done',
  );
  assert.equal(view.verb, 'Clicked');
  assert.equal(view.target, 'Add to cart');
  assert.equal(view.result, 'Done');
  assert.equal(view.kind, 'act');
  assert.equal(view.allowed, true);
  // No result line while it is still going.
  assert.equal(
    stepView(tool({ status: 'running', outcome: 'x' }), 'streaming').result,
    '',
  );
  assert.equal(stepKind('read_page'), 'read');
  assert.equal(stepKind('move_tabs'), 'tabs');
  assert.equal(stepKind('search_history'), 'recall');
  assert.equal(stepKind('create_artifact'), 'make');
  assert.equal(stepKind('offer_choices'), 'talk');
  assert.equal(stepKind('not_a_tool'), 'read');
});

test('the site of a step comes from its tab number or its address', () => {
  const tabs = [
    {
      id: 4,
      url: 'https://www.shop-a.example/x?y=1',
      favicon: 'https://shop-a.example/i.png',
    },
  ];
  assert.deepEqual(stepSite(tool({ arguments: '{"tab":4}' }), tabs), {
    host: 'shop-a.example',
    favicon: 'https://shop-a.example/i.png',
  });
  assert.deepEqual(
    stepSite(
      tool({
        name: 'read_link',
        arguments: '{"url":"https://news.example/a"}',
      }),
      tabs,
    ),
    { host: 'news.example', favicon: null },
  );
  assert.equal(stepSite(tool({ arguments: '{"tab":99}' }), tabs), null);
  assert.equal(stepSite(tool({ arguments: 'not json' }), tabs), null);
  assert.equal(stepSite(tool({ arguments: '"text"' }), tabs), null);
  assert.equal(stepSite(tool({ arguments: '{"url":"nonsense"}' }), tabs), null);
});

test('three or more page reads in a row fold into one group; fewer, or anything else between, do not', () => {
  const parts: MessagePart[] = [
    { type: 'text', text: 'On it' },
    tool(),
    tool(),
    tool({ name: 'look_at_page' }),
    { type: 'text', text: 'Now acting' },
    tool({ name: 'click' }),
    tool(),
    tool(),
  ];
  assert.deepEqual(blocksOf(parts), [
    { type: 'part', index: 0 },
    { type: 'group', indexes: [1, 2, 3] },
    { type: 'part', index: 4 },
    { type: 'part', index: 5 },
    { type: 'part', index: 6 },
    { type: 'part', index: 7 },
  ]);
  // A read waiting for approval (a link that asks) is never hidden in a group.
  const waiting: MessagePart[] = [
    tool(),
    tool(),
    tool({ status: 'waiting' }),
    tool(),
  ];
  assert.ok(blocksOf(waiting).every((b) => b.type === 'part'));
});

test('a group says how many pages, and how far along', () => {
  const read = (state: 'running' | 'done', name = 'read_page') =>
    stepView(
      tool({ name, status: state === 'done' ? 'ok' : 'running' }),
      state === 'done' ? 'done' : 'streaming',
    );
  const going = [read('done'), read('running'), read('running')];
  assert.deepEqual(groupTitle(going), {
    title: 'Reading 3 pages',
    progress: '1 of 3 done',
  });
  assert.equal(groupState(going), 'running');
  const done = [read('done'), read('done'), read('done')];
  assert.deepEqual(groupTitle(done), { title: 'Read 3 pages', progress: '' });
  assert.equal(groupState(done), 'done');
  const mixed = [read('done'), read('done', 'look_at_page'), read('done')];
  assert.equal(groupTitle(mixed).title, 'Looked at 3 pages');
  const bad = [
    read('done'),
    stepView(tool({ status: 'error' }), 'done'),
    read('done'),
  ];
  assert.equal(groupState(bad), 'failed');
});

test('the run reads as working, waiting, finished, stopped or stuck', () => {
  assert.equal(runOf(undefined), null);
  assert.equal(runOf(message([{ type: 'text', text: 'hi' }])), null);
  const working = runOf(
    message(
      [tool(), tool({ status: 'running', label: 'Reading: Shop B' })],
      'streaming',
    ),
  );
  assert.equal(working?.word, 'working');
  assert.equal(working?.verb, 'Reading');
  assert.equal(working?.target, 'Shop B');
  assert.equal(working?.stepNumber, 2);
  assert.deepEqual(working?.ticks, ['done', 'running']);
  const waiting = runOf(
    message(
      [
        tool({
          status: 'waiting',
          name: 'click',
          label: 'Click: Submit',
          ask: 'Click Submit',
        }),
        tool({ status: 'running' }),
      ],
      'streaming',
    ),
  );
  assert.equal(waiting?.word, 'waiting');
  assert.equal(waiting?.target, 'Submit');
  assert.equal(runOf(message([tool()], 'done'))?.word, 'finished');
  assert.equal(
    runOf(message([tool({ status: 'running' })], 'stopped'))?.word,
    'stopped',
  );
  // The last step failed or was blocked and the reply ended: stuck.
  assert.equal(
    runOf(message([tool(), tool({ status: 'error' })], 'done'))?.word,
    'stuck',
  );
  assert.equal(
    runOf(message([tool(), tool({ status: 'error', blocked: true })], 'done'))
      ?.word,
    'stuck',
  );
  // A failure the assistant worked around is not "stuck".
  assert.equal(
    runOf(message([tool({ status: 'error' }), tool()], 'done'))?.word,
    'finished',
  );
  assert.equal(runOf(message([tool()], 'error'))?.word, 'stuck');
});

test('the tick row keeps the latest steps only', () => {
  const many = Array.from({ length: 60 }, () => tool());
  assert.equal(runOf(message(many, 'done'))?.ticks.length, 40);
});

test('"Try again" is for a failed or cut-off step in the newest reply, when nothing is being written', () => {
  assert.equal(canRetry({ state: 'failed' }, true, false), true);
  assert.equal(canRetry({ state: 'stopped' }, true, false), true);
  assert.equal(canRetry({ state: 'failed' }, false, false), false);
  assert.equal(canRetry({ state: 'failed' }, true, true), false);
  for (const state of [
    'done',
    'declined',
    'blocked',
    'running',
    'waiting',
  ] as const) {
    assert.equal(canRetry({ state }, true, false), false, state);
  }
});

test("the retry message uses only the tool's own title, never anything from a page", () => {
  assert.equal(
    retryRequest('click'),
    'The step "Click" did not work. Please try it again, or tell me what went wrong.',
  );
  assert.equal(
    retryRequest('made_up'),
    'The last step did not work. Please try it again, or tell me what went wrong.',
  );
});

test('the run says which tab the current step is in, and whether it is on that page', () => {
  const read = runOf(
    message([tool({ name: 'read_page', arguments: '{"tab":4}' })], 'streaming'),
  );
  assert.equal(read?.tabId, 4);
  assert.equal(read?.touchesPage, true);
  assert.equal(read?.reading, true);
  const click = runOf(
    message(
      [
        tool({
          name: 'click',
          arguments: '{"tab":4,"element":2}',
          status: 'running',
        }),
      ],
      'streaming',
    ),
  );
  assert.equal(click?.touchesPage, true);
  assert.equal(click?.reading, false);
  // A step about your tabs or history has no page, even though it may name a tab.
  const move = runOf(
    message(
      [tool({ name: 'move_tabs', arguments: '{"tab":4}', status: 'running' })],
      'streaming',
    ),
  );
  assert.equal(move?.touchesPage, false);
  const search = runOf(
    message(
      [tool({ name: 'web_search', arguments: '{"query":"x"}' })],
      'streaming',
    ),
  );
  assert.equal(search?.tabId, null);
  assert.equal(search?.touchesPage, false);
  assert.equal(stepTabId({ arguments: 'not json' }), null);
  assert.equal(stepTabId({ arguments: '{"tab":"4"}' }), null);
});

test("the last three steps are listed oldest first, in the app's own words", () => {
  const parts = [
    tool({ id: 1, label: 'Read: Shop A' }),
    tool({ id: 2, label: 'Read: Shop B' }),
    tool({ id: 3, label: 'Clicking: Add to cart', status: 'running' }),
    tool({ id: 4, label: 'Type: Search', status: 'waiting' }),
  ];
  const recent = recentSteps(message(parts, 'streaming'));
  assert.deepEqual(
    recent.map((r) => [r.partId, r.state, r.verb, r.target]),
    [
      [2, 'done', 'Read', 'Shop B'],
      [3, 'running', 'Clicking', 'Add to cart'],
      [4, 'waiting', 'Type', 'Search'],
    ],
  );
  // Fewer steps, or none, or text only.
  assert.equal(recentSteps(message([tool()])).length, 1);
  assert.deepEqual(recentSteps(message([])), []);
  assert.deepEqual(recentSteps(undefined), []);
  assert.equal(recentSteps(message(parts), 2).length, 2);
});

test('a stopped run says it was stopped by you, and its unfinished steps are not done', () => {
  assert.equal(RUN_WORDS.stopped, 'Stopped by you');
  assert.equal(STATE_WORDS.stopped, 'Not done');
  const stopped = runOf(
    message([tool({ status: 'ok' }), tool({ status: 'running' })], 'stopped'),
  );
  assert.equal(stopped?.word, 'stopped');
  assert.equal(stopped?.state, 'stopped');
});

test('a step skipped because you closed its tab is cut short, not failed', () => {
  const skipped = tool({ status: 'error', skipped: true });
  assert.equal(stepState(skipped, 'done'), 'stopped');
  assert.equal(stepState(skipped, 'streaming'), 'stopped');
  // A real failure stays a failure.
  assert.equal(stepState(tool({ status: 'error' }), 'done'), 'failed');
});

test('a running step says when it waits for its page to load, and when the tab was asleep', () => {
  const tabs = [
    {
      id: 4,
      title: 'Shop D',
      url: 'https://shop.example/d',
      loading: true,
      wokeForAssistant: false,
    },
    {
      id: 5,
      title: '',
      url: 'https://www.news.example/x',
      loading: true,
      wokeForAssistant: true,
    },
    {
      id: 6,
      title: 'Idle',
      url: 'https://idle.example/',
      loading: false,
      wokeForAssistant: true,
    },
    {
      id: 7,
      title: 'Calm',
      url: 'https://calm.example/',
      loading: false,
      wokeForAssistant: false,
    },
  ];
  const running = (id: number) =>
    stepView(
      tool({ status: 'running', arguments: JSON.stringify({ tab: id }) }),
      'streaming',
    );
  assert.deepEqual(runningNote(running(4), tabs), {
    line: 'Waiting for Shop D to load',
    asleep: false,
  });
  // No title yet: the site's name.
  assert.deepEqual(runningNote(running(5), tabs), {
    line: 'Waiting for news.example to load',
    asleep: true,
  });
  // Awake again but still marked: the badge, no line.
  assert.deepEqual(runningNote(running(6), tabs), { line: '', asleep: true });
  // Nothing to say.
  assert.equal(runningNote(running(7), tabs), null);
  assert.equal(runningNote(running(99), tabs), null);
  // Only while it runs.
  const done = stepView(tool({ status: 'ok', arguments: '{"tab":4}' }), 'done');
  assert.equal(runningNote(done, tabs), null);
});

test('a finished reply that used up a limit says so in its run; no other run does', () => {
  const steps = [tool()];
  const finished = { ...message(steps), limit: 'actions' } as ChatMessage;
  assert.equal(runOf(finished)?.limit, 'actions');
  assert.equal(runOf(message(steps))?.limit, undefined);
  // Not while it is still going, and not after a Stop.
  assert.equal(
    runOf({ ...finished, status: 'streaming' } as ChatMessage)?.limit,
    undefined,
  );
  assert.equal(
    runOf({ ...finished, status: 'stopped' } as ChatMessage)?.limit,
    undefined,
  );
});

test('the words of the limit banner are neutral and the Continue request carries on', () => {
  assert.match(LIMIT_WORDS.actions, /limit of 25 actions/);
  assert.match(LIMIT_WORDS.reads, /pages/);
  assert.doesNotMatch(
    Object.values(LIMIT_WORDS).join(' '),
    /error|fail|wrong|sorry/i,
  );
  assert.match(CONTINUE_TEXT, /carry on where you left off/i);
});

test('steps on your own data in a row become one block, however few; a waiting one and anything else stay out', () => {
  const own = (name = 'search_history', over: Partial<ToolPartView> = {}) =>
    tool({ name, ...over });
  const parts: MessagePart[] = [
    { type: 'text', text: 'Looking' },
    own('search_history'),
    own('search_chats'),
    own('read_chat'),
    { type: 'text', text: 'Found it' },
    own('list_all_tabs'),
    tool({ name: 'click' }),
  ];
  assert.deepEqual(blocksOf(parts), [
    { type: 'part', index: 0 },
    { type: 'owndata', indexes: [1, 2, 3] },
    { type: 'part', index: 4 },
    { type: 'owndata', indexes: [5] },
    { type: 'part', index: 6 },
  ]);
  // A step waiting for your OK is shown on its own, with its card.
  assert.deepEqual(
    blocksOf([own(), own('search_bookmarks', { status: 'waiting' }), own()]),
    [
      { type: 'owndata', indexes: [0] },
      { type: 'part', index: 1 },
      { type: 'owndata', indexes: [2] },
    ],
  );
  // Saving a bookmark is not looking at your data.
  assert.deepEqual(blocksOf([own('bookmark_page')]), [
    { type: 'part', index: 0 },
  ]);
  // Page reads and own-data steps do not mix in one block, and reads still fold at three.
  assert.deepEqual(blocksOf([own(), tool(), tool(), tool(), own()]), [
    { type: 'owndata', indexes: [0] },
    { type: 'group', indexes: [1, 2, 3] },
    { type: 'owndata', indexes: [4] },
  ]);
  assert.equal(isOwnDataTool('read_chat'), true);
  assert.equal(isOwnDataTool('read_page'), false);
});
