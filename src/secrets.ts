// Storage for secrets such as API keys. A secret is encrypted before it touches
// the disk, so the file never holds the key itself. The encryption is passed in
// (the app uses Electron's safeStorage, which locks it to your Windows account),
// so this file has no Electron in it and can be tested with a stand-in.
//
// Rules this file keeps:
//   - If encryption is not available, a secret is NOT saved at all. There is no
//     fallback to plain text.
//   - The only way to read a secret back is `get`, meant for the app's main
//     process. Nothing here hands a secret to the user interface.
//   - A secret is never put in an error or a log message.
import { loadJson, saveJson } from './storage.ts';

export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Uint8Array;
  decrypt(data: Uint8Array): string;
}

export const SECRET_NAMES = ['openrouter'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

// What is saved: for each secret, its ENCRYPTED bytes as base64.
interface SecretsFile {
  version: 1;
  entries: Partial<Record<SecretName, string>>;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_CIPHERTEXT = 8192;

export function parseSecrets(raw: unknown): SecretsFile {
  const file: SecretsFile = { version: 1, entries: {} };
  if (typeof raw !== 'object' || raw === null) return file;
  const entries = (raw as { entries?: unknown }).entries;
  if (typeof entries !== 'object' || entries === null) return file;
  for (const name of SECRET_NAMES) {
    const value = (entries as Record<string, unknown>)[name];
    if (
      typeof value === 'string' &&
      value.length <= MAX_CIPHERTEXT &&
      BASE64.test(value)
    ) {
      file.entries[name] = value;
    }
  }
  return file;
}

// A tidy API key, or null if what was typed is not usable. Keys are plain
// printable characters with no spaces; stray spaces or a pasted newline at either
// end are removed.
export function cleanApiKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return /^[\x21-\x7e]{8,512}$/.test(key) ? key : null;
}

export type SetResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'no-encryption' | 'failed' };

export interface SecretStore {
  // Can secrets be saved on this computer?
  encryptionAvailable(): boolean;
  // Is there a saved secret that can be read back?
  has(name: SecretName): boolean;
  // The secret itself, for the main process only. Null if there is none or it
  // can no longer be decrypted (for example after moving to another account).
  get(name: SecretName): string | null;
  set(name: SecretName, value: unknown): Promise<SetResult>;
  remove(name: SecretName): Promise<void>;
}

export async function createSecretStore(
  file: string,
  crypto: SecretCrypto,
): Promise<SecretStore> {
  let data = await loadJson<SecretsFile>(file, parseSecrets, () =>
    parseSecrets(null),
  );

  const read = (name: SecretName): string | null => {
    const stored = data.entries[name];
    if (stored === undefined || !crypto.isAvailable()) return null;
    try {
      return crypto.decrypt(new Uint8Array(Buffer.from(stored, 'base64')));
    } catch {
      return null;
    }
  };

  return {
    encryptionAvailable: () => crypto.isAvailable(),
    has: (name) => read(name) !== null,
    get: read,

    async set(name, value) {
      const key = cleanApiKey(value);
      if (key === null) return { ok: false, reason: 'invalid' };
      if (!crypto.isAvailable()) return { ok: false, reason: 'no-encryption' };
      const previous = data;
      try {
        const encrypted = Buffer.from(crypto.encrypt(key)).toString('base64');
        data = { ...data, entries: { ...data.entries, [name]: encrypted } };
        await saveJson(file, data);
        return { ok: true };
      } catch {
        data = previous; // Do not keep a secret that could not be saved.
        return { ok: false, reason: 'failed' };
      }
    },

    async remove(name) {
      const { [name]: _removed, ...rest } = data.entries;
      data = { ...data, entries: rest };
      await saveJson(file, data);
    },
  };
}
