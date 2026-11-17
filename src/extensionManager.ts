// Browser extensions, in the main process: the part that talks to Electron. The rules
// (the list, reading a manifest, the permission words) are pure code in
// extensionList.ts. This file adds an extension from a folder (copying it into the
// app's own data folder) or from the Chrome Web Store (through
// electron-chrome-web-store), loads the enabled ones at every start (Electron
// forgets them between runs), keeps store extensions up to date, and lets the
// helper library (electron-chrome-extensions) know about the tabs, so extensions
// that use the tabs API work.
//
// Safety:
//   - An extension only comes from a folder you pick or from the Chrome Web Store,
//     and you are shown what it asks for and must say yes first.
//   - A store extension that updates and now asks for more access is switched off
//     until you say yes to the new access.
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
  installChromeWebStore,
  installExtension,
  uninstallExtension,
  updateExtensions,
} from 'electron-chrome-web-store';
import {
  addExtension,
  describePermissions,
  latestVersionDir,
  parseManifest,
  removeExtension,
  resolveMessage,
  updateExtension,
  upsertStoreExtension,
} from './extensionList';
import type { ExtensionRecord, ExtensionsState } from './extensionList';
import type { ExtensionSettings } from './extensionSettings';

// How often extensions from the store are checked for updates.
const UPDATE_EVERY_MS = 5 * 60 * 60 * 1000;

const MAX_MANIFEST_BYTES = 1_000_000;
const MAX_FILES = 20_000;
const MAX_BYTES = 200_000_000;

export interface ExtensionManagerDeps {
  session: Session;
  window: BrowserWindow;
  getList(): ExtensionsState;
  setList(next: ExtensionsState): void;
  // Whether extensions from the Chrome Web Store update by themselves.
  getSettings(): ExtensionSettings;
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
  // Extensions added from a folder are copied here. An unpacked extension's id comes
  // from where its folder is, so this place must never change.
  const root = path.join(app.getPath('userData'), 'extensions');

  // The helper library: it adds the tabs, windows, menus... that Chrome extensions
  // expect, on top of what Electron has built in.
  const chrome = new ElectronChromeExtensions({
    session: deps.session,
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

  // Where an extension is loaded from. One from a folder is our own copy; one from
  // the Chrome Web Store is in the store library's folder, in a folder per version
  // (the newest is used).
  const folderOf = (record: ExtensionRecord) => path.join(root, record.key);
  // (Not "Extensions", the store library's usual place: Windows does not tell that
  // from "extensions" above, and the two kinds would share one folder.)
  const storeRoot = path.join(app.getPath('userData'), 'extension-store');
  // The first store install went into the shared folder. A store extension carries
  // its own key, so its id does not depend on where it is, and it can move.
  const migrateStoreRoot = () => {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[a-p]{32}$/.test(entry.name)) continue;
        fs.mkdirSync(storeRoot, { recursive: true });
        const to = path.join(storeRoot, entry.name);
        if (!fs.existsSync(to)) fs.renameSync(path.join(root, entry.name), to);
      }
    } catch {
      // Nothing there to move.
    }
  };
  const storeDir = (record: ExtensionRecord): string | null => {
    if (record.id === null || !/^[a-p]{32}$/.test(record.id)) return null;
    const base = path.join(storeRoot, record.id);
    try {
      const newest = latestVersionDir(fs.readdirSync(base));
      return newest === null ? null : path.join(base, newest);
    } catch {
      return null;
    }
  };
  const sourceOf = (record: ExtensionRecord): string | null =>
    record.source === 'store' ? storeDir(record) : folderOf(record);

  const load = async (record: ExtensionRecord): Promise<boolean> => {
    const from = sourceOf(record);
    if (from === null) {
      console.error(`[extensions] ${record.name}: its files are missing`);
      return false;
    }
    try {
      const extension = await deps.session.extensions.loadExtension(from);
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

  // ---- The Chrome Web Store ------------------------------------------------------
  // The store library makes the store's "Add to Chrome" button work, downloads and
  // unpacks the extension, and loads it. Before it downloads anything it asks us,
  // and we show what the extension asks for. Our list then follows what it loaded.
  const sessionExtensions = deps.session.extensions;
  const inStoreFolder = (extensionPath: string): boolean =>
    path.resolve(extensionPath).startsWith(storeRoot + path.sep);
  // Extensions we are switching off ourselves (not the store page removing them).
  const unloadingOurselves = new Set<string>();

  // Everything the extension would be able to do, as the question shows it.
  const permissionQuestion = (words: string[]): string =>
    `${
      words.length > 0
        ? `It will be able to:\n\n${words.map((w) => `• ${w}`).join('\n')}`
        : 'It does not ask for any special access.'
    }\n\nOnly add extensions you trust.`;

  // The library loaded (or updated) a store extension: keep our list in step. An
  // update that asks for more access switches the extension off until you agree.
  const onStoreLoaded = (extension: Electron.Extension) => {
    const parsed = parseManifest(extension.manifest);
    if (!parsed) return;
    const before = deps.getList();
    const result = upsertStoreExtension(
      before,
      extension.id,
      { ...parsed, name: extension.name, version: extension.version },
      Date.now(),
    );
    if (result === null) {
      // Too many extensions, or an odd id: do not keep it.
      unloadingOurselves.add(extension.id);
      try {
        sessionExtensions.removeExtension(extension.id);
      } catch {
        // Not loaded.
      }
      return;
    }
    if (JSON.stringify(result.state.items) !== JSON.stringify(before.items)) {
      deps.setList(result.state);
    }
    if (result.needsReview) {
      unloadingOurselves.add(extension.id);
      try {
        sessionExtensions.removeExtension(extension.id);
      } catch {
        // Not loaded.
      }
    }
  };
  sessionExtensions.on('extension-loaded', (_event, extension) => {
    if (inStoreFolder(extension.path)) onStoreLoaded(extension);
  });
  // The store page's own "Remove" button uninstalls through the library, which
  // deletes the files. Seen from here that looks like an update (unloaded, then
  // loaded again), so a moment later it is checked whether the files are really gone.
  sessionExtensions.on('extension-unloaded', (_event, extension) => {
    if (unloadingOurselves.delete(extension.id)) return;
    const record = deps
      .getList()
      .items.find((e) => e.id === extension.id && e.source === 'store');
    if (!record) return;
    setTimeout(() => {
      const still = deps
        .getList()
        .items.find((e) => e.id === extension.id && e.source === 'store');
      if (!still || storeDir(still) !== null) return;
      if (sessionExtensions.getExtension(extension.id)) return;
      deps.setList(removeExtension(deps.getList(), still.key));
      void wipeData(extension.id);
    }, 2000);
  });

  void installChromeWebStore({
    session: deps.session,
    extensionsPath: storeRoot,
    // We load them ourselves (at start, honouring your on/off switch) and run the
    // updates ourselves (honouring the setting).
    loadExtensions: false,
    autoUpdate: false,
    beforeInstall: async (details) => {
      const parsed = parseManifest(details.manifest);
      if (!parsed) return { action: 'deny' };
      const yes = await deps.confirm({
        title: 'Add this extension?',
        message: `Add “${details.localizedName}” from the Chrome Web Store?`,
        detail: permissionQuestion(describePermissions(parsed)),
        button: 'Add extension',
      });
      return { action: yes ? 'allow' : 'deny' };
    },
  }).catch((error: Error) => {
    console.error(`[extensions] web store: ${error.message}`);
  });

  // Updates for extensions from the store: at start and every few hours, if the
  // setting is on. (Only extensions that are on are updated.)
  const checkForUpdates = async (): Promise<void> => {
    if (!deps.getSettings().autoUpdate) return;
    try {
      await updateExtensions(deps.session);
    } catch (error) {
      console.error(`[extensions] updates: ${(error as Error).message}`);
    }
  };
  const updateTimer = setInterval(
    () => void checkForUpdates(),
    UPDATE_EVERY_MS,
  );
  app.on('before-quit', () => clearInterval(updateTimer));

  // The extension's own picture as a data address (the biggest PNG up to 128 px
  // that its manifest lists), or null. Kept after the first read.
  const icons = new Map<string, string | null>();
  const iconOf = (record: ExtensionRecord): string | null => {
    if (icons.has(record.key)) return icons.get(record.key) ?? null;
    let found: string | null = null;
    const dir = sourceOf(record);
    if (dir === null) return null;
    try {
      const manifest = readJson(path.join(dir, 'manifest.json')) as {
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
        const file = path.resolve(dir, String(sizes[0][1]));
        // Only a file inside the extension's own folder.
        if (file.startsWith(dir + path.sep)) {
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
      migrateStoreRoot();
      await sweepLeftovers();
      for (const record of deps.getList().items) {
        if (record.enabled) await load(record);
      }
      // A first look for updates, a little after start-up.
      setTimeout(() => void checkForUpdates(), 30_000);
    },
    setPinned(key: string, pinned: boolean) {
      if (deps.getList().items.some((e) => e.key === key)) {
        deps.setList(updateExtension(deps.getList(), key, { pinned }));
      }
    },
    async setEnabled(key: string, enabled: boolean) {
      const record = deps.getList().items.find((e) => e.key === key);
      if (!record || record.enabled === enabled) return;
      if (enabled && record.review !== null) {
        // It was updated and asked for more access: it only comes back if you say
        // yes to what it asks for now.
        const yes = await deps.confirm({
          title: 'Turn this extension back on?',
          message: `“${record.name}” was updated and now asks for more access.`,
          detail: permissionQuestion(describePermissions(record)),
          button: 'Turn on',
        });
        if (!yes) return;
      }
      deps.setList(
        updateExtension(deps.getList(), key, {
          enabled,
          ...(enabled ? { review: null } : {}),
        }),
      );
      if (enabled) await load(record);
      else unload(record);
    },
    async remove(key: string) {
      const record = deps.getList().items.find((e) => e.key === key);
      if (!record) return;
      unloadingOurselves.add(record.id ?? '');
      unload(record);
      deps.setList(removeExtension(deps.getList(), key));
      if (record.source === 'store' && record.id !== null) {
        try {
          await uninstallExtension(record.id, {
            session: deps.session,
            extensionsPath: storeRoot,
          });
        } catch (error) {
          console.error(`[extensions] remove: ${(error as Error).message}`);
        }
        fs.rmSync(path.join(storeRoot, record.id), {
          recursive: true,
          force: true,
        });
      } else {
        fs.rmSync(folderOf(record), { recursive: true, force: true });
      }
      // What the extension saved goes with it.
      if (record.id !== null) void wipeData(record.id);
    },
    // For testing only: install a store extension by its id without the question
    // (a test cannot click a native window). Never used in a packaged app.
    installStoreForTest: async (id: string) => {
      await installExtension(id, {
        session: deps.session,
        extensionsPath: storeRoot,
      });
    },
    // Check the store extensions for updates now (the Settings switch decides
    // whether this also happens by itself).
    checkForUpdates,
    // Is it loaded and running now?
    isLoaded: (record: ExtensionRecord) =>
      record.id !== null &&
      deps.session.extensions.getExtension(record.id) !== null,
  };
}

export type ExtensionManager = ReturnType<typeof registerExtensions>;
