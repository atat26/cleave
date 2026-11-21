import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  WEB_STORE_ORIGIN,
  patchWebStoreOriginCheck,
} from './libraryPatches.ts';
import { EXTENSION_ID, isExtensionId } from './extensionId.ts';

// The library file the app is built from. If a library update changes it, this test (and the build)
// fails until src/libraryPatches.ts is brought up to date.
const LIBRARY_FILE =
  'node_modules/electron-chrome-web-store/dist/esm/browser/index.mjs';

test('the Web Store check is made exact in the real library code', () => {
  const original = readFileSync(LIBRARY_FILE, 'utf8');
  assert.ok(original.includes('senderOrigin.startsWith(WEBSTORE_URL)'));
  const patched = patchWebStoreOriginCheck(original);
  assert.ok(!patched.includes('senderOrigin.startsWith(WEBSTORE_URL)'));
  assert.ok(patched.includes('senderOrigin !== WEBSTORE_URL'));
  // Only that one check changed.
  assert.equal(
    patched,
    original.replace(
      '!senderOrigin || !senderOrigin.startsWith(WEBSTORE_URL)',
      '!senderOrigin || senderOrigin !== WEBSTORE_URL',
    ),
  );
  // And the address the library compares against is the real store's.
  assert.ok(patched.includes(`var WEBSTORE_URL = "${WEB_STORE_ORIGIN}";`));
});

test('the patch refuses to apply when the library code is not found, or found twice', () => {
  assert.throws(() => patchWebStoreOriginCheck('nothing to see'), /changed/);
  const check = '!senderOrigin || !senderOrigin.startsWith(WEBSTORE_URL)';
  assert.throws(
    () => patchWebStoreOriginCheck(`${check}\n${check}`),
    /found 2/,
  );
  assert.equal(
    patchWebStoreOriginCheck(`if (${check}) {}`),
    'if (!senderOrigin || senderOrigin !== WEBSTORE_URL) {}',
  );
});

test('an exact comparison accepts the store and no other address', () => {
  // What the patched check does, written out: the origin must be exactly the store's.
  const accepted = (origin: string | undefined) =>
    !(!origin || origin !== WEB_STORE_ORIGIN);
  assert.ok(accepted('https://chromewebstore.google.com'));
  for (const bad of [
    undefined,
    '',
    'https://chromewebstore.google.com.attacker.example',
    'https://chromewebstore.google.com:8443',
    'http://chromewebstore.google.com',
    'https://chromewebstore.google.com@attacker.example',
    'https://evilchromewebstore.google.com',
    'https://chromewebstore.google.com/',
  ]) {
    assert.ok(!accepted(bad), String(bad));
  }
});

test('an extension id is exactly 32 letters from a to p', () => {
  assert.ok(isExtensionId('a'.repeat(32)));
  assert.ok(isExtensionId('abcdefghijklmnopabcdefghijklmnop'));
  for (const bad of [
    '..',
    '.',
    '..\\..\\Documents',
    '../x',
    'a'.repeat(31),
    'a'.repeat(33),
    'q'.repeat(32),
    'A'.repeat(32),
    `${'a'.repeat(32)}\n`,
    `${'a'.repeat(32)}/`,
    '',
    null,
    undefined,
    42,
    {},
  ]) {
    assert.ok(!isExtensionId(bad), JSON.stringify(bad));
  }
  assert.ok(EXTENSION_ID.source.includes('{32}'));
});
