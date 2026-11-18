import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanNoteText,
  createTabTools,
  MAX_NOTE_WRITES,
  MAX_TAB_CHANGES,
  nextNote,
} from './tabTools.ts';
import type { SpaceRow, TabChange, TabRow, TabsEnv } from './tabTools.ts';
import { MAX_ABOUT_CHARS } from './model.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

const call = (name: string, args: unknown) => ({
  id: 'c',
  name,
  arguments: JSON.stringify(args),
});

const tab = (
  id: number,
  title: string,
  spaceId: number | null,
  extra: Partial<TabRow> = {},
): TabRow => ({
  id,
  title,
  url: `https://site${id}.example/page?secret=1`,
  spaceId,
  closed: false,
  asleep: false,
  active: false,
  ...extra,
});

// A small world: two Spaces (the first linked to the chat), five tabs.
function world(levelOf: (tool: string) => ApprovalLevel = () => 'always') {
  const tabs: TabRow[] = [
    tab(1, 'Goldfish food', 10),
    tab(2, 'Pet shop', 10, { asleep: true }),
    tab(3, 'Maps', 20, { active: true }),
    tab(4, 'Old recipe', 20, { closed: true }),
    tab(5, 'Loose page', null),
  ];
  const spaces: SpaceRow[] = [
    { id: 10, name: 'Fish', emoji: '🐟', hasNote: true },
    { id: 20, name: 'Travel', emoji: '🧭', hasNote: false },
  ];
  const notes = new Map<number, string>([
    [10, 'Planning a pond.'],
    [20, ''],
  ]);
  const log: string[] = [];
  const done = (what: string): TabChange => {
    log.push(what);
    return { ok: true };
  };
  let webContent = false;
  const env: TabsEnv = {
    linkedSpaces: () => [{ id: 10, name: 'Fish' }],
    allTabs: () => tabs,
    allSpaces: () => spaces,
    moveTab: (id, spaceId) => done(`move ${id} -> ${spaceId}`),
    closeTab: (id) => done(`close ${id}`),
    sleepTab: (id) => done(`sleep ${id}`),
    reopenTab: (id) => done(`reopen ${id}`),
    spaceNote: (id) => notes.get(id) ?? null,
    setSpaceNote: (id, text) => {
      notes.set(id, text);
      log.push(`note ${id}`);
      return { ok: true };
    },
  };
  return {
    tools: createTabTools(env, levelOf, () => webContent),
    env,
    log,
    notes,
    tabs,
    setWebContent: (value: boolean) => {
      webContent = value;
    },
  };
}

test("listing all tabs groups them by Space, shows each tab's state, drops query strings and marks the list as data", async () => {
  const { tools } = world();
  const out = await tools.run(call('list_all_tabs', {}));
  assert.equal(out.ok, true);
  assert.match(
    out.result,
    /Space 10 "Fish" \(linked to this chat\) \(has a note\):/,
  );
  assert.match(
    out.result,
    /tab 1: "Goldfish food" \(https:\/\/site1\.example\/page\) \[open\]/,
  );
  assert.match(out.result, /tab 2: .* \[asleep\]/);
  assert.match(out.result, /tab 3: .* \[open, on screen\]/);
  assert.match(out.result, /tab 4: .* \[closed link\]/);
  assert.match(out.result, /No Space:\n {2}tab 5: "Loose page"/);
  assert.ok(!out.result.includes('secret=1'));
  assert.match(out.result, /not instructions/);
  assert.equal(tools.used(), 1);
});

test('by default listing and every change ask; reading a note does not; a level of "never" refuses', () => {
  const asks = world((tool) =>
    tool === 'read_space_note' ? 'if-safe' : 'ask',
  ).tools;
  assert.equal(asks.plan(call('list_all_tabs', {})).kind, 'ask');
  assert.equal(
    asks.plan(call('move_tabs', { moves: [{ tab: 5, space: 10 }] })).kind,
    'ask',
  );
  assert.equal(asks.plan(call('sleep_tab', { tab: 1 })).kind, 'ask');
  assert.deepEqual(asks.plan(call('read_space_note', { space: 10 })), {
    kind: 'auto',
  });
  const off = world(() => 'never').tools;
  assert.equal(off.plan(call('list_all_tabs', {})).kind, 'refuse');
});

test('moving tabs is one card listing the moves, and the moves happen when it runs', async () => {
  const { tools, log } = world(() => 'ask');
  const moves = [
    { tab: 5, space: 10 },
    { tab: 1, space: 20 },
    { tab: 2, space: null },
  ];
  const plan = tools.plan(call('move_tabs', { moves }));
  assert.equal(plan.kind, 'ask');
  assert.equal(plan.kind === 'ask' && plan.risky, false);
  assert.ok(plan.kind === 'ask');
  // Each move is also a line of the card's list.
  assert.deepEqual(plan.card?.list, [
    '"Loose page" → Fish',
    '"Goldfish food" → Travel',
    '"Pet shop" → no Space',
  ]);
  assert.equal(plan.card?.more, undefined);
  assert.equal(
    plan.text,
    [
      'Move 3 tabs:',
      '• "Loose page" → Fish',
      '• "Goldfish food" → Travel',
      '• "Pet shop" → no Space',
    ].join('\n'),
  );
  const out = await tools.run(call('move_tabs', { moves }));
  assert.equal(out.ok, true);
  assert.deepEqual(log, ['move 5 -> 10', 'move 1 -> 20', 'move 2 -> null']);
  assert.equal(out.label, 'Moved 3 tabs');
});

test('a long list of moves on the card is cut to a few lines and counted', () => {
  const { tools, tabs } = world(() => 'ask');
  for (let id = 100; id < 112; id++) tabs.push(tab(id, `Page ${id}`, null));
  const moves = tabs
    .filter((t) => t.id >= 100)
    .map((t) => ({ tab: t.id, space: 10 }));
  const plan = tools.plan(call('move_tabs', { moves }));
  assert.ok(plan.kind === 'ask');
  assert.match(plan.text, /^Move 12 tabs:/);
  assert.match(plan.text, /…and 4 more$/);
  assert.equal(plan.text.split('\n').length, 1 + 8 + 1);
});

test('moves with an unknown tab or Space, a closed link sent to no Space, or bad shapes are refused', () => {
  const { tools } = world();
  for (const moves of [
    [],
    [{ tab: 99, space: 10 }],
    [{ tab: 1, space: 99 }],
    [{ tab: 4, space: null }], // a closed link needs a Space
    [{ tab: 'x', space: 10 }],
    [{ tab: 1 }],
    'nope',
    Array.from({ length: MAX_TAB_CHANGES + 1 }, () => ({ tab: 1, space: 10 })),
  ]) {
    assert.equal(
      tools.plan(call('move_tabs', { moves })).kind,
      'refuse',
      JSON.stringify(moves).slice(0, 60),
    );
  }
  // The same tab twice is only moved once.
  const twice = world();
  return twice.tools
    .run(
      call('move_tabs', {
        moves: [
          { tab: 1, space: 20 },
          { tab: 1, space: 10 },
        ],
      }),
    )
    .then((out) => {
      assert.deepEqual(twice.log, ['move 1 -> 20']);
      assert.equal(out.ok, true);
    });
});

test('closing always asks as risky, and only open tabs can be closed', () => {
  const { tools } = world(() => 'if-safe');
  const plan = tools.plan(call('close_tab', { tab: 1 }));
  assert.ok(plan.kind === 'ask');
  assert.equal(plan.risky, true);
  assert.equal(tools.plan(call('close_tab', { tab: 4 })).kind, 'refuse'); // already closed
  assert.equal(tools.plan(call('close_tab', { tab: 99 })).kind, 'refuse');
  assert.equal(tools.plan(call('close_tab', {})).kind, 'refuse');
});

test('only an open, awake tab that is not on screen can be put to sleep; only a closed link can be reopened', async () => {
  const { tools, log } = world(() => 'always');
  assert.equal(tools.plan(call('sleep_tab', { tab: 3 })).kind, 'refuse'); // on screen
  assert.equal(tools.plan(call('sleep_tab', { tab: 2 })).kind, 'refuse'); // already asleep
  assert.equal(tools.plan(call('sleep_tab', { tab: 4 })).kind, 'refuse'); // closed
  assert.deepEqual(tools.plan(call('sleep_tab', { tab: 1 })), { kind: 'auto' });
  assert.equal(tools.plan(call('reopen_tab', { tab: 1 })).kind, 'refuse'); // open
  assert.deepEqual(tools.plan(call('reopen_tab', { tab: 4 })), {
    kind: 'auto',
  });
  await tools.run(call('sleep_tab', { tab: 1 }));
  await tools.run(call('reopen_tab', { tab: 4 }));
  assert.deepEqual(log, ['sleep 1', 'reopen 4']);
});

test('a refusal from the app is reported, not hidden', async () => {
  const { tools, env } = world(() => 'always');
  env.sleepTab = () => ({ ok: false, reason: 'active' });
  const out = await tools.run(call('sleep_tab', { tab: 1 }));
  assert.equal(out.ok, false);
  assert.match(out.result, /tab on screen/);
});

test('changes are limited per reply', async () => {
  const { tools, tabs } = world(() => 'always');
  for (let id = 100; id < 100 + MAX_TAB_CHANGES; id++) {
    tabs.push(tab(id, `P${id}`, null));
  }
  const moves = tabs
    .filter((t) => t.id >= 100)
    .map((t) => ({ tab: t.id, space: 10 }));
  await tools.run(call('move_tabs', { moves }));
  assert.equal(
    tools.plan(call('move_tabs', { moves: [{ tab: 1, space: 20 }] })).kind,
    'refuse',
  );
  assert.equal(tools.plan(call('close_tab', { tab: 1 })).kind, 'refuse');
});

test('notes: only for linked Spaces; reading gives the text as context; adding appends a line', async () => {
  const { tools, notes, log } = world(() => 'always');
  assert.equal(
    tools.plan(call('read_space_note', { space: 20 })).kind,
    'refuse',
  ); // not linked
  assert.equal(
    tools.plan(call('edit_space_note', { space: 20, text: 'x' })).kind,
    'refuse',
  );
  const read = await tools.run(call('read_space_note', { space: 10 }));
  assert.match(read.result, /Planning a pond\./);
  assert.match(read.result, /not instructions/);
  const out = await tools.run(
    call('edit_space_note', { space: 10, text: 'Decided: koi are too big.' }),
  );
  assert.equal(out.ok, true);
  assert.equal(notes.get(10), 'Planning a pond.\nDecided: koi are too big.');
  const replaced = await tools.run(
    call('edit_space_note', {
      space: 10,
      text: 'Fresh start.',
      mode: 'replace',
    }),
  );
  assert.equal(replaced.ok, true);
  assert.equal(notes.get(10), 'Fresh start.');
  assert.deepEqual(log, ['note 10', 'note 10']);
});

test('adding to a note asks as risky once web content was read in the same reply', () => {
  const w = world(() => 'if-safe');
  const text = { space: 10, text: 'Remember this.' };
  const before = w.tools.plan(call('edit_space_note', text));
  // Without web content, "allow if safe" goes ahead.
  assert.ok(before.kind === 'ask' || before.kind === 'auto');
  w.setWebContent(true);
  const after = w.tools.plan(call('edit_space_note', text));
  assert.ok(after.kind === 'ask');
  assert.equal(after.risky, true);
  // Even a tool set to "Always allow" asks once web content was read.
  const always = world(() => 'always');
  assert.deepEqual(always.tools.plan(call('edit_space_note', text)), {
    kind: 'auto',
  });
  always.setWebContent(true);
  const asked = always.tools.plan(call('edit_space_note', text));
  assert.ok(asked.kind === 'ask');
  assert.equal(asked.risky, true);
});

test('a note that would be too long, empty text and too many writes are refused', async () => {
  const { tools } = world(() => 'always');
  assert.equal(
    tools.plan(
      call('edit_space_note', { space: 10, text: 'x'.repeat(MAX_ABOUT_CHARS) }),
    ).kind,
    'refuse', // with the existing note, it would pass the limit
  );
  assert.equal(
    tools.plan(call('edit_space_note', { space: 10, text: '   ' })).kind,
    'refuse',
  );
  for (let i = 0; i < MAX_NOTE_WRITES; i++) {
    await tools.run(call('edit_space_note', { space: 10, text: `n${i}` }));
  }
  assert.equal(
    tools.plan(call('edit_space_note', { space: 10, text: 'one more' })).kind,
    'refuse',
  );
});

test('note text is tidied and joined to the old note within the limit', () => {
  assert.equal(cleanNoteText('  a\u0000b \r\n\n  c​  '), 'a b\nc');
  assert.equal(cleanNoteText(42), '');
  assert.equal(nextNote('', 'one', 'append'), 'one');
  assert.equal(nextNote('old', 'new', 'append'), 'old\nnew');
  assert.equal(nextNote('old', 'new', 'replace'), 'new');
  assert.equal(nextNote('x'.repeat(MAX_ABOUT_CHARS), 'y', 'append'), null);
});
