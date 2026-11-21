import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSiteChoice, siteMenuItems } from './menuData.ts';
import type { MenuEntry, MenuItem } from './menuTypes.ts';

const base = { host: 'shop.example', secure: true, canAsk: true, answers: {} };
const entries = (items: MenuItem[]) =>
  items.filter((i): i is MenuEntry => i.type === 'item');

test('the site panel has an Assistant row: ask first, trusted, blocked, with the current one checked', () => {
  for (const current of ['unknown', 'trusted', 'blocked'] as const) {
    const row = entries(siteMenuItems({ ...base, assistant: current })).find(
      (e) => e.id === 'site.assistant',
    );
    assert.ok(row?.submenu, current);
    const options = entries(row.submenu);
    assert.deepEqual(
      options.map((o) => o.label),
      ['Ask first', 'Trusted', 'Blocked'],
    );
    assert.deepEqual(
      options.filter((o) => o.checked).map((o) => o.id),
      [`site.assistant:${current}`],
    );
  }
});

test('the row is there for every kind of panel, and left out for a page that is not a website', () => {
  const has = (items: MenuItem[]) =>
    entries(items).some((e) => e.id === 'site.assistant');
  assert.ok(has(siteMenuItems({ ...base, assistant: 'unknown' })));
  // A site that cannot ask for permissions (not secure) still has the assistant row.
  assert.ok(
    has(
      siteMenuItems({
        ...base,
        canAsk: false,
        secure: false,
        assistant: 'trusted',
      }),
    ),
  );
  // With saved permissions.
  assert.ok(
    has(
      siteMenuItems({
        ...base,
        answers: { camera: 'allow' },
        assistant: 'blocked',
      }),
    ),
  );
  assert.ok(!has(siteMenuItems({ ...base })));
});

test('choosing a level in the panel is read back, and nothing else is accepted', () => {
  assert.deepEqual(parseSiteChoice('site.assistant:trusted'), {
    action: 'assistant',
    level: 'trusted',
  });
  assert.deepEqual(parseSiteChoice('site.assistant:unknown'), {
    action: 'assistant',
    level: 'unknown',
  });
  assert.deepEqual(parseSiteChoice('site.assistant:blocked'), {
    action: 'assistant',
    level: 'blocked',
  });
  for (const bad of [
    'site.assistant',
    'site.assistant:',
    'site.assistant:always',
    'site.assistant:trusted ',
    'x',
  ]) {
    assert.equal(parseSiteChoice(bad), null, bad);
  }
});
