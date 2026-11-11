// The app's connection to the AI provider (OpenRouter), in the main process.
// This is the ONLY place an API key is read back and used. The user interface
// can save a key, remove it, and ask "is there one?", but can never see it.
//
// Safety rules:
//   - Requests are only accepted from the window's own UI page, and everything
//     they send is checked.
//   - Network calls go to the fixed OpenRouter address (see openrouter.ts); the
//     UI cannot choose a destination.
//   - Errors shown to the user are written by us (ChatError); raw server text and
//     keys never appear in a result or a log.
import { app, ipcMain, net, safeStorage } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'node:path';
import { ChatError, checkKey, isValidModelId, listModels } from './openrouter';
import type { FetchLike, ModelInfo } from './openrouter';
import {
  defaultProviderSettings,
  parseProviderSettings,
  withModel,
} from './providerSettings';
import { createSecretStore } from './secrets';
import type { SecretCrypto } from './secrets';
import { loadJson, saveJson } from './storage';
import type {
  LlmModelsResult,
  LlmResult,
  LlmStatus,
  LlmTestResult,
} from './types';

// Encryption tied to the current Windows account (Electron's safeStorage).
const electronCrypto: SecretCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(Buffer.from(data)),
};

const SAVE_ERRORS = {
  invalid:
    "That doesn't look like an API key. Paste the whole key, with no spaces.",
  'no-encryption':
    "Secure storage isn't available on this computer, so the key can't be saved safely.",
  failed: "Couldn't save the key. Try again.",
} as const;

const REQUEST_TIMEOUT_MS = 20_000;
const MODEL_CACHE_MS = 10 * 60_000;

// What to tell the user about a failure: only our own wording.
function describe(error: unknown): string {
  if (error instanceof ChatError) return error.message;
  if (error instanceof Error && error.name === 'AbortError') {
    return 'The request timed out. Try again.';
  }
  return 'Something went wrong. Try again.';
}

// Run a network call that gives up after a while.
async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function registerLlm(win: BrowserWindow): Promise<void> {
  const dir = app.getPath('userData');
  const secrets = await createSecretStore(
    path.join(dir, 'secrets.json'),
    electronCrypto,
  );
  const settingsFile = path.join(dir, 'llm.json');
  let settings = await loadJson(
    settingsFile,
    parseProviderSettings,
    defaultProviderSettings,
  );
  if (win.isDestroyed()) return;

  // Electron's own network stack, so system proxy settings are respected.
  const fetchImpl: FetchLike = (url, init) => net.fetch(url, init);

  const status = (): LlmStatus => ({
    encryptionAvailable: secrets.encryptionAvailable(),
    hasKey: secrets.has('openrouter'),
    model: settings.model,
  });

  let modelCache: { at: number; models: ModelInfo[] } | null = null;

  const handlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    'llm:status': async (): Promise<LlmStatus> => status(),

    'llm:save-key': async (key): Promise<LlmResult> => {
      const result = await secrets.set('openrouter', key);
      if (result.ok) {
        modelCache = null; // A different key may see a different model list.
        return { ok: true, status: status() };
      }
      return { ok: false, error: SAVE_ERRORS[result.reason], status: status() };
    },

    'llm:remove-key': async (): Promise<LlmStatus> => {
      await secrets.remove('openrouter');
      modelCache = null;
      return status();
    },

    // "Test connection": does OpenRouter accept the saved key?
    'llm:test': async (): Promise<LlmTestResult> => {
      const key = secrets.get('openrouter');
      if (key === null) return { ok: false, error: 'Add an API key first.' };
      try {
        const info = await withTimeout((signal) =>
          checkKey(key, fetchImpl, signal),
        );
        return { ok: true, ...info };
      } catch (error) {
        return { ok: false, error: describe(error) };
      }
    },

    // The model list (kept for a few minutes so the panel opens quickly).
    'llm:models': async (refresh): Promise<LlmModelsResult> => {
      const fresh =
        modelCache !== null && Date.now() - modelCache.at < MODEL_CACHE_MS;
      if (fresh && refresh !== true && modelCache) {
        return { ok: true, models: modelCache.models };
      }
      try {
        const models = await withTimeout((signal) =>
          listModels(secrets.get('openrouter'), fetchImpl, signal),
        );
        modelCache = { at: Date.now(), models };
        return { ok: true, models };
      } catch (error) {
        return { ok: false, error: describe(error) };
      }
    },

    'llm:set-model': async (model): Promise<LlmResult> => {
      if (model !== null && !isValidModelId(model)) {
        return {
          ok: false,
          error: 'That model name has characters that are not allowed.',
          status: status(),
        };
      }
      settings = withModel(settings, model);
      await saveJson(settingsFile, settings);
      return { ok: true, status: status() };
    },
  };

  for (const [channel, handle] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      // Only the window's own UI page may ask.
      if (event.sender !== win.webContents) throw new Error('Not allowed.');
      return handle(...args);
    });
  }
  win.on('closed', () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
  });
}
