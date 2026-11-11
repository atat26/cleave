// Web search in the main process: the search provider choice, the key (stored
// encrypted, read back only here), and the search itself. The user interface can
// choose a provider, save or remove a key, test it, and ask "is it set up?", but
// can never see the key.
//
// Safety rules:
//   - Requests are only accepted from the window's own UI page, and everything
//     they send is checked.
//   - Network calls go to the provider's fixed address (see webSearch.ts); the UI
//     cannot choose a destination.
//   - Errors shown to the user are written by us; raw server text and keys never
//     appear in a result or a log.
import { app, ipcMain, net } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'node:path';
import { defaultSearchSettings, parseSearchSettings } from './searchSettings';
import type { SearchSettings } from './searchSettings';
import type { SecretName, SecretStore } from './secrets';
import { loadJson, saveJson } from './storage';
import type { SearchSaveResult, SearchStatus, SearchTestResult } from './types';
import {
  cleanQuery,
  isSearchProvider,
  SEARCH_PROVIDERS,
  searchBrave,
  SearchError,
  searchErrorMessage,
} from './webSearch';
import type { FetchLike, SearchResult } from './webSearch';

// Where each provider's key is kept.
const SECRET_FOR: Record<string, SecretName> = { brave: 'brave-search' };

const SAVE_ERRORS = {
  invalid:
    "That doesn't look like an API key. Paste the whole key, with no spaces.",
  'no-encryption':
    "Secure storage isn't available on this computer, so the key can't be saved safely.",
  failed: "Couldn't save the key. Try again.",
} as const;

const REQUEST_TIMEOUT_MS = 12_000;

// What the assistant's search tool needs from this file.
export interface SearchContext {
  // Is a provider chosen and its key saved?
  ready(): boolean;
  // Run a search. Throws a SearchError (with plain wording) on failure.
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
}

export async function registerSearch(
  win: BrowserWindow,
  secretsReady: Promise<SecretStore>,
): Promise<SearchContext> {
  const secrets = await secretsReady;
  const settingsFile = path.join(app.getPath('userData'), 'search.json');
  let settings: SearchSettings = await loadJson(
    settingsFile,
    parseSearchSettings,
    defaultSearchSettings,
  );

  // Electron's own network stack, so system proxy settings are respected.
  const fetchImpl: FetchLike = (url, init) => net.fetch(url, init);

  const secretName = () => SECRET_FOR[settings.provider];
  const hasKey = () => secrets.has(secretName());

  const status = (): SearchStatus => ({
    encryptionAvailable: secrets.encryptionAvailable(),
    providers: SEARCH_PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      site: p.site,
    })),
    provider: settings.provider,
    hasKey: hasKey(),
  });

  // Run a search with a time limit (and your Stop, if there is one).
  async function search(query: string, signal?: AbortSignal) {
    const key = secrets.get(secretName());
    if (key === null) throw new SearchError('no-key');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      return await searchBrave(key, query, fetchImpl, controller.signal);
    } catch (error) {
      if (error instanceof SearchError) throw error;
      // Aborted: by the time limit (timeout) or by Stop (let it pass).
      if (signal?.aborted) throw error;
      throw new SearchError('timeout');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  const fromUi = (event: Electron.IpcMainInvokeEvent) =>
    event.sender === win.webContents;

  ipcMain.handle('search:status', (event): SearchStatus => {
    if (!fromUi(event)) throw new Error('Not allowed.');
    return status();
  });

  ipcMain.handle(
    'search:set-provider',
    async (event, provider: unknown): Promise<SearchStatus> => {
      if (!fromUi(event)) throw new Error('Not allowed.');
      if (isSearchProvider(provider)) {
        settings = { ...settings, provider };
        await saveJson(settingsFile, settings);
      }
      return status();
    },
  );

  ipcMain.handle(
    'search:save-key',
    async (event, key: unknown): Promise<SearchSaveResult> => {
      if (!fromUi(event)) throw new Error('Not allowed.');
      const result = await secrets.set(secretName(), key);
      return result.ok
        ? { ok: true, status: status() }
        : { ok: false, error: SAVE_ERRORS[result.reason], status: status() };
    },
  );

  ipcMain.handle('search:remove-key', async (event): Promise<SearchStatus> => {
    if (!fromUi(event)) throw new Error('Not allowed.');
    await secrets.remove(secretName());
    return status();
  });

  // "Test": does the provider accept the saved key?
  ipcMain.handle('search:test', async (event): Promise<SearchTestResult> => {
    if (!fromUi(event)) throw new Error('Not allowed.');
    if (!hasKey()) return { ok: false, error: searchErrorMessage('no-key') };
    try {
      const results = await search(cleanQuery('test search') ?? 'test');
      return { ok: true, count: results.length };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof SearchError
            ? error.message
            : searchErrorMessage('unknown'),
      };
    }
  });

  return { ready: hasKey, search };
}
