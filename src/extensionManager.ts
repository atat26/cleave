// Browser extensions, in the main process: the part that talks to Electron. The rules
// (the list, reading a manifest, the permission words) are pure code in
// extensionList.ts. This file adds an extension from a folder (copying it into the
// app's own data folder), loads the enabled ones at every start (Electron forgets
// them between runs), and lets the helper library (electron-chrome-extensions) know
// about the tabs, so extensions that use the tabs API work.
//
// Safety:
//   - An extension only ever comes from a folder you pick, and you are shown what it
//     asks for and must say yes first.
//   - The folder is copied (not linked), links inside it are skipped, and its size
//     and number of files are limited.
//   - Extensions only run in the app's normal browsing session (never in the
//     assistant's hidden reading window).
import { app } from 'electron';
import type { BrowserWindow, Session, WebContents } from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import fs from 'node:fs';
import path from 'node:path';
import {
  addExtension,
  describePermissions,
  parseManifest,
  removeExtension,
  resolveMessage,
  updateExtension,
} from './extensionList';
import type { ExtensionRecord, ExtensionsState } from './extensionList';

const MAX_MANIFEST_BYTES = 1_000_000;
const MAX_FILES = 20_000;
const MAX_BYTES = 200_000_000;

export interface ExtensionManagerDeps {
  session: Session;
  window: BrowserWindow;
  getList(): ExtensionsState;
  setList(next: ExtensionsState): void;
  // Open a web page in a new tab and give back its page (null if it cannot).
  createTab(url: string): Promise<WebContents | null>;
  selectTab(contents: WebContents): void;
  removeTab(contents: WebContents): void;
  // Ask a yes/no question in a native window.
  confirm(options: {
    title: string;
    message: string;
    detail: string;
    button: string;
  }): Promise<boolean>;
}

export type Inspected =
  | {
      ok: true;
      name: string;
      version: string;
      permissions: string[];
      words: string[];
      manifestVersion: 2 | 3;
    }
  | { ok: false; error: string };

export type InstallResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

const readJson = (file: string): unknown => {
  const size = fs.statSync(file).size;
  if (size > MAX_MANIFEST_BYTES) throw new Error('A file is too large.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

// How big a folder is (not following links); null if it is too big or has too many
// files.
function folderSize(folder: string): { files: number; bytes: number } | null {
  let files = 0;
  let bytes = 0;
  const walk = (dir: string): boolean => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!walk(full)) return false;
      } else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(full).size;
        if (files > MAX_FILES || bytes > MAX_BYTES) return false;
      }
    }
    return true;
  };
  return walk(folder) ? { files, bytes } : null;
}

export function registerExtensions(deps: ExtensionManagerDeps) {
  const root = path.join(app.getPath('userData'), 'extensions');

  // The helper library: it adds the tabs, windows, menus... that Chrome extensions
  // expect, on top of what Electron has built in.
  const chrome = new ElectronChromeExtensions({
    session: deps.session,
    createTab: async (details) => {
      const url = typeof details.url === 'string' ? details.url : '';
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('Only web pages can be opened from an extension.');
      }
      const contents = await deps.createTab(url);
      if (!contents) throw new Error('The tab could not be opened.');
      return [contents, deps.window];
    },
    selectTab: (contents) => deps.selectTab(contents),
    removeTab: (contents) => deps.removeTab(contents),
    createWindow: async () => {
      throw new Error('Extra windows are not supported yet.');
    },
    // An extension asking for more permissions later is refused for now.
    requestPermissions: async () => false,
  });

  // Where an extension is loaded from.
  const folderOf = (record: ExtensionRecord) => path.join(root, record.key);

  const load = async (record: ExtensionRecord): Promise<boolean> => {
    try {
      const extension = await deps.session.extensions.loadExtension(
        folderOf(record),
      );
      if (record.id !== extension.id) {
        deps.setList(
          updateExtension(deps.getList(), record.key, { id: extension.id }),
        );
      }
      return true;
    } catch (error) {
      console.error(
        `[extensions] could not load ${record.name}: ${(error as Error).message}`,
      );
      return false;
    }
  };

  const unload = (record: ExtensionRecord) => {
    if (record.id === null) return;
    try {
      deps.session.extensions.removeExtension(record.id);
    } catch {
      // It was not loaded.
    }
  };

  // Read a folder's manifest and say what the extension asks for.
  function inspectFolder(folder: string): Inspected {
    try {
      if (!fs.statSync(folder).isDirectory()) {
        return { ok: false, error: 'That is not a folder.' };
      }
      const manifestFile = path.join(folder, 'manifest.json');
      if (!fs.existsSync(manifestFile)) {
        return {
          ok: false,
          error:
            'There is no manifest.json in that folder. Pick the folder of an unpacked extension.',
        };
      }
      const parsed = parseManifest(readJson(manifestFile));
      if (!parsed) {
        return {
          ok: false,
          error: 'That manifest.json is not one this browser can use.',
        };
      }
      let name = parsed.name;
      if (parsed.defaultLocale) {
        const messages = path.join(
          folder,
          '_locales',
          parsed.defaultLocale,
          'messages.json',
        );
        if (fs.existsSync(messages)) {
          try {
            name = resolveMessage(parsed.name, readJson(messages));
          } catch {
            // Keep the name as it is written.
          }
        }
      }
      if (folderSize(folder) === null) {
        return {
          ok: false,
          error: 'That folder is too large to be an extension.',
        };
      }
      return {
        ok: true,
        name,
        version: parsed.version,
        manifestVersion: parsed.manifestVersion,
        permissions: [...parsed.permissions, ...parsed.hostPermissions],
        words: describePermissions(parsed),
      };
    } catch (error) {
      return {
        ok: false,
        error: `That folder could not be read: ${(error as Error).message}`,
      };
    }
  }

  // Add an extension from a folder: show what it asks for, ask, copy it in, load it.
  async function installFolder(
    folder: string,
    // Only the developer test hook skips the question.
    skipQuestion = false,
  ): Promise<InstallResult> {
    const seen = inspectFolder(folder);
    if (!seen.ok) return seen;
    const parsed = parseManifest(readJson(path.join(folder, 'manifest.json')));
    if (!parsed)
      return { ok: false, error: 'That manifest.json cannot be used.' };
    const detail =
      seen.words.length > 0
        ? `It will be able to:\n\n${seen.words.map((w) => `• ${w}`).join('\n')}`
        : 'It does not ask for any special access.';
    const yes =
      skipQuestion ||
      (await deps.confirm({
        title: 'Add this extension?',
        message: `Add “${seen.name}” (version ${seen.version})?`,
        detail: `${detail}\n\nOnly add extensions you trust.`,
        button: 'Add extension',
      }));
    if (!yes) return { ok: false, error: 'Cancelled.' };

    const added = addExtension(
      deps.getList(),
      { ...parsed, name: seen.name },
      Date.now(),
    );
    if (!added)
      return { ok: false, error: 'There are too many extensions already.' };
    const record = added.state.items.find((e) => e.key === added.key);
    if (!record) return { ok: false, error: 'Something went wrong.' };
    try {
      fs.mkdirSync(root, { recursive: true });
      fs.cpSync(folder, folderOf(record), {
        recursive: true,
        // Links inside the folder are never copied.
        filter: (source) => !fs.lstatSync(source).isSymbolicLink(),
      });
    } catch (error) {
      fs.rmSync(folderOf(record), { recursive: true, force: true });
      return {
        ok: false,
        error: `It could not be copied: ${(error as Error).message}`,
      };
    }
    deps.setList(added.state);
    if (!(await load(record))) {
      deps.setList(removeExtension(deps.getList(), record.key));
      fs.rmSync(folderOf(record), { recursive: true, force: true });
      return {
        ok: false,
        error: 'This extension could not be loaded by the browser.',
      };
    }
    return { ok: true, name: seen.name };
  }

  return {
    // The tabs the library should know about.
    addTab: (contents: WebContents) => chrome.addTab(contents, deps.window),
    removeTab: (contents: WebContents) => chrome.removeTab(contents),
    selectTab: (contents: WebContents) => chrome.selectTab(contents),
    inspectFolder,
    installFolder,
    // Load every extension that is switched on (at start: Electron does not
    // remember them).
    async loadAll() {
      for (const record of deps.getList().items) {
        if (record.enabled) await load(record);
      }
    },
    async setEnabled(key: string, enabled: boolean) {
      const record = deps.getList().items.find((e) => e.key === key);
      if (!record || record.enabled === enabled) return;
      deps.setList(updateExtension(deps.getList(), key, { enabled }));
      if (enabled) await load(record);
      else unload(record);
    },
    remove(key: string) {
      const record = deps.getList().items.find((e) => e.key === key);
      if (!record) return;
      unload(record);
      deps.setList(removeExtension(deps.getList(), key));
      fs.rmSync(folderOf(record), { recursive: true, force: true });
    },
    // Is it loaded and running now?
    isLoaded: (record: ExtensionRecord) =>
      record.id !== null &&
      deps.session.extensions.getExtension(record.id) !== null,
  };
}

export type ExtensionManager = ReturnType<typeof registerExtensions>;
