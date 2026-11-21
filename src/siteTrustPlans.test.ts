import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planAction, typedText } from './agentActions.ts';
import type { ActionContext, Plan } from './agentActions.ts';
import { cleanCard } from './approvalCard.ts';
import type { OutlineElement } from './pageOutline.ts';
import { applyPolicy } from './toolPolicy.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

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
  control(3, 'textbox', 'Message'),
  control(4, 'link', 'Friends', { url: 'https://friends.example/x' }),
  control(5, 'link', 'Bank', { url: 'https://bank.example/login' }),
  control(6, 'button', 'Place order'),
  control(7, 'link', 'Same site', { url: 'https://shop.example/plans' }),
];

type Sites = Record<string, 'trusted' | 'blocked'>;

const context = (
  sites: Sites = {},
  tab = 'https://shop.example/a',
): ActionContext => ({
  linkedTabs: () => [{ id: 1, title: 'Shop', url: tab, spaceId: null }],
  tabUrl: (id) => (id === 1 ? tab : null),
  controls: (id) => (id === 1 ? CONTROLS : undefined),
  actionsDone: () => 0,
  tabsOpened: () => 0,
  siteTrust: (host) => sites[host] ?? 'unknown',
});

const plan = (
  name: string,
  args: Record<string, unknown>,
  sites: Sites = {},
  tab?: string,
): Plan =>
  planAction(
    { id: 'c', name, arguments: JSON.stringify(args) },
    context(sites, tab),
  );

const asked = (p: Plan) => {
  assert.ok(p.kind === 'ask', `expected a question, got ${p.kind}`);
  return p;
};

const TRUSTED: Sites = { 'shop.example': 'trusted' };
const LEVELS: ApprovalLevel[] = ['always', 'if-safe', 'ask'];

test('on a trusted site an action that is not risky goes ahead at every level, even "ask"', () => {
  for (const [name, args] of [
    ['click', { tab: 1, element: 1 }],
    ['type_text', { tab: 1, element: 2, text: 'hello' }],
    ['fill_fields', { tab: 1, fields: [{ element: 2, text: 'a' }] }],
    ['press_key', { tab: 1, key: 'Tab' }],
    ['go_back', { tab: 1 }],
    ['go_to', { tab: 1, url: 'https://shop.example/cart' }],
  ] as const) {
    const p = asked(plan(name, args, TRUSTED));
    assert.equal(p.trust, 'trusted', name);
    // No offer to trust a site that is already trusted.
    assert.equal(p.card?.site, undefined, name);
    for (const level of LEVELS) {
      assert.equal(
        applyPolicy(p, level, 'x').kind,
        'auto',
        `${name} at ${level}`,
      );
    }
    // "Never" still means never.
    assert.equal(applyPolicy(p, 'never', 'x').kind, 'refuse', name);
  }
});

test('a trusted site keeps the things that cannot be undone asking', () => {
  const buy = asked(plan('click', { tab: 1, element: 6 }, TRUSTED));
  assert.equal(buy.risky, true);
  // (An explicit "Always allow" for the tool is your own standing choice, as before; trust does not
  // change that, it only does not add to it.)
  for (const level of ['if-safe', 'ask'] as const) {
    assert.equal(applyPolicy(buy, level, 'x'), buy);
  }
  const enter = asked(plan('press_key', { tab: 1, key: 'Enter' }, TRUSTED));
  assert.equal(enter.risky, true);
  assert.equal(applyPolicy(enter, 'if-safe', 'x'), enter);
});

test('on a site not decided about, standing settings stop at "ask"', () => {
  for (const [name, args] of [
    ['click', { tab: 1, element: 1 }],
    ['type_text', { tab: 1, element: 2, text: 'hello' }],
    ['go_to', { tab: 1, url: 'https://shop.example/cart' }],
    ['press_key', { tab: 1, key: 'Tab' }],
  ] as const) {
    const p = asked(plan(name, args));
    assert.equal(p.trust, 'unknown', name);
    assert.equal(p.card?.site, 'shop.example', name);
    for (const level of LEVELS) {
      // The card stays; it is the same plan, so "Always" and "Allow if safe" no longer skip it.
      assert.equal(applyPolicy(p, level, 'x'), p, `${name} at ${level}`);
    }
    assert.equal(applyPolicy(p, 'never', 'x').kind, 'refuse', name);
  }
});

test('"Allow the rest of this reply" still applies to such a card: it is not risky and not "always"', () => {
  // The runner skips a card when it is not risky and not marked "always" (see chatRunner.ts).
  const p = asked(plan('type_text', { tab: 1, element: 2, text: 'hello' }));
  assert.equal(p.risky, false);
  assert.equal(p.always, undefined);
  // Going to another website stays risky, and so does not skip.
  const away = asked(plan('go_to', { tab: 1, url: 'https://other.example/' }));
  assert.equal(away.risky, true);
});

test('actions with nothing to ask about are not touched', () => {
  assert.deepEqual(plan('scroll', { tab: 1, direction: 'down' }), {
    kind: 'auto',
  });
  assert.deepEqual(applyPolicy({ kind: 'auto' }, 'always', 'x'), {
    kind: 'auto',
  });
});

test('going to another site: trusted is not "a different website", unknown still is', () => {
  const sites: Sites = { 'docs.example': 'trusted' };
  const toTrusted = asked(
    plan('go_to', { tab: 1, url: 'https://docs.example/a' }, sites),
  );
  assert.equal(toTrusted.risky, false);
  assert.equal(toTrusted.trust, 'trusted');
  assert.equal(applyPolicy(toTrusted, 'ask', 'x').kind, 'auto');

  const toUnknown = asked(
    plan('go_to', { tab: 1, url: 'https://news.example/a?q=1' }, sites),
  );
  assert.equal(toUnknown.risky, true);
  // The card offers to trust the place it is going to.
  assert.equal(toUnknown.card?.site, 'news.example');

  // Leaving a trusted site for an unknown one is still a risky step.
  const fromTrusted = asked(
    plan('go_to', { tab: 1, url: 'https://news.example/' }, TRUSTED),
  );
  assert.equal(fromTrusted.risky, true);
});

test('opening a new tab at a trusted site is not a new place to go', () => {
  const sites: Sites = { 'docs.example': 'trusted' };
  const p = asked(plan('open_tab', { url: 'https://docs.example/a' }, sites));
  assert.equal(p.risky, false);
  assert.equal(p.trust, 'trusted');
  assert.equal(applyPolicy(p, 'ask', 'x').kind, 'auto');
  const fresh = asked(
    plan('open_tab', { url: 'https://news.example/' }, sites),
  );
  assert.equal(fresh.risky, true);
  assert.equal(fresh.card?.site, 'news.example');
});

test('a link to a trusted site is not "a different website"; a link to an unknown one is', () => {
  const link = (element: number, sites: Sites = {}) =>
    asked(plan('click', { tab: 1, element }, sites));
  assert.equal(link(4).risky, true);
  assert.equal(link(4, { 'friends.example': 'trusted' }).risky, false);
  assert.equal(link(7).risky, false);
});

test('a blocked site: nothing is done on it, opened at it, or reached from it', () => {
  const blockedTab: Sites = { 'shop.example': 'blocked' };
  for (const [name, args] of [
    ['click', { tab: 1, element: 1 }],
    ['type_text', { tab: 1, element: 2, text: 'x' }],
    ['fill_fields', { tab: 1, fields: [{ element: 2, text: 'x' }] }],
    ['press_key', { tab: 1, key: 'Tab' }],
    ['scroll', { tab: 1, direction: 'down' }],
    ['go_back', { tab: 1 }],
    ['go_to', { tab: 1, url: 'https://shop.example/x' }],
  ] as const) {
    const p = plan(name, args, blockedTab);
    assert.equal(p.kind, 'refuse', name);
    assert.match(p.kind === 'refuse' ? p.result : '', /blocked/, name);
  }
  const blockedDestination: Sites = { 'bank.example': 'blocked' };
  assert.equal(
    plan('go_to', { tab: 1, url: 'https://bank.example/' }, blockedDestination)
      .kind,
    'refuse',
  );
  assert.equal(
    plan('open_tab', { url: 'https://bank.example/' }, blockedDestination).kind,
    'refuse',
  );
  // A link to a blocked site is not clicked.
  assert.equal(
    plan('click', { tab: 1, element: 5 }, blockedDestination).kind,
    'refuse',
  );
  // Other sites are unaffected.
  assert.equal(
    plan('click', { tab: 1, element: 1 }, blockedDestination).kind,
    'ask',
  );
});

test('trust is by exact site: a look-alike or a sibling is not trusted', () => {
  const sites: Sites = { 'shop.example': 'trusted' };
  for (const tab of [
    'https://shop.example.evil.test/a',
    'https://www.shop.example/a',
    'https://shop.example:8443/a',
    'https://xshop.example/a',
  ]) {
    const p = asked(plan('click', { tab: 1, element: 1 }, sites, tab));
    assert.equal(p.trust, 'unknown', tab);
  }
});

test('typed text has nothing hidden in it, and the card shows it all', () => {
  const sneaky = `hello​ world\u{e0068}\u{e0069}‮!`;
  assert.equal(typedText(sneaky), 'hello world!');
  const p = asked(plan('type_text', { tab: 1, element: 2, text: sneaky }));
  assert.equal(p.card?.text?.value, 'hello world!');

  const long = 'a'.repeat(1000);
  const full = asked(plan('type_text', { tab: 1, element: 2, text: long }));
  // The question line is short; the box shows every character that will be typed.
  assert.equal(full.card?.text?.value, long);
  assert.ok(full.text.length < 300);
  assert.equal(typedText(5), null);
  // The card text survives being saved and read back.
  assert.equal(cleanCard(full.card)?.text?.value, long);
});

test('a form card lists every field in full', () => {
  const one = 'x'.repeat(900);
  const p = asked(
    plan('fill_fields', {
      tab: 1,
      fields: [
        { element: 2, text: one },
        { element: 3, text: 'line one\nline two​' },
      ],
    }),
  );
  assert.equal(p.card?.list?.[0], `Email: ${one}`);
  assert.equal(p.card?.list?.[1], 'Message: line one ↵ line two');
  const saved = cleanCard(p.card);
  assert.equal(saved?.list?.[0], `Email: ${one}`);
});

test('an address is shown in full, up to the longest the assistant may use', () => {
  const address = `https://shop.example/search?q=${'z'.repeat(1700)}`;
  const p = asked(plan('go_to', { tab: 1, url: address }));
  assert.equal(p.card?.destination, address);
  assert.equal(cleanCard(p.card)?.destination, address);
  const opened = asked(plan('open_tab', { url: address }));
  assert.equal(opened.card?.destination, address);
});

test('a card only keeps a real site name', () => {
  assert.equal(cleanCard({ site: 'www.example.com' })?.site, 'www.example.com');
  assert.equal(cleanCard({ site: 'localhost:3000' })?.site, 'localhost:3000');
  for (const bad of [
    'Example.com',
    'https://example.com',
    'a b',
    '*.example.com',
    '',
    5,
    null,
  ]) {
    assert.equal(
      cleanCard({ site: bad, list: ['x'] })?.site,
      undefined,
      String(bad),
    );
  }
});
