import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addExtension,
  defaultExtensions,
  describePermissions,
  nextFolderKey,
  parseExtensions,
  parseManifest,
  removeExtension,
  resolveMessage,
  updateExtension,
} from './extensionList.ts';

const manifest = {
  manifest_version: 3,
  name: '  Page   Notes ',
  version: '1.2.3',
  permissions: ['storage', 'tabs', 'cookies'],
  host_permissions: ['https://*/*'],
  default_locale: 'en',
};

test('a manifest is read safely: only versions 2 and 3 with a name, and cleaned', () => {
  const parsed = parseManifest(manifest)!;
  assert.equal(parsed.name, '  Page   Notes '.slice(0, 200));
  assert.equal(parsed.manifestVersion, 3);
  assert.deepEqual(parsed.permissions, ['storage', 'tabs', 'cookies']);
  assert.deepEqual(parsed.hostPermissions, ['https://*/*']);
  assert.equal(parsed.defaultLocale, 'en');
  for (const bad of [
    null,
    5,
    'x',
    [],
    {},
    { manifest_version: 1, name: 'a' },
    { manifest_version: 3 },
    { manifest_version: 3, name: '  ' },
  ]) {
    assert.equal(parseManifest(bad), null, JSON.stringify(bad));
  }
  assert.equal(
    parseManifest({ manifest_version: 3, name: 'a', default_locale: '../x' })
      ?.defaultLocale,
    null,
  );
});

test('in version 2 the sites are among the permissions, and are separated out', () => {
  const parsed = parseManifest({
    manifest_version: 2,
    name: 'Old',
    permissions: ['tabs', '<all_urls>', 'http://a.com/*'],
  })!;
  assert.deepEqual(parsed.permissions, ['tabs']);
  assert.deepEqual(parsed.hostPermissions, ['<all_urls>', 'http://a.com/*']);
});

test("a name like __MSG_extName__ is looked up in the extension's messages", () => {
  const messages = { extName: { message: 'Bitwarden Password Manager' } };
  assert.equal(
    resolveMessage('__MSG_extName__', messages),
    'Bitwarden Password Manager',
  );
  assert.equal(
    resolveMessage('__MSG_EXTNAME__', messages),
    'Bitwarden Password Manager',
  );
  assert.equal(resolveMessage('__MSG_other__', messages), '__MSG_other__');
  assert.equal(resolveMessage('Plain name', messages), 'Plain name');
  assert.equal(resolveMessage('__MSG_extName__', null), '__MSG_extName__');
});

test('what an extension asks for is told in plain words', () => {
  assert.deepEqual(
    describePermissions({
      permissions: ['storage', 'tabs', 'cookies', 'nativeMessaging'],
      hostPermissions: ['https://*/*'],
    }),
    [
      'Read and change your data on all websites',
      'See the addresses and titles of your tabs',
      'Read and change cookies',
      'Talk to programs on your computer',
    ],
  );
  assert.deepEqual(
    describePermissions({
      permissions: [],
      hostPermissions: ['https://a.com/*', 'https://www.b.org/x'],
    }),
    ['Read and change your data on a.com, www.b.org'],
  );
  assert.deepEqual(
    describePermissions({ permissions: ['storage'], hostPermissions: [] }),
    [],
  );
  assert.equal(
    describePermissions({
      permissions: [],
      hostPermissions: ['<all_urls>'],
    })[0],
    'Read and change your data on all websites',
  );
});

test('adding, switching off and removing an extension', () => {
  let state = defaultExtensions();
  assert.equal(nextFolderKey(state), 'ext-1');
  const added = addExtension(state, parseManifest(manifest)!, 100)!;
  state = added.state;
  assert.equal(added.key, 'ext-1');
  assert.equal(nextFolderKey(state), 'ext-2');
  assert.equal(state.items[0].enabled, true);
  state = updateExtension(state, 'ext-1', {
    enabled: false,
    id: 'a'.repeat(32).replace(/a/g, 'b'),
  });
  assert.equal(state.items[0].enabled, false);
  assert.equal(state.items[0].id, 'b'.repeat(32));
  assert.equal(updateExtension(state, 'ext-9', { enabled: true }), state);
  state = removeExtension(state, 'ext-1');
  assert.equal(state.items.length, 0);
  // A key is never reused, even after a removal.
  assert.equal(nextFolderKey(state), 'ext-2');
  assert.equal(removeExtension(state, 'ext-9'), state);
});

test('the list on disk is repaired, never trusted', () => {
  const parsed = parseExtensions({
    nextKey: 2,
    items: [
      {
        key: 'ext-5',
        id: 'p'.repeat(32),
        name: 'Good',
        version: '1',
        enabled: false,
        addedAt: 7,
        manifestVersion: 3,
        permissions: ['tabs'],
        hostPermissions: [],
      },
      { key: 'ext-5', name: 'Dupe', manifestVersion: 3 },
      { key: '../evil', name: 'Bad', manifestVersion: 3 },
      { key: 'ext-6', name: 'Odd version', manifestVersion: 9 },
      { key: 'ext-7', id: 'not an id', name: '', manifestVersion: 2 },
      5,
    ],
  });
  assert.deepEqual(
    parsed.items.map((e) => e.key),
    ['ext-5', 'ext-7'],
  );
  assert.equal(parsed.items[0].enabled, false);
  assert.equal(parsed.items[1].id, null);
  assert.equal(parsed.items[1].name, 'Extension');
  assert.equal(parsed.nextKey, 8);
  for (const junk of [null, 5, 'x', [], {}, { items: 3 }]) {
    assert.deepEqual(parseExtensions(junk), defaultExtensions());
  }
});
