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
import { convertExtensionMenu } from './extensionMenus';
import type { ExtensionMenuNode } from './extensionMenus';
import { isExtensionUrl } from './model';
import type { MenuItem } from './menuTypes';
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
  // A popup opened (its extension's id) or closed (null).
  onPopup(extensionId: string | null): void;
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
    // The library cannot find its own helper script once this app is bundled, so
    // it is pointed at it. (A packaged app must carry that file along: noted for the
    // packaging step.)
    modulePath: path.join(
      app.getAppPath(),
      'node_modules',
      'electron-chrome-extensions',
    ),
    createTab: async (details) => {
      const url = typeof details.url === 'string' ? details.url : '';
      if (!/^https?:\/\//i.test(url) && !isOwnPage(url)) {
        throw new Error(
          'An extension can only open web pages and its own pages.',
        );
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

  // Popups: the library resizes and places a popup every time the page reports a
  // new size. At 125% screen scaling, resizing the window by a pixel makes the page
  // report a size one pixel different, which resizes it again, and so on: the popup
  // vibrates. So its size handler is replaced by one that ignores tiny changes, and
  // places the popup once more a moment later, when Windows has applied the size.
  chrome.on('browser-action-popup-created', (popup) => {
    const inner = popup as unknown as {
      updatePreferredSize: (event: unknown, size: unknown) => void;
      updatePosition(): void;
      show(): void;
      hidden: boolean;
    };
    const contents = popup.browserWindow?.webContents;
    if (!contents) return;
    (contents as unknown as { off(e: string, f: unknown): void }).off(
      'preferred-size-changed',
      inner.updatePreferredSize,
    );
    let last = { width: 0, height: 0 };
    (
      contents as unknown as Electron.WebContents & {
        on(
          e: string,
          f: (event: unknown, size: { width: number; height: number }) => void,
        ): void;
      }
    ).on('preferred-size-changed', (_event, size) => {
      if (popup.isDestroyed()) return;
      if (
        Math.abs(size.width - last.width) <= 4 &&
        Math.abs(size.height - last.height) <= 4
      ) {
        return;
      }
      last = size;
      popup.setSize(size);
      inner.updatePosition();
      if (inner.hidden) inner.show();
      setTimeout(() => {
        if (!popup.isDestroyed()) inner.updatePosition();
      }, 80);
    });
    // When the page has loaded the library sets the popup to its smallest size, and
    // if the page had already reported its real size by then (it often has, on a
    // quick second open) nothing puts it right again: the popup stays a small
    // box. So once loaded, the size the page reported is applied again.
    void popup.whenReady().then(() => {
      setTimeout(() => {
        if (popup.isDestroyed()) return;
        if (last.width > 0) {
          popup.setSize(last);
          inner.updatePosition();
          if (inner.hidden) inner.show();
        }
      }, 60);
    });
    // The toolbar is told which popup is open (so a second click closes it).
    deps.onPopup(popup.extensionId);
    popup.browserWindow?.once('closed', () => deps.onPopup(null));
  });

  // Lets the toolbar draw an extension's button picture (crx:// addresses).
  try {
    ElectronChromeExtensions.handleCRXProtocol(deps.session);
  } catch (error) {
    console.error(`[extensions] pictures: ${(error as Error).message}`);
  }

  // An address inside one of the extensions you have switched on (its options
  // page, for example). Never another extension's, and never a file.
  const isOwnPage = (url: string): boolean => {
    if (!isExtensionUrl(url)) return false;
    const id = /^chrome-extension:\/\/([a-p]{32})/.exec(url)?.[1];
    return deps
      .getList()
      .items.some((e) => e.enabled && e.id !== null && e.id === id);
  };

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

  // Delete what an extension saved (its settings, and the pages' storage under its
  // address). Removing an extension must leave nothing of it behind: an extension
  // added later could get the same id, and would otherwise find the old data.
  const settingsRoot = path.join(
    app.getPath('userData'),
    'Local Extension Settings',
  );
  const wipeData = async (id: string): Promise<void> => {
    if (!/^[a-p]{32}$/.test(id)) return;
    try {
      await deps.session.clearStorageData({
        origin: `chrome-extension://${id}`,
      });
    } catch (error) {
      console.error(`[extensions] storage: ${(error as Error).message}`);
    }
    try {
      fs.rmSync(path.join(settingsRoot, id), { recursive: true, force: true });
    } catch {
      // Still in use; it is removed at the next start.
    }
  };
  // At start: data left by extensions that are no longer in the list (for example
  // when a file could not be deleted while the app was running).
  const sweepLeftovers = async (): Promise<void> => {
    let names: string[] = [];
    try {
      names = fs.readdirSync(settingsRoot);
    } catch {
      return;
    }
    const known = new Set(deps.getList().items.map((e) => e.id));
    for (const name of names) {
      if (/^[a-p]{32}$/.test(name) && !known.has(name)) await wipeData(name);
    }
  };

  // The extension's own picture as a data address (the biggest PNG up to 128 px
  // that its manifest lists), or null. Kept after the first read.
  const icons = new Map<string, string | null>();
  const iconOf = (record: ExtensionRecord): string | null => {
    if (icons.has(record.key)) return icons.get(record.key) ?? null;
    let found: string | null = null;
    try {
      const manifest = readJson(
        path.join(folderOf(record), 'manifest.json'),
      ) as {
        icons?: Record<string, unknown>;
      };
      const sizes = Object.entries(manifest.icons ?? {})
        .map(([size, file]) => [Number(size), file] as const)
        .filter(
          ([size, file]) =>
            Number.isFinite(size) &&
            size <= 128 &&
            typeof file === 'string' &&
            file.toLowerCase().endsWith('.png'),
        )
        .sort((a, b) => b[0] - a[0]);
      if (sizes.length > 0) {
        const file = path.resolve(folderOf(record), String(sizes[0][1]));
        // Only a file inside the extension's own folder.
        if (file.startsWith(folderOf(record) + path.sep)) {
          const bytes = fs.readFileSync(file);
          if (bytes.length <= 200_000) {
            found = `data:image/png;base64,${bytes.toString('base64')}`;
          }
        }
      }
    } catch {
      // No picture; the panel shows a plain one.
    }
    icons.set(record.key, found);
    return found;
  };

  // The extensions' own items for a right-click in a page: rows for the menu, and
  // a way to run the one that was chosen.
  function contextMenuFor(
    contents: WebContents,
    params: Electron.ContextMenuParams,
  ): { items: MenuItem[]; run(id: string): boolean } {
    const clickable: ExtensionMenuNode[] = [];
    let items: MenuItem[] = [];
    try {
      const nodes = chrome.getContextMenuItems(contents, params);
      items = convertExtensionMenu(
        nodes as unknown as ExtensionMenuNode[],
        (node) => {
          clickable.push(node);
          return `ext:${clickable.length - 1}`;
        },
      );
    } catch (error) {
      console.error(`[extensions] menu: ${(error as Error).message}`);
    }
    return {
      items,
      run(id) {
        const index = /^ext:(\d{1,3})$/.exec(id)?.[1];
        const node = index === undefined ? undefined : clickable[Number(index)];
        const click = (
          node as { click?: (...args: unknown[]) => void } | undefined
        )?.click;
        if (!click) return false;
        click.call(node, undefined, undefined, undefined);
        return true;
      },
    };
  }

  return {
    iconOf,
    contextMenuFor,
    // The tabs the library should know about.
    addTab: (contents: WebContents) => chrome.addTab(contents, deps.window),
    removeTab: (contents: WebContents) => chrome.removeTab(contents),
    selectTab: (contents: WebContents) => chrome.selectTab(contents),
    inspectFolder,
    installFolder,
    // Load every extension that is switched on (at start: Electron does not
    // remember them).
    async loadAll() {
      await sweepLeftovers();
      for (const record of deps.getList().items) {
        if (record.enabled) await load(record);
      }
    },
    setPinned(key: string, pinned: boolean) {
      if (deps.getList().items.some((e) => e.key === key)) {
        deps.setList(updateExtension(deps.getList(), key, { pinned }));
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
      // What the extension saved goes with it.
      if (record.id !== null) void wipeData(record.id);
    },
    // Is it loaded and running now?
    isLoaded: (record: ExtensionRecord) =>
      record.id !== null &&
      deps.session.extensions.getExtension(record.id) !== null,
  };
}

export type ExtensionManager = ReturnType<typeof registerExtensions>;
