import { app, BrowserWindow, dialog, ipcMain, WebContentsView } from 'electron';
import path from 'node:path';
import { SIDEBAR_WIDTH, TOOLBAR_HEIGHT } from './layout';
import { spaceMenu, tabMenu } from './menus';
import type { MenuActions } from './menus';
import * as model from './model';
import type { ActiveRef, SavedState, SavedTab } from './model';
import { createSaver, loadState } from './storage';
import type { UiState } from './types';
import { resolveInput } from './url';

// What a new tab shows. Later this could become an AI chat / search page.
export const NEW_TAB_URL = 'https://duckduckgo.com';

const isId = (value: unknown): value is number => Number.isInteger(value);
const isIdOrNull = (value: unknown): value is number | null =>
  value === null || isId(value);

// Manages all tabs and Spaces of one window.
//
// The saved model (src/model.ts) is the single source of truth. A live web page
// (a WebContentsView) exists only for tabs opened this session: tabs restored
// from disk start "asleep" and load the first time you select them.
export async function createTabs(win: BrowserWindow): Promise<void> {
  const file = path.join(app.getPath('userData'), 'spaces.json');
  let state: SavedState = await loadState(file);
  if (win.isDestroyed()) return;

  // The first time ever (or after a reset) there is nothing: start with one tab.
  if (state.active === null) {
    state = model.addTab(state, { url: NEW_TAB_URL }).state;
  }

  const views = new Map<number, WebContentsView>();
  const saver = createSaver(file, () => state);
  let uiReady = false;

  const activeTabId = () =>
    state.active?.kind === 'tab' ? state.active.id : null;

  // ---- Telling the UI what changed --------------------------------------

  const sendState = () => {
    if (!uiReady || win.isDestroyed() || win.webContents.isDestroyed()) return;
    const id = activeTabId();
    const history =
      id === null ? undefined : views.get(id)?.webContents.navigationHistory;
    const ui: UiState = {
      spaces: state.spaces.map(({ id, name, color, collapsed }) => ({
        id,
        name,
        color,
        collapsed,
      })),
      tabs: state.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        spaceId: tab.spaceId,
        loaded: views.has(tab.id),
      })),
      active: state.active,
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
      sidebarPinned: state.settings.sidebarPinned,
    };
    win.webContents.send('ui:state', ui);
  };

  // Change the model, save soon, and refresh the UI.
  const commit = (next: SavedState) => {
    state = next;
    saver.schedule();
    sendState();
  };

  // ---- Web page views ----------------------------------------------------

  // Every tab's view gets the same area: right of the sidebar, below the toolbar.
  const pageBounds = () => {
    const [width, height] = win.getContentSize();
    return {
      x: SIDEBAR_WIDTH,
      y: TOOLBAR_HEIGHT,
      width: Math.max(0, width - SIDEBAR_WIDTH),
      height: Math.max(0, height - TOOLBAR_HEIGHT),
    };
  };

  const fitToWindow = () => {
    const bounds = pageBounds();
    for (const view of views.values()) view.setBounds(bounds);
  };

  const updateTab = (
    id: number,
    patch: { url?: string; title?: string; favicon?: string | null },
  ) => {
    if (model.findTab(state, id)) commit(model.updateTab(state, id, patch));
  };

  // Make sure a tab has a live web page, creating (and loading) it if asleep.
  const ensureView = (tab: SavedTab): WebContentsView => {
    const existing = views.get(tab.id);
    if (existing) return existing;

    const view = new WebContentsView({
      // Web content is untrusted: no Node.js, no preload bridge, fully sandboxed.
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    views.set(tab.id, view);
    win.contentView.addChildView(view);
    view.setBounds(pageBounds());
    view.setVisible(false);

    const contents = view.webContents;
    // Links that want a new window (target="_blank") open as a new tab in the
    // same Space. Only normal web addresses are allowed.
    contents.setWindowOpenHandler(({ url }) => {
      if (model.isWebUrl(url))
        openTab(url, model.findTab(state, tab.id)?.spaceId ?? null);
      return { action: 'deny' };
    });
    contents.on('before-input-event', handleShortcut);
    contents.on('page-title-updated', (_event, title) =>
      updateTab(tab.id, { title }),
    );
    contents.on('page-favicon-updated', (_event, favicons) =>
      updateTab(tab.id, { favicon: favicons.find(model.isWebUrl) ?? null }),
    );
    contents.on('did-navigate', () =>
      // The new page will report its own icon.
      updateTab(tab.id, { url: contents.getURL(), favicon: null }),
    );
    contents.on('did-navigate-in-page', () =>
      updateTab(tab.id, { url: contents.getURL() }),
    );

    void contents.loadURL(tab.url);
    return view;
  };

  // Show whatever is selected: wake the active tab if needed, hide the other
  // views. A Lead tab has no web page: the toolbar window draws it instead.
  const showActive = () => {
    const id = activeTabId();
    const tab = id === null ? undefined : model.findTab(state, id);
    if (tab) ensureView(tab);
    for (const [tabId, view] of views) view.setVisible(tabId === id);
    if (id !== null) views.get(id)?.webContents.focus();
    else win.webContents.focus();
    sendState();
  };

  // Change the model, save soon, and show the new selection.
  const commitAndShow = (next: SavedState) => {
    state = next;
    saver.schedule();
    showActive();
  };

  // ---- Actions -------------------------------------------------------------

  const openTab = (url: string, spaceId: number | null) =>
    commitAndShow(model.addTab(state, { url, spaceId }).state);

  // Throw away a tab's live web page (if it has one).
  const destroyView = (id: number) => {
    const view = views.get(id);
    if (!view) return;
    views.delete(id);
    win.contentView.removeChildView(view);
    view.webContents.close();
  };

  // The window is never left with nothing to show.
  const withSomethingActive = (next: SavedState): SavedState =>
    next.active === null
      ? model.addTab(next, { url: NEW_TAB_URL }).state
      : next;

  const closeTab = (id: number) => {
    if (!model.findTab(state, id)) return;
    destroyView(id);
    commitAndShow(withSomethingActive(model.removeTab(state, id)));
  };

  const deleteSpace = async (id: number) => {
    const space = model.findSpace(state, id);
    if (!space) return;
    const count = state.tabs.filter((tab) => tab.spaceId === id).length;
    // Nothing to lose in an empty Space; otherwise ask first.
    if (count > 0) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Delete Space',
        message: `Delete “${space.name}”?`,
        detail: `This closes its ${count} tab${count === 1 ? '' : 's'}. It cannot be undone.`,
        buttons: ['Delete Space and close tabs', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      if (response !== 0) return;
    }
    // The Space may have changed while the dialog was open.
    const result = model.deleteSpace(state, id);
    for (const tabId of result.removedTabIds) destroyView(tabId);
    commitAndShow(withSomethingActive(result.state));
  };

  const menuActions: MenuActions = {
    moveTab: (tabId, spaceId) => commit(model.moveTab(state, tabId, spaceId)),
    moveTabToNewSpace: (tabId) => {
      const created = model.addSpace(state);
      commit(model.moveTab(created.state, tabId, created.id));
    },
    closeTab,
    // The sidebar shows the rename box.
    renameSpace: (spaceId) =>
      win.webContents.send('space:begin-rename', spaceId),
    setSpaceColor: (spaceId, color) =>
      commit(model.setSpaceColor(state, spaceId, color)),
    setSpaceCollapsed: (spaceId, collapsed) =>
      commit(model.setSpaceCollapsed(state, spaceId, collapsed)),
    ungroupSpace: (spaceId) =>
      commitAndShow(model.ungroupSpace(state, spaceId)),
    deleteSpace: (spaceId) => void deleteSpace(spaceId),
  };

  const select = (ref: ActiveRef) => commitAndShow(model.setActive(state, ref));

  // The Space the user is "in": where Ctrl+T puts a new tab.
  const currentSpaceId = (): number | null => {
    const active = state.active;
    if (active?.kind === 'lead') return active.spaceId;
    if (active?.kind === 'tab')
      return model.findTab(state, active.id)?.spaceId ?? null;
    return null;
  };

  // Keyboard shortcuts: Ctrl+T new tab, Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab
  // next / previous. Attached to the UI page and to every web page.
  const handleShortcut = (
    event: { preventDefault: () => void },
    input: Electron.Input,
  ) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta)
      return;
    const key = input.key.toLowerCase();
    if (key === 't') {
      event.preventDefault();
      openTab(NEW_TAB_URL, currentSpaceId());
    } else if (key === 'w') {
      event.preventDefault();
      const id = activeTabId();
      if (id !== null) closeTab(id);
    } else if (key === 'tab') {
      event.preventDefault();
      const order = model.navOrder(state);
      const index = order.findIndex((ref) => model.sameRef(ref, state.active));
      const step = input.shift ? -1 : 1;
      const next = order[(index + step + order.length) % order.length];
      if (next) select(next);
    }
  };

  // ---- Requests from the UI --------------------------------------------------
  // We only accept messages that come from our own UI page, and we check the
  // type of everything they send.
  const requests: Record<string, (...args: unknown[]) => void> = {
    'tab:navigate': (input) => {
      const id = activeTabId();
      if (id === null || typeof input !== 'string') return;
      const url = resolveInput(input);
      if (url !== '') void views.get(id)?.webContents.loadURL(url);
    },
    'tab:back': () => {
      const id = activeTabId();
      const history =
        id === null ? undefined : views.get(id)?.webContents.navigationHistory;
      if (history?.canGoBack()) history.goBack();
    },
    'tab:forward': () => {
      const id = activeTabId();
      const history =
        id === null ? undefined : views.get(id)?.webContents.navigationHistory;
      if (history?.canGoForward()) history.goForward();
    },
    'tab:new': (spaceId) => {
      if (isIdOrNull(spaceId)) openTab(NEW_TAB_URL, spaceId);
    },
    'tab:close': (id) => {
      if (isId(id)) closeTab(id);
    },
    'tab:select': (id) => {
      if (isId(id)) select({ kind: 'tab', id });
    },
    'lead:select': (spaceId) => {
      if (isId(spaceId)) select({ kind: 'lead', spaceId });
    },
    'space:new': () => {
      const created = model.addSpace(state);
      commitAndShow(
        model.setActive(created.state, { kind: 'lead', spaceId: created.id }),
      );
    },
    'space:collapse': (id, collapsed) => {
      if (isId(id) && typeof collapsed === 'boolean') {
        commit(model.setSpaceCollapsed(state, id, collapsed));
      }
    },
    'space:rename': (id, name) => {
      if (isId(id) && typeof name === 'string')
        commit(model.renameSpace(state, id, name));
    },
    'tab:menu': (id) => {
      if (isId(id)) tabMenu(state, id, menuActions)?.popup({ window: win });
    },
    'space:menu': (id) => {
      if (isId(id)) spaceMenu(state, id, menuActions)?.popup({ window: win });
    },
  };
  const listeners = Object.entries(requests).map(([channel, handle]) => {
    const listener = (event: Electron.IpcMainEvent, ...args: unknown[]) => {
      if (event.sender === win.webContents) handle(...args);
    };
    ipcMain.on(channel, listener);
    return { channel, listener };
  });

  win.on('resize', fitToWindow);
  win.webContents.on('before-input-event', handleShortcut);
  // Send the first state once the UI page is ready to listen. (Reading the save
  // file takes a moment, so the page may already have finished loading.)
  win.webContents.on('did-finish-load', () => {
    uiReady = true;
    sendState();
  });
  if (!win.webContents.isLoading()) uiReady = true;
  // Save for sure when the window closes (a plain write might not finish).
  win.on('close', () => saver.flushSync());
  win.on('closed', () => {
    for (const { channel, listener } of listeners)
      ipcMain.removeListener(channel, listener);
  });

  showActive();
}
