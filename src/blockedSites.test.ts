import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withoutBlockedSites } from './agentTools.ts';
import type { AgentEnv } from './agentTools.ts';

const tab = (id: number, url: string) => ({
  id,
  title: `Tab ${id}`,
  url,
  spaceId: null,
  closed: false,
  asleep: false,
  active: false,
});

function env(sites: Record<string, 'trusted' | 'blocked'>) {
  const tabs = [
    tab(1, 'https://shop.example/a'),
    tab(2, 'https://bank.example/account'),
    tab(3, 'https://bank.example:8443/other'),
    tab(4, 'not an address'),
  ];
  const hits = [
    { title: 'Shop', url: 'https://shop.example/', at: 1 },
    { title: 'Bank', url: 'https://bank.example/login', at: 2 },
  ];
  return {
    siteTrust: (host: string) => sites[host] ?? 'unknown',
    linkedTabs: () => tabs,
    allTabs: () => tabs,
    searchHistory: () => hits,
    searchBookmarks: () => hits,
    other: 'kept',
  } as unknown as AgentEnv & { other: string };
}

test('what is on a blocked site is not seen: tabs, the list of all tabs, history and bookmarks', () => {
  const wrapped = withoutBlockedSites(
    env({ 'bank.example': 'blocked' }),
  ) as AgentEnv & { other: string };
  assert.deepEqual(
    wrapped.linkedTabs().map((t) => t.id),
    [1, 3, 4],
  );
  assert.deepEqual(
    wrapped.allTabs().map((t) => t.id),
    [1, 3, 4],
  );
  assert.deepEqual(
    wrapped.searchHistory('x', 5).map((h) => h.title),
    ['Shop'],
  );
  assert.deepEqual(
    wrapped.searchBookmarks('x', 5).map((h) => h.title),
    ['Shop'],
  );
  // Everything else about the environment is as it was.
  assert.equal(wrapped.other, 'kept');
});

test('a site is blocked exactly, with its port; an address that is not one is left alone', () => {
  const wrapped = withoutBlockedSites(env({ 'bank.example:8443': 'blocked' }));
  assert.deepEqual(
    wrapped.linkedTabs().map((t) => t.id),
    [1, 2, 4],
  );
});

test('nothing blocked, or no way to tell, changes nothing', () => {
  const plain = env({});
  assert.deepEqual(
    withoutBlockedSites(plain)
      .linkedTabs()
      .map((t) => t.id),
    [1, 2, 3, 4],
  );
  const noTrust = { ...plain, siteTrust: undefined } as unknown as AgentEnv;
  assert.equal(withoutBlockedSites(noTrust), noTrust);
  // A trusted site is not hidden.
  const trusted = withoutBlockedSites(env({ 'bank.example': 'trusted' }));
  assert.equal(trusted.linkedTabs().length, 4);
});
