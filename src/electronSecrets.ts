// Opens the app's secret store (API keys), encrypted with Electron's safeStorage,
// which ties it to the current Windows account. There is ONE store, shared by the
// AI connection and web search, because two copies of the same file would
// overwrite each other's changes.
import { app, safeStorage } from 'electron';
import path from 'node:path';
import { createSecretStore } from './secrets';
import type { SecretCrypto, SecretStore } from './secrets';

const electronCrypto: SecretCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(Buffer.from(data)),
};

export const openSecretStore = (): Promise<SecretStore> =>
  createSecretStore(
    path.join(app.getPath('userData'), 'secrets.json'),
    electronCrypto,
  );
