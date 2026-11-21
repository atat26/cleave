import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cleanApiKey, createSecretStore, parseSecrets } from './secrets.ts';
import type { SecretCrypto } from './secrets.ts';

const KEY = 'sk-or-v1-abcdef0123456789abcdef0123456789';

// A stand-in for the real encryption: scrambles the bytes so the plain text is
// not visible in the output (it is NOT secure; it only makes the tests honest).
function fakeCrypto(available = true): SecretCrypto & { broken: boolean } {
  const state = { broken: false };
  return {
    get broken() {
      return state.broken;
    },
    set broken(value: boolean) {
      state.broken = value;
    },
    isAvailable: () => available,
    encrypt: (plain) =>
      Uint8Array.from(Buffer.from(plain, 'utf8'), (b) => b ^ 0x5a),
    decrypt: (data) => {
      if (state.broken) throw new Error('cannot decrypt');
      return Buffer.from(Uint8Array.from(data, (b) => b ^ 0x5a)).toString(
        'utf8',
      );
    },
  };
}

async function tempFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-browser-secrets-'));
  return { dir, file: path.join(dir, 'secrets.json') };
}

test('cleanApiKey trims, and accepts only plain printable keys', () => {
  assert.equal(cleanApiKey(`  ${KEY}\n`), KEY);
  for (const bad of [
    '',
    '   ',
    'short',
    'has space inside',
    'tab\tinside',
    'new\nline1234',
    'ünïcode-key-1234',
    'x'.repeat(513),
    5,
    null,
    undefined,
    {},
  ]) {
    assert.equal(cleanApiKey(bad), null, String(bad));
  }
});

test('a saved key is encrypted on disk and can be read back by the main process', async () => {
  const { dir, file } = await tempFile();
  const store = await createSecretStore(file, fakeCrypto());
  assert.equal(store.has('openrouter'), false);
  assert.deepEqual(await store.set('openrouter', KEY), { ok: true });
  assert.equal(store.has('openrouter'), true);
  assert.equal(store.get('openrouter'), KEY);

  // The file never contains the key, or the telltale "sk-or" start of it.
  const onDisk = await fs.readFile(file, 'utf8');
  assert.ok(!onDisk.includes(KEY));
  assert.ok(!onDisk.includes('sk-or'));
  assert.ok(!Buffer.from(onDisk).includes(Buffer.from(KEY)));

  // It survives a restart (a new store reading the same file).
  const again = await createSecretStore(file, fakeCrypto());
  assert.equal(again.get('openrouter'), KEY);
  await fs.rm(dir, { recursive: true });
});

test('with no encryption available nothing is saved, not even in plain text', async () => {
  const { dir, file } = await tempFile();
  const store = await createSecretStore(file, fakeCrypto(false));
  assert.equal(store.encryptionAvailable(), false);
  assert.deepEqual(await store.set('openrouter', KEY), {
    ok: false,
    reason: 'no-encryption',
  });
  assert.equal(store.has('openrouter'), false);
  assert.deepEqual(await fs.readdir(dir), []); // no file was written at all
  await fs.rm(dir, { recursive: true });
});

test('an unusable key is refused before anything is saved', async () => {
  const { dir, file } = await tempFile();
  const store = await createSecretStore(file, fakeCrypto());
  assert.deepEqual(await store.set('openrouter', 'nope'), {
    ok: false,
    reason: 'invalid',
  });
  assert.deepEqual(await store.set('openrouter', 12345), {
    ok: false,
    reason: 'invalid',
  });
  assert.deepEqual(await fs.readdir(dir), []);
  await fs.rm(dir, { recursive: true });
});

test('removing a key leaves nothing readable', async () => {
  const { dir, file } = await tempFile();
  const store = await createSecretStore(file, fakeCrypto());
  await store.set('openrouter', KEY);
  await store.remove('openrouter');
  assert.equal(store.has('openrouter'), false);
  assert.equal(store.get('openrouter'), null);
  assert.equal(
    (await createSecretStore(file, fakeCrypto())).has('openrouter'),
    false,
  );
  await fs.rm(dir, { recursive: true });
});

test('a key that can no longer be decrypted reads as "no key", never as an error', async () => {
  const { dir, file } = await tempFile();
  const crypto = fakeCrypto();
  const store = await createSecretStore(file, crypto);
  await store.set('openrouter', KEY);
  crypto.broken = true; // e.g. the file was copied to another Windows account
  assert.equal(store.has('openrouter'), false);
  assert.equal(store.get('openrouter'), null);
  await fs.rm(dir, { recursive: true });
});

test('a failed save does not leave a secret behind in memory', async () => {
  const { dir, file } = await tempFile();
  const store = await createSecretStore(file, fakeCrypto());
  // Make saving impossible: a directory sits where the file goes, so the rename cannot work.
  await fs.mkdir(file);
  assert.deepEqual(await store.set('openrouter', KEY), {
    ok: false,
    reason: 'failed',
  });
  assert.equal(store.has('openrouter'), false);
  await fs.rm(dir, { recursive: true });
});

test('a tampered or corrupt secrets file is repaired or set aside', async () => {
  assert.deepEqual(parseSecrets(null), { version: 1, entries: {} });
  assert.deepEqual(
    parseSecrets({ entries: { openrouter: 'not base64!!' } }).entries,
    {},
  );
  assert.deepEqual(
    parseSecrets({ entries: { openrouter: 'QUJD', evil: 'QUJD' } }).entries,
    {
      openrouter: 'QUJD',
    },
  );
  assert.deepEqual(
    parseSecrets({ entries: { openrouter: 'A'.repeat(9000) } }).entries,
    {},
  );

  const { dir, file } = await tempFile();
  await fs.writeFile(file, '{ not json', 'utf8');
  const store = await createSecretStore(file, fakeCrypto());
  assert.equal(store.has('openrouter'), false);
  assert.equal(await fs.readFile(`${file}.corrupt`, 'utf8'), '{ not json');
  await fs.rm(dir, { recursive: true });
});
