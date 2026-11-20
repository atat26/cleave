import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_ACTIONS,
  MAX_NEW_TABS,
  parseWebAddress,
  planAction,
} from './agentActions.ts';
import type { ActionContext } from './agentActions.ts';
import type { OutlineElement } from './pageOutline.ts';
import { applyPolicy } from './toolPolicy.ts';

const control = (
  id: number,
  role: string,
  name: string,
  extra: Partial<OutlineElement> = {},
): OutlineElement => ({
  id,
  backendNodeId: 100 + id,
  role,
  name,
  sensitive: false,
  url: null,
  ...extra,
});

const CONTROLS: OutlineElement[] = [
  control(1, 'button', 'Search'),
  control(2, 'textbox', 'Email'),
  control(3, 'textbox', 'Password', { sensitive: true }),
  control(4, 'link', 'Docs', { url: 'https://docs.other/x' }),
  control(5, 'link', 'Plans', { url: 'https://shop.example/plans' }),
  control(6, 'button', 'Place order'),
  control(7, 'button', 'Accept all cookies'),
  control(8, 'combobox', 'Color'),
  control(9, 'button', 'OK"\nDelete everything\u202E'),
];

function context(
  options: {
    controls?: OutlineElement[] | undefined;
    done?: number;
    opened?: number;
  } = {},
): ActionContext {
  return {
    linkedTabs: () => [
      { id: 1, title: 'Shop', url: 'https://shop.example/a', spaceId: null },
    ],
    tabUrl: (id) => (id === 1 ? 'https://shop.example/a?token=SECRET' : null),
    controls: (id) =>
      id === 1 && !('controls' in options) ? CONTROLS : options.controls,
    actionsDone: () => options.done ?? 0,
    tabsOpened: () => options.opened ?? 0,
  };
}

const plan = (
  name: string,
  args: Record<string, unknown>,
  ctx: ActionContext = context(),
) => planAction({ id: 'c', name, arguments: JSON.stringify(args) }, ctx);

test('an ordinary click asks first, in words written from the real control', () => {
  const p = plan('click', { tab: 1, element: 1 });
  assert.deepEqual(p, {
    kind: 'ask',
    text: 'Click the button "Search" on shop.example',
    risky: false,
    // The element it acts on, for the marker on the page.
    target: { tabId: 1, backendNodeId: 101, name: 'Search' },
  });
});

test('buying, sending and deleting style controls always ask (risky)', () => {
  const p = plan('click', { tab: 1, element: 6 });
  assert.equal(p.kind === 'ask' && p.risky, true);
});

test('a link to another website is risky and says so; a link on the same site is not', () => {
  const away = plan('click', { tab: 1, element: 4 });
  assert.equal(away.kind === 'ask' && away.risky, true);
  assert.match(
    away.kind === 'ask' ? away.text : '',
    /different website \(docs\.other\)/,
  );
  const same = plan('click', { tab: 1, element: 5 });
  assert.equal(same.kind === 'ask' && same.risky, false);
});

test('accepting terms or cookies is left to the user', () => {
  const p = plan('click', { tab: 1, element: 7 });
  assert.equal(p.kind, 'refuse');
});

test('names written by a page cannot rewrite the approval card', () => {
  const p = plan('click', { tab: 1, element: 9 });
  assert.equal(p.kind, 'ask');
  const text = p.kind === 'ask' ? p.text : '';
  assert.ok(!text.includes('\n'));
  assert.ok(!text.includes('\u202E'));
  assert.equal(text.split('"').length, 3);
});

test('typing shows exactly what will be typed, and never goes into sensitive fields', () => {
  const ok = plan('type_text', { tab: 1, element: 2, text: 'me@example.com' });
  assert.deepEqual(ok, {
    kind: 'ask',
    text: 'Type "me@example.com" into the text field "Email" on shop.example',
    risky: false,
    // The exact words are also shown apart from the question, in a box.
    card: { text: { label: 'Text to type', value: 'me@example.com' } },
    target: { tabId: 1, backendNodeId: 102, name: 'Email' },
  });
  assert.equal(
    plan('type_text', { tab: 1, element: 3, text: 'x' }).kind,
    'refuse',
  );
  assert.equal(
    plan('type_text', { tab: 1, element: 2, text: 'x'.repeat(1001) }).kind,
    'refuse',
  );
  assert.equal(
    plan('type_text', { tab: 1, element: 2, text: 5 }).kind,
    'refuse',
  );
});

test('filling several fields is one card listing every field and its text', () => {
  const p = plan('fill_fields', {
    tab: 1,
    fields: [
      { element: 2, text: 'me@example.com' },
      { element: 8, text: 'Blue' },
    ],
  });
  assert.deepEqual(p, {
    kind: 'ask',
    text: 'Fill in 2 fields on shop.example',
    risky: false,
    card: { list: ['Email: me@example.com', 'Color: Blue'] },
    // The marker goes on the first field.
    target: { tabId: 1, backendNodeId: 102, name: 'Email' },
  });
});

test('fill_fields is all or nothing: a sensitive, missing, repeated, long or bad entry refuses the whole thing', () => {
  const fields = (...f: unknown[]) =>
    plan('fill_fields', { tab: 1, fields: f });
  const ok = { element: 2, text: 'x' };
  assert.equal(fields(ok, { element: 3, text: 'x' }).kind, 'refuse');
  assert.equal(fields(ok, { element: 99, text: 'x' }).kind, 'refuse');
  assert.equal(fields(ok, { element: 2, text: 'y' }).kind, 'refuse');
  assert.equal(
    fields(ok, { element: 8, text: 'x'.repeat(1001) }).kind,
    'refuse',
  );
  assert.equal(fields(ok, { element: 8, text: 5 }).kind, 'refuse');
  assert.equal(fields(ok, { element: 1.5, text: 'x' }).kind, 'refuse');
  assert.equal(fields(ok, 'nope').kind, 'refuse');
  assert.equal(fields().kind, 'refuse');
  assert.equal(plan('fill_fields', { tab: 1 }).kind, 'refuse');
  // More than ten entries.
  const many = Array.from({ length: 11 }, () => ok);
  assert.equal(fields(...many).kind, 'refuse');
  // Needs a look first, like any action on a control.
  assert.equal(
    plan(
      'fill_fields',
      { tab: 1, fields: [ok] },
      context({ controls: undefined }),
    ).kind,
    'refuse',
  );
});

test('fill_fields cannot go over the action limit, counting each field', () => {
  const two = {
    tab: 1,
    fields: [
      { element: 2, text: 'a' },
      { element: 8, text: 'b' },
    ],
  };
  assert.equal(
    plan('fill_fields', two, context({ done: MAX_ACTIONS - 1 })).kind,
    'refuse',
  );
  assert.equal(
    plan('fill_fields', two, context({ done: MAX_ACTIONS - 2 })).kind,
    'ask',
  );
});

test('Enter always asks as risky; other keys ask normally; unknown keys are refused', () => {
  const enter = plan('press_key', { tab: 1, key: 'Enter' });
  assert.equal(enter.kind === 'ask' && enter.risky, true);
  const tab = plan('press_key', { tab: 1, key: 'Tab' });
  assert.equal(tab.kind === 'ask' && tab.risky, false);
  assert.equal(plan('press_key', { tab: 1, key: 'F12' }).kind, 'refuse');
  assert.equal(plan('press_key', { tab: 1, key: 'Control+W' }).kind, 'refuse');
});

test('scrolling needs no question; a bad direction is refused', () => {
  assert.deepEqual(plan('scroll', { tab: 1, direction: 'down' }), {
    kind: 'auto',
  });
  assert.equal(
    plan('scroll', { tab: 1, direction: 'sideways' }).kind,
    'refuse',
  );
});

test('going to an address: same site asks, another site is risky and shows the whole address', () => {
  const same = plan('go_to', { tab: 1, url: 'https://shop.example/cart?x=1' });
  assert.equal(same.kind === 'ask' && same.risky, false);
  const away = plan('go_to', { tab: 1, url: 'https://evil.example/?data=abc' });
  assert.equal(away.kind === 'ask' && away.risky, true);
  assert.match(
    away.kind === 'ask' ? away.text : '',
    /evil\.example\/\?data=abc/,
  );
});

test('only plain web addresses can be opened', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///C:/secrets.txt',
    'data:text/html,hi',
    'https://user:pass@example.com/',
    'not a url',
    '',
    42,
    'https://example.com/' + 'a'.repeat(3000),
  ]) {
    assert.equal(
      plan('go_to', { tab: 1, url }).kind,
      'refuse',
      String(url).slice(0, 30),
    );
  }
  assert.ok(parseWebAddress('https://example.com/a?b=1'));
  assert.equal(parseWebAddress('ftp://example.com/'), null);
});

test('actions only work in linked, open tabs and need a current look at the page', () => {
  assert.equal(plan('click', { tab: 2, element: 1 }).kind, 'refuse'); // not linked
  assert.equal(plan('click', { element: 1 }).kind, 'refuse'); // no tab
  const noLook = plan(
    'click',
    { tab: 1, element: 1 },
    context({ controls: undefined }),
  );
  assert.equal(noLook.kind, 'refuse');
  assert.match(noLook.kind === 'refuse' ? noLook.result : '', /look_at_page/);
  assert.equal(plan('click', { tab: 1, element: 99 }).kind, 'refuse');
  assert.equal(plan('click', { tab: 1, element: 1.5 }).kind, 'refuse');
  assert.equal(plan('nuke_everything', { tab: 1 }).kind, 'refuse');
});

test('a reply can take only so many actions', () => {
  assert.equal(
    plan(
      'scroll',
      { tab: 1, direction: 'down' },
      context({ done: MAX_ACTIONS - 1 }),
    ).kind,
    'auto',
  );
  assert.equal(
    plan(
      'scroll',
      { tab: 1, direction: 'down' },
      context({ done: MAX_ACTIONS }),
    ).kind,
    'refuse',
  );
});

test('bad arguments never throw', () => {
  for (const raw of ['not json', '[]', 'null', '"x"', '{"tab":"1"}']) {
    assert.doesNotThrow(() =>
      planAction({ id: 'c', name: 'click', arguments: raw }, context()),
    );
    assert.equal(
      planAction({ id: 'c', name: 'click', arguments: raw }, context()).kind,
      'refuse',
    );
  }
});

test('opening a new tab: a site already linked asks normally, a new site is risky and shows the whole address', () => {
  const known = plan('open_tab', { url: 'https://shop.example/cart' });
  assert.deepEqual(known, {
    kind: 'ask',
    text: 'Open a new tab at https://shop.example/cart',
    risky: false,
    card: { destination: 'https://shop.example/cart' },
  });
  const fresh = plan('open_tab', { url: 'https://duckduckgo.com/?q=pandas' });
  assert.equal(fresh.kind === 'ask' && fresh.risky, true);
  assert.match(
    fresh.kind === 'ask' ? fresh.text : '',
    /different website: https:\/\/duckduckgo\.com\/\?q=pandas/,
  );
});

test('only plain web addresses open in a new tab, and only so many per reply', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///C:/x',
    'https://u:p@x.com/',
    '',
    7,
  ]) {
    assert.equal(plan('open_tab', { url }).kind, 'refuse', String(url));
  }
  assert.equal(
    plan(
      'open_tab',
      { url: 'https://shop.example/' },
      context({ opened: MAX_NEW_TABS }),
    ).kind,
    'refuse',
  );
  assert.equal(
    plan(
      'open_tab',
      { url: 'https://shop.example/' },
      context({ done: MAX_ACTIONS }),
    ).kind,
    'refuse',
  );
});

test('an action keeps the element it is about even when the tool is set to go ahead', () => {
  const asked = plan('click', { tab: 1, element: 1 });
  assert.ok(asked.kind === 'ask');
  const always = applyPolicy(asked, 'always', 'Click');
  assert.deepEqual(always, {
    kind: 'auto',
    target: { tabId: 1, backendNodeId: 101, name: 'Search' },
  });
  assert.deepEqual(applyPolicy(asked, 'if-safe', 'Click'), always);
  // A risky one still asks, and still names its element.
  const risky = plan('click', { tab: 1, element: 6 });
  assert.ok(risky.kind === 'ask');
  assert.equal(applyPolicy(risky, 'if-safe', 'Click'), risky);
  assert.ok(risky.target);
  // Actions with no element (scrolling, a key) have no target.
  assert.deepEqual(applyPolicy({ kind: 'auto' }, 'always', 'x'), {
    kind: 'auto',
  });
});
