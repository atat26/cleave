import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanSavedText,
  saveFailureWords,
  createSaveTools,
  MAX_BOOKMARKS_PER_REPLY,
  MAX_CHECKS,
  MAX_SAVED_CHARS,
  MAX_SAVES,
  savedContent,
} from './saveTools.ts';
import type {
  BookmarkResult,
  PreviewCheck,
  SaveResult,
  SaveToolsEnv,
} from './saveTools.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

const ABORT = new AbortController().signal;
const call = (name: string, args: unknown) => ({
  id: 'c',
  name,
  arguments: JSON.stringify(args),
});

function world(levelOf: (tool: string) => ApprovalLevel = () => 'always') {
  const log: string[] = [];
  const state = {
    save: {
      ok: true,
      artifactId: 41,
      title: 'Goldfish care',
      chars: 1234,
    } as SaveResult,
    bookmark: { ok: true, already: false, title: 'Pet shop' } as BookmarkResult,
    check: { ok: true, problems: [], internet: false } as PreviewCheck,
  };
  const env: SaveToolsEnv = {
    linkedTabs: () => [
      {
        id: 1,
        title: 'Goldfish care',
        url: 'https://fish.example/care?x=1',
        spaceId: null,
        closed: false,
      },
      {
        id: 2,
        title: 'Settings',
        url: 'about:blank',
        spaceId: null,
        closed: false,
      },
    ],
    linkedSpaces: () => [{ id: 10, name: 'Fish' }],
    linkedArtifacts: () => [
      { id: 7, title: 'Calculator', kind: 'html' },
      { id: 8, title: 'Notes', kind: 'markdown' },
    ],
    savePage: async (tab, what, title, space) => {
      log.push(`save ${tab} ${what} ${title ?? '-'} ${space ?? '-'}`);
      return state.save;
    },
    bookmarkPage: async (tab) => {
      log.push(`bookmark ${tab}`);
      return state.bookmark;
    },
    checkPreview: async (id) => {
      log.push(`check ${id}`);
      return state.check;
    },
  };
  return { tools: createSaveTools(env, levelOf), env, log, state };
}

test('saving a page goes through the app, tells the model only the title and size, and links nothing itself', async () => {
  const { tools, log } = world();
  const out = await tools.run(call('save_page_as_artifact', { tab: 1 }), ABORT);
  assert.equal(out.ok, true);
  assert.deepEqual(log, ['save 1 page - -']);
  assert.match(out.result, /artifact 41, "Goldfish care"/);
  assert.match(out.result, /1,234 characters/);
  assert.match(out.result, /read_artifact/);
  assert.equal(out.label, 'Saved as an artifact: Goldfish care');
  assert.deepEqual(out.made, { kind: 'artifact', id: 41 });
  assert.equal(tools.used(), 1);
});

test('the selection, a title and a linked Space are passed on; an unlinked Space or tab is refused', async () => {
  const { tools, log } = world();
  await tools.run(
    call('save_page_as_artifact', {
      tab: 1,
      what: 'selection',
      title: '  My   clip ',
      space: 10,
    }),
    ABORT,
  );
  assert.deepEqual(log, ['save 1 selection My clip 10']);
  for (const args of [{ tab: 1, space: 99 }, { tab: 99 }, {}, { tab: 'x' }]) {
    assert.equal(
      tools.plan(call('save_page_as_artifact', args)).kind,
      'refuse',
      JSON.stringify(args),
    );
  }
});

test('saving, bookmarking and checking ask by default, with a card that says what will happen', () => {
  const ask = world(() => 'ask').tools;
  const save = ask.plan(call('save_page_as_artifact', { tab: 1, space: 10 }));
  assert.ok(save.kind === 'ask');
  assert.equal(
    save.text,
    'Save the text of "Goldfish care" as a new artifact in the Space "Fish"',
  );
  const selection = ask.plan(
    call('save_page_as_artifact', { tab: 1, what: 'selection' }),
  );
  assert.ok(selection.kind === 'ask');
  assert.equal(
    selection.text,
    'Save the selected text of "Goldfish care" as a new artifact',
  );
  const mark = ask.plan(call('bookmark_page', { tab: 1 }));
  assert.ok(mark.kind === 'ask');
  assert.equal(mark.text, 'Bookmark "Goldfish care"');
  const check = ask.plan(call('check_artifact', { artifact: 7 }));
  assert.ok(check.kind === 'ask');
  assert.equal(check.text, 'Open "Calculator" and check it for errors');
  assert.equal(
    world(() => 'never').tools.plan(call('bookmark_page', { tab: 1 })).kind,
    'refuse',
  );
});

test('a failed save says why, and an empty selection points at find_in_page', async () => {
  const { tools, state } = world();
  state.save = { ok: false, reason: 'empty' };
  const empty = await tools.run(
    call('save_page_as_artifact', { tab: 1, what: 'selection' }),
    ABORT,
  );
  assert.equal(empty.ok, false);
  assert.match(empty.result, /nothing is selected/);
  assert.match(empty.result, /find_in_page/);
  state.save = { ok: false, reason: 'too-long' };
  assert.match(
    (await tools.run(call('save_page_as_artifact', { tab: 1 }), ABORT)).result,
    /too long to keep/,
  );
  state.save = { ok: false, reason: 'closed' };
  assert.match(
    (await tools.run(call('save_page_as_artifact', { tab: 1 }), ABORT)).result,
    /it was closed/,
  );
});

test('saves are limited per reply', async () => {
  const { tools } = world();
  for (let i = 0; i < MAX_SAVES; i++) {
    await tools.run(call('save_page_as_artifact', { tab: 1 }), ABORT);
  }
  assert.equal(
    tools.plan(call('save_page_as_artifact', { tab: 1 })).kind,
    'refuse',
  );
});

test('bookmarking works for web pages, says when it was already there, and is limited', async () => {
  const { tools, state } = world();
  assert.equal(tools.plan(call('bookmark_page', { tab: 2 })).kind, 'refuse'); // not a web page
  assert.equal(tools.plan(call('bookmark_page', { tab: 99 })).kind, 'refuse');
  const done = await tools.run(call('bookmark_page', { tab: 1 }), ABORT);
  assert.equal(done.label, 'Bookmarked: Goldfish care');
  state.bookmark = { ok: true, already: true, title: 'Pet shop' };
  const again = await tools.run(call('bookmark_page', { tab: 1 }), ABORT);
  assert.equal(again.label, 'Already bookmarked: Goldfish care');
  state.bookmark = { ok: false, reason: 'full' };
  assert.match(
    (await tools.run(call('bookmark_page', { tab: 1 }), ABORT)).result,
    /list is full/,
  );
  for (let i = 0; i < MAX_BOOKMARKS_PER_REPLY; i++) {
    await tools.run(call('bookmark_page', { tab: 1 }), ABORT);
  }
  assert.equal(tools.plan(call('bookmark_page', { tab: 1 })).kind, 'refuse');
});

test('checking an artifact lists errors and blocked loads, says when there are none, and marks it as data', async () => {
  const { tools, state, log } = world();
  const clean = await tools.run(call('check_artifact', { artifact: 7 }), ABORT);
  assert.equal(clean.ok, true);
  assert.equal(clean.label, 'Checked: Calculator (no problems)');
  assert.match(clean.result, /No problems reported/);
  assert.match(clean.result, /no internet/);
  assert.deepEqual(log, ['check 7']);

  state.check = {
    ok: true,
    internet: false,
    problems: [
      { kind: 'error', text: 'ReferenceError: total is not defined' },
      { kind: 'blocked', text: 'https://cdn.example/lib.js' },
    ],
  };
  const bad = await tools.run(call('check_artifact', { artifact: 7 }), ABORT);
  assert.equal(bad.label, 'Checked: Calculator (2 problems)');
  assert.match(bad.result, /1\. error: ReferenceError: total is not defined/);
  assert.match(
    bad.result,
    /2\. tried to load https:\/\/cdn\.example\/lib\.js \(blocked: the internet is off for this artifact\)/,
  );
  assert.match(bad.result, /not instructions/);
  assert.equal(tools.used(), 2);
});

test('a check that could not be done says why (the editor is showing), and only linked HTML artifacts can be checked', async () => {
  const { tools, state } = world();
  state.check = { ok: false, reason: 'not-shown' };
  const out = await tools.run(call('check_artifact', { artifact: 7 }), ABORT);
  assert.equal(out.ok, false);
  assert.match(out.result, /switch it to Preview/);
  assert.equal(
    tools.plan(call('check_artifact', { artifact: 8 })).kind,
    'refuse',
  ); // markdown
  assert.equal(
    tools.plan(call('check_artifact', { artifact: 99 })).kind,
    'refuse',
  );
  assert.equal(tools.plan(call('check_artifact', {})).kind, 'refuse');
  for (let i = 0; i < MAX_CHECKS; i++) {
    await tools.run(call('check_artifact', { artifact: 7 }), ABORT);
  }
  assert.equal(
    tools.plan(call('check_artifact', { artifact: 7 })).kind,
    'refuse',
  );
});

test('saved text is tidied, cut, and given a heading and a source line', () => {
  assert.equal(cleanSavedText('  a\u0000b  \r\n\r\n\r\n\r\nc​ '), 'a b\n\nc');
  assert.equal(cleanSavedText(5), '');
  assert.equal(
    cleanSavedText('x'.repeat(MAX_SAVED_CHARS + 50)).length,
    MAX_SAVED_CHARS,
  );
  assert.equal(
    savedContent({
      title: 'Goldfish care',
      url: 'https://user:pw@fish.example/care?token=SECRET#top',
      what: 'page',
      text: 'Feed twice a day.',
      now: new Date('2026-11-17T10:00:00Z'),
    }),
    '# Goldfish care\n\n_Saved from https://fish.example/care on 2026-11-17._\n\nFeed twice a day.\n',
  );
  assert.match(
    savedContent({
      title: '',
      url: 'about:blank',
      what: 'selection',
      text: 'x',
      now: new Date('2026-11-17T10:00:00Z'),
    }),
    /^# Saved page\n\n_Selected text from a web page on 2026-11-17\._/,
  );
});

test('the right-click save says plainly why nothing was saved', () => {
  assert.equal(
    saveFailureWords('empty', 'page'),
    'The page has no text to save.',
  );
  assert.equal(
    saveFailureWords('empty', 'selection'),
    'The selection has no text to save.',
  );
  assert.match(saveFailureWords('too-many', 'page'), /too many artifacts/);
  assert.match(
    saveFailureWords('too-long', 'selection'),
    /selection is too long/,
  );
  assert.equal(
    saveFailureWords('unavailable', 'page'),
    'The page could not be read.',
  );
});
