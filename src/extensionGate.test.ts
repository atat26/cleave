import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  KNOWN_CALLS,
  apiPermissions,
  checkCall,
  filterEvent,
  filterResult,
  hostPatterns,
  matchesHost,
} from './extensionGate.ts';
import { EXTENSION_GATE_GLOBAL, patchExtensionGate } from './libraryPatches.ts';

const ID = 'a'.repeat(32);
const manifest = (extra: Record<string, unknown> = {}) => ({
  name: 'x',
  version: '1',
  ...extra,
});
const allowed = (
  name: string,
  m: Record<string, unknown>,
  args: unknown[] = [],
) => {
  checkCall(name, m, args, ID);
};
const refused = (
  name: string,
  m: Record<string, unknown>,
  args: unknown[] = [],
) =>
  assert.throws(
    () => checkCall(name, m, args, ID),
    /not allowed|not supported/,
    name,
  );

test('website permissions: which addresses a pattern covers', () => {
  assert.ok(matchesHost('<all_urls>', 'https://a.example/x'));
  assert.ok(matchesHost('*://*/*', 'http://a.example/'));
  assert.ok(matchesHost('https://*.example.com/*', 'https://example.com/'));
  assert.ok(
    matchesHost('https://*.example.com/*', 'https://www.example.com/a?b=1'),
  );
  assert.ok(matchesHost('https://example.com/a/*', 'https://example.com/a/b'));
  assert.ok(
    !matchesHost('https://*.example.com/*', 'https://example.com.evil.test/'),
  );
  assert.ok(!matchesHost('https://*.example.com/*', 'https://notexample.com/'));
  assert.ok(!matchesHost('https://example.com/*', 'http://example.com/'));
  assert.ok(!matchesHost('https://example.com/a/*', 'https://example.com/b'));
  assert.ok(!matchesHost('*://example.com/*', 'wss://example.com/'));
  // Only web addresses ever match, even for "all urls".
  for (const address of [
    'file:///C:/x',
    'chrome://settings',
    'data:text/html,hi',
    'about:blank',
    'not a url',
  ]) {
    assert.ok(!matchesHost('<all_urls>', address), address);
    assert.ok(!matchesHost('*://*/*', address), address);
  }
  assert.ok(!matchesHost('garbage', 'https://a.example/'));
});

test('manifest 2 and 3 declare website permissions in different places', () => {
  const m3 = manifest({
    permissions: ['cookies'],
    host_permissions: ['https://a.example/*'],
  });
  const m2 = manifest({
    permissions: ['cookies', 'https://a.example/*', '<all_urls>'],
  });
  assert.deepEqual([...apiPermissions(m3)], ['cookies']);
  assert.deepEqual(hostPatterns(m3), ['https://a.example/*']);
  assert.deepEqual([...apiPermissions(m2)], ['cookies']);
  assert.deepEqual(hostPatterns(m2), ['https://a.example/*', '<all_urls>']);
  assert.deepEqual(hostPatterns(manifest()), []);
  assert.deepEqual([...apiPermissions(undefined)], []);
});

test('an extension with no permissions cannot use cookies, notifications, menus or navigation', () => {
  const none = manifest();
  for (const call of [
    'cookies.get',
    'cookies.getAll',
    'cookies.set',
    'cookies.remove',
    'cookies.getAllCookieStores',
    'notifications.create',
    'contextMenus.create',
    'webNavigation.getFrame',
    'webNavigation.getAllFrames',
  ]) {
    refused(call, none, [{ url: 'https://a.example/' }]);
  }
  refused('tabs.insertCSS', none, [1, { code: 'x' }]);
});

test('cookies need the permission and a website permission for the site', () => {
  const cookiesOnly = manifest({ permissions: ['cookies'] });
  refused('cookies.get', cookiesOnly, [
    { url: 'https://a.example/', name: 'n' },
  ]);
  refused('cookies.getAll', cookiesOnly, [{}]);

  const withHost = manifest({
    permissions: ['cookies'],
    host_permissions: ['https://a.example/*'],
  });
  allowed('cookies.get', withHost, [{ url: 'https://a.example/', name: 'n' }]);
  allowed('cookies.set', withHost, [
    { url: 'https://a.example/', name: 'n', value: 'v' },
  ]);
  allowed('cookies.remove', withHost, [
    { url: 'https://a.example/', name: 'n' },
  ]);
  allowed('cookies.getAll', withHost, [{}]);
  allowed('cookies.getAllCookieStores', withHost);
  // Another site, no url, or a url that is not a string.
  refused('cookies.get', withHost, [{ url: 'https://b.example/', name: 'n' }]);
  refused('cookies.get', withHost, [{ name: 'n' }]);
  refused('cookies.set', withHost, [{ url: 42 }]);
  refused('cookies.get', withHost, []);
  // A website permission alone is not enough.
  refused('cookies.get', manifest({ host_permissions: ['<all_urls>'] }), [
    { url: 'https://a.example/' },
  ]);
});

test('the cookie list is cut down to the sites the extension covers', () => {
  const m = manifest({
    permissions: ['cookies'],
    host_permissions: ['https://*.a.example/*'],
  });
  const cookies = [
    { name: '1', domain: '.a.example', path: '/', secure: true },
    { name: '2', domain: 'www.a.example', path: '/x', secure: true },
    { name: '3', domain: 'a.example', path: '/', secure: false },
    { name: '4', domain: '.b.example', path: '/', secure: true },
    { name: '5', domain: '.a.example.evil.test', path: '/', secure: true },
    { name: '6' },
  ];
  const kept = filterResult('cookies.getAll', m, [{}], cookies) as {
    name: string;
  }[];
  assert.deepEqual(
    kept.map((c) => c.name),
    ['1', '2'],
  );
  assert.deepEqual(filterResult('cookies.getAll', m, [{}], 'weird'), 'weird');
});

test('cookie changes are only sent to an extension that may see that cookie', () => {
  const m = manifest({
    permissions: ['cookies'],
    host_permissions: ['https://a.example/*'],
  });
  const change = (domain: string) => [
    {
      cookie: { name: 'n', value: 'v', domain, path: '/', secure: true },
      removed: false,
      cause: 'explicit',
    },
  ];
  assert.ok(filterEvent('cookies.onChanged', m, change('a.example')));
  assert.equal(filterEvent('cookies.onChanged', m, change('b.example')), null);
  assert.equal(
    filterEvent(
      'cookies.onChanged',
      manifest({ host_permissions: ['<all_urls>'] }),
      change('a.example'),
    ),
    null,
  );
  assert.equal(
    filterEvent('cookies.onChanged', manifest(), change('a.example')),
    null,
  );
  assert.equal(filterEvent('cookies.onChanged', m, []), null);
});

test('a tab shows its address, title and icon only to an extension that may see them', () => {
  const tab = {
    id: 7,
    active: true,
    url: 'https://a.example/p',
    title: 'T',
    favIconUrl: 'https://a.example/i.png',
    pendingUrl: 'https://a.example/q',
    windowId: 1,
  };
  const none = filterResult('tabs.query', manifest(), [{}], [tab]) as Record<
    string,
    unknown
  >[];
  assert.deepEqual(none, [{ id: 7, active: true, windowId: 1 }]);
  const withTabs = filterResult(
    'tabs.query',
    manifest({ permissions: ['tabs'] }),
    [{}],
    [tab],
  );
  assert.deepEqual(withTabs, [tab]);
  const withActive = filterResult(
    'tabs.get',
    manifest({ permissions: ['activeTab'] }),
    [7],
    tab,
  );
  assert.deepEqual(withActive, tab);
  // A website permission for that tab's address is enough, for that tab only.
  const host = manifest({ host_permissions: ['https://a.example/*'] });
  assert.deepEqual(filterResult('tabs.get', host, [7], tab), tab);
  const other = { ...tab, url: 'https://b.example/', pendingUrl: undefined };
  assert.deepEqual(filterResult('tabs.get', host, [8], other), {
    id: 7,
    active: true,
    windowId: 1,
  });
  // The input is never changed.
  assert.equal(tab.url, 'https://a.example/p');
});

test('windows show the same cut-down tabs inside them', () => {
  const win = {
    id: 1,
    focused: true,
    tabs: [{ id: 1, url: 'https://a.example/', title: 'T' }],
  };
  const out = filterResult(
    'windows.getAll',
    manifest(),
    [{ populate: true }],
    [win],
  ) as { tabs: unknown[] }[];
  assert.deepEqual(out[0].tabs, [{ id: 1 }]);
  assert.equal((out[0] as Record<string, unknown>).focused, true);
});

test('tab events lose the same details, and other events are not touched by the tab rules', () => {
  const m = manifest();
  const args = filterEvent('tabs.onUpdated', m, [
    7,
    { url: 'https://a.example/', title: 'T', status: 'complete' },
    { id: 7, url: 'https://a.example/', title: 'T' },
  ]);
  assert.deepEqual(args, [7, { status: 'complete' }, { id: 7 }]);
  assert.deepEqual(filterEvent('tabs.onRemoved', m, [7, { windowId: 1 }]), [
    7,
    { windowId: 1 },
  ]);
  assert.deepEqual(filterEvent('windows.onFocusChanged', m, [3]), [3]);
});

test('navigation needs its permission and a website permission for the address', () => {
  const m = manifest({
    permissions: ['webNavigation'],
    host_permissions: ['https://a.example/*'],
  });
  const event = (url: string) => [{ tabId: 1, url, frameId: 0 }];
  assert.ok(
    filterEvent('webNavigation.onCompleted', m, event('https://a.example/x')),
  );
  assert.equal(
    filterEvent('webNavigation.onCompleted', m, event('https://b.example/')),
    null,
  );
  assert.equal(
    filterEvent(
      'webNavigation.onCompleted',
      manifest({ host_permissions: ['<all_urls>'] }),
      event('https://a.example/'),
    ),
    null,
  );
  allowed('webNavigation.getFrame', m, [{ tabId: 1, frameId: 0 }]);
  const frames = filterResult(
    'webNavigation.getAllFrames',
    m,
    [{ tabId: 1 }],
    [
      { frameId: 0, url: 'https://a.example/' },
      { frameId: 1, url: 'https://b.example/' },
    ],
  );
  assert.deepEqual(frames, [
    { frameId: 0, url: 'https://a.example/' },
    { frameId: 1 },
  ]);
});

test("events of the extension's own interface and the others unknown are decided plainly", () => {
  const m = manifest();
  assert.deepEqual(filterEvent('browserAction.onClicked', m, [{ id: 1 }]), [
    { id: 1 },
  ]);
  assert.deepEqual(
    filterEvent('contextMenus.onClicked', m, [{ menuItemId: 'a' }, { id: 1 }]),
    [{ menuItemId: 'a' }, { id: 1 }],
  );
  assert.deepEqual(filterEvent('notifications.onClicked', m, ['id']), ['id']);
  // An event nobody has described is not sent.
  assert.equal(filterEvent('something.onNew', m, []), null);
});

test("tabs and windows can only be sent to web addresses or the extension's own pages", () => {
  const m = manifest();
  allowed('tabs.create', m, [{ url: 'https://a.example/' }]);
  allowed('tabs.create', m, [{ url: 'http://a.example/' }]);
  allowed('tabs.create', m, [{ url: `chrome-extension://${ID}/page.html` }]);
  allowed('tabs.create', m, [{}]);
  allowed('tabs.update', m, [3, { url: 'https://a.example/' }]);
  allowed('tabs.update', m, [{ url: 'https://a.example/' }]);
  allowed('windows.create', m, [
    { url: ['https://a.example/', 'https://b.example/'] },
  ]);
  for (const bad of [
    'file:///C:/Windows/win.ini',
    'data:text/html,<script>1</script>',
    'javascript:alert(1)',
    'chrome://settings',
    'chrome-extension://' + 'b'.repeat(32) + '/x.html',
    'ftp://a.example/',
    'not a url',
    42,
    null,
  ]) {
    refused('tabs.create', m, [{ url: bad }]);
    refused('tabs.update', m, [3, { url: bad }]);
    refused('windows.create', m, [{ url: bad }]);
    refused('windows.update', m, [3, { url: bad }]);
  }
  refused('windows.create', m, [{ url: ['https://a.example/', 'file:///x'] }]);
});

test('searching tabs by address or title needs the tabs permission', () => {
  allowed('tabs.query', manifest(), [{ active: true }]);
  refused('tabs.query', manifest(), [{ url: '*://*/*' }]);
  refused('tabs.query', manifest(), [{ title: 'bank' }]);
  allowed('tabs.query', manifest({ permissions: ['tabs'] }), [
    { url: '*://*/*' },
  ]);
});

test('changing a page needs a permission for every page, or activeTab', () => {
  refused(
    'tabs.insertCSS',
    manifest({ host_permissions: ['https://a.example/*'] }),
    [1, {}],
  );
  allowed('tabs.insertCSS', manifest({ host_permissions: ['<all_urls>'] }), [
    1,
    {},
  ]);
  allowed('tabs.insertCSS', manifest({ permissions: ['*://*/*'] }), [1, {}]);
  allowed('tabs.insertCSS', manifest({ permissions: ['activeTab'] }), [1, {}]);
});

test('menus, notifications and navigation work with their permission', () => {
  allowed('contextMenus.create', manifest({ permissions: ['contextMenus'] }), [
    {},
  ]);
  allowed(
    'notifications.create',
    manifest({ permissions: ['notifications'] }),
    ['id', {}],
  );
  allowed(
    'webNavigation.getFrame',
    manifest({ permissions: ['webNavigation'] }),
    [{}],
  );
  // Optional permissions are never granted.
  refused(
    'contextMenus.create',
    manifest({ optional_permissions: ['contextMenus'] }),
    [{}],
  );
});

test('a call nobody described is refused', () => {
  assert.throws(
    () =>
      checkCall('brandNew.api', manifest({ permissions: ['everything'] }), []),
    /not supported/,
  );
  assert.throws(() => checkCall('', manifest(), []), /not supported/);
});

test('every call the real library answers is described, so a library update cannot add one unseen', () => {
  const library = readFileSync(
    'node_modules/electron-chrome-extensions/dist/esm/index.mjs',
    'utf8',
  );
  // Every handle("name", ...) in the library, including ones written over several lines and the
  // template ones (browserAction.get${prop}). The two "crx-msg" names are message channels, not calls.
  const names = [
    ...new Set(
      [...library.matchAll(/\bhandle\(\s*(["`])([^"`]+)\1/g)]
        .map((m) => m[2])
        .filter((n) => !n.startsWith('crx-')),
    ),
  ];
  assert.ok(names.length > 40, 'the call list was read');
  // The toolbar button's calls (browserAction.*) are all open by rule.
  const decided = (n: string) =>
    KNOWN_CALLS.includes(n) || n.startsWith('browserAction.');
  const missing = names.filter((n) => !decided(n));
  assert.deepEqual(
    missing,
    [],
    `describe these in src/extensionGate.ts: ${missing.join(', ')}`,
  );
  // And the other way: nothing described that the library no longer has.
  const extra = KNOWN_CALLS.filter((n) => !names.includes(n));
  assert.deepEqual(extra, [], `no longer in the library: ${extra.join(', ')}`);
});

test('the toolbar button calls work for everyone, with or without an extension', () => {
  for (const call of [
    'browserAction.addObserver',
    'browserAction.removeObserver',
    'browserAction.getTitle',
    'browserAction.setBadgeText',
    'browserAction.setIcon',
    'browserAction.activate',
  ]) {
    checkCall(call, undefined, []);
    checkCall(call, manifest(), []);
  }
});

test('every event the real library sends is one the rules know', () => {
  const library = readFileSync(
    'node_modules/electron-chrome-extensions/dist/esm/index.mjs',
    'utf8',
  );
  const events = new Set(
    [...library.matchAll(/"([a-zA-Z]+\.on[A-Z][a-zA-Z]+)"/g)].map((m) => m[1]),
  );
  assert.ok(events.size >= 10);
  for (const name of events) {
    // Each must be decided on purpose: sent with some arguments, or held back.
    const sent = filterEvent(
      name,
      manifest({
        permissions: [
          'cookies',
          'webNavigation',
          'tabs',
          'notifications',
          'contextMenus',
        ],
        host_permissions: ['<all_urls>'],
      }),
      [
        {
          cookie: { domain: 'a.example', path: '/', secure: true },
          url: 'https://a.example/',
        },
      ],
    );
    assert.ok(
      sent !== null,
      `${name} is never delivered, even to an extension with every permission`,
    );
  }
});

test('the hooks are added to the real library, and refuse to be added to changed code', () => {
  const library = readFileSync(
    'node_modules/electron-chrome-extensions/dist/esm/index.mjs',
    'utf8',
  );
  const patched = patchExtensionGate(library);
  assert.ok(patched.includes(`globalThis.${EXTENSION_GATE_GLOBAL}`));
  assert.ok(patched.includes('__gate.before(handlerName'));
  assert.ok(patched.includes('...listenerArgs'));
  assert.ok(!patched.includes('listener.host.send(ipcName, ...args);'));
  assert.ok(!patched.includes('serviceWorker.send(ipcName, ...args);'));
  assert.throws(() => patchExtensionGate('nothing to see'), /changed/);
  assert.throws(() => patchExtensionGate(`${library}\n${library}`), /found 2/);
});
