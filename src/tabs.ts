import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
  WebContentsView,
} from 'electron';
import path from 'node:path';
import {
  SIDEBAR_ANIMATION_MS,
  SIDEBAR_CLOSE_MARGIN,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_SNAP_WIDTH,
  TOOLBAR_HEIGHT,
} from './layout';
import { spaceMenu, tabMenu } from './menus';
import type { MenuActions } from './menus';
import * as model from './model';
import type { ActiveRef, SavedState, SavedTab } from './model';
import { createSaver, loadState } from './storage';
import type { UiState } from './types';
import { loadUi } from './ui';
import { resolveInput } from './url';

// What a new tab shows. Later this could become an AI chat / search page.
export const NEW_TAB_URL = 'https://duckduckgo.com';

const isId = (value: unknown): value is number => Number.isInteger(value);
const isIdOrNull = (value: unknown): value is number | null =>
  value === null || isId(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// Manages all tabs and Spaces of one window.
//
// The saved model (src/model.ts) is the single source of truth. A live web page
// (a WebContentsView) exists only for tabs opened this session: tabs restored
// from disk start "asleep" and load the first time you select them.
//
// Three layers, bottom to top:
//   1. the window's own UI page (toolbar, and a Space's overview)
//   2. the web page views
//   3. the sidebar view, on top, so it can slide open over a web page
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

  // The sidebar is open without being pinned because the mouse is on it.
  let hover = false;
  // How many menus / dialogs are open (the sidebar must not close under them).
  let busy = 0;
  // While the sidebar's edge is being dragged: where the edge is now.
  let dragWidth: number | null = null;
  let dragStartedPinned = false;

  const pinned = () => state.settings.sidebarPinned;
  const expanded = () => pinned() || hover;

  const activeTabId = () =>
    state.active?.kind === 'tab' ? state.active.id : null;

  // ---- The sidebar: our own UI page in a view on top of the web pages -------

  const sidebarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.contentView.addChildView(sidebarView);
  const sidebar = sidebarView.webContents;
  // Like the main window, the sidebar never opens windows or navigates away.
  sidebar.setWindowOpenHandler(() => ({ action: 'deny' }));
  sidebar.on('will-navigate', (event) => event.preventDefault());

  // ---- Layout ----------------------------------------------------------------
  //
  // Two numbers describe the layout, and both can be in the middle of sliding:
  //   sidebarNow: how wide the sidebar view is
  //   pageNow:    where the toolbar and web pages start (they are only pushed
  //               aside by a PINNED sidebar; an opened-by-hover one overlays)

  const sidebarTarget = () =>
    dragWidth ??
    (expanded() ? state.settings.sidebarWidth : SIDEBAR_COLLAPSED_WIDTH);
  const pageTarget = () => {
    if (dragWidth !== null) {
      return dragStartedPinned ? dragWidth : SIDEBAR_COLLAPSED_WIDTH;
    }
    return pinned() ? state.settings.sidebarWidth : SIDEBAR_COLLAPSED_WIDTH;
  };

  let sidebarNow = sidebarTarget();
  let pageNow = pageTarget();

  // The area for web pages: right of the sidebar strip (or of a pinned sidebar),
  // below the toolbar.
  const pageBounds = () => {
    const [width, height] = win.getContentSize();
    const left = Math.round(pageNow);
    return {
      x: left,
      y: TOOLBAR_HEIGHT,
      width: Math.max(0, width - left),
      height: Math.max(0, height - TOOLBAR_HEIGHT),
    };
  };

  // ---- Telling the UI pages what changed -----------------------------------

  // A UI page can only be sent messages after it has finished loading.
  const ready = new Set<Electron.WebContents>();
  const watchUi = (contents: Electron.WebContents) => {
    contents.on('did-finish-load', () => {
      ready.add(contents);
      sendState();
    });
  };

  const sendToUi = (channel: string, ...args: unknown[]) => {
    for (const contents of [win.webContents, sidebar]) {
      if (ready.has(contents) && !contents.isDestroyed()) {
        contents.send(channel, ...args);
      }
    }
  };

  // Tell the toolbar/overview page where it should start (it follows the
  // sidebar while that slides).
  const sendLayout = () => {
    if (ready.has(win.webContents) && !win.webContents.isDestroyed()) {
      win.webContents.send('ui:layout', Math.round(pageNow));
    }
  };

  const sendState = () => {
    if (win.isDestroyed()) return;
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
      sidebarPinned: pinned(),
      sidebarExpanded: expanded(),
    };
    sendToUi('ui:state', ui);
    sendLayout();
  };

  // Change the model, save soon, and refresh the UI.
  const commit = (next: SavedState) => {
    state = next;
    saver.schedule();
    sendState();
  };

  // ---- Moving things into place, smoothly -----------------------------------

  // Put the sidebar and the visible web page where sidebarNow / pageNow say.
  const render = () => {
    if (win.isDestroyed()) return;
    const [, height] = win.getContentSize();
    sidebarView.setBounds({
      x: 0,
      y: 0,
      width: Math.round(sidebarNow),
      height,
    });
    const id = activeTabId();
    if (id !== null) views.get(id)?.setBounds(pageBounds());
    sendLayout();
  };

  let animation: ReturnType<typeof setInterval> | null = null;
  const stopAnimation = () => {
    if (animation !== null) clearInterval(animation);
    animation = null;
  };

  // Slide (or, with animate = false, jump) to wherever the layout should be now.
  const applyLayout = (animate: boolean) => {
    stopAnimation();
    const toSidebar = sidebarTarget();
    const toPage = pageTarget();
    if (!animate || (sidebarNow === toSidebar && pageNow === toPage)) {
      sidebarNow = toSidebar;
      pageNow = toPage;
      render();
      return;
    }
    const fromSidebar = sidebarNow;
    const fromPage = pageNow;
    const started = Date.now();
    animation = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / SIDEBAR_ANIMATION_MS);
      const eased = 1 - (1 - t) ** 3; // Starts fast, settles gently.
      sidebarNow = fromSidebar + (toSidebar - fromSidebar) * eased;
      pageNow = fromPage + (toPage - fromPage) * eased;
      render();
      if (t >= 1) stopAnimation();
    }, 8);
  };

  // ---- Opening and closing the sidebar by mouse ---------------------------------

  // Where is the mouse, relative to the window's content area?
  const cursorInWindow = () => {
    const point = screen.getCursorScreenPoint();
    const bounds = win.getContentBounds();
    return {
      x: point.x - bounds.x,
      y: point.y - bounds.y,
      height: bounds.height,
    };
  };

  // Is the mouse over the open sidebar, or within `margin` pixels of it?
  const cursorNearSidebar = (margin: number) => {
    const { x, y, height } = cursorInWindow();
    return (
      x >= -margin &&
      x < state.settings.sidebarWidth + margin &&
      y >= -margin / 2 &&
      y < height + margin / 2
    );
  };

  // A sidebar opened by hover closes by itself, but only once the mouse has
  // moved well past its right edge for a moment (not the instant it leaves).
  let watcher: ReturnType<typeof setInterval> | null = null;
  let awayTicks = 0;
  const stopWatching = () => {
    if (watcher !== null) clearInterval(watcher);
    watcher = null;
  };
  const startWatching = () => {
    awayTicks = 0;
    if (watcher !== null) return;
    watcher = setInterval(() => {
      if (!hover || pinned() || dragWidth !== null || busy > 0) {
        awayTicks = 0;
        return;
      }
      if (cursorNearSidebar(SIDEBAR_CLOSE_MARGIN)) awayTicks = 0;
      else if (++awayTicks >= 4) setHover(false);
    }, 60);
  };

  const setHover = (value: boolean) => {
    if (value === hover) return;
    hover = value;
    if (value) startWatching();
    else stopWatching();
    applyLayout(true);
    sendState();
  };

  // Show a right-click menu without letting the sidebar close under it.
  const popupMenu = (menu: Electron.Menu | null) => {
    if (!menu) return;
    busy++;
    menu.popup({
      window: win,
      callback: () => void (busy = Math.max(0, busy - 1)),
    });
  };

  // ---- Web page views ----------------------------------------------------

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
    // Adding an existing view again moves it to the top: keep the sidebar above.
    win.contentView.addChildView(sidebarView);
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
    for (const [tabId, view] of views) {
      // Hidden pages are not resized while the layout slides, so catch up now.
      if (tabId === id) view.setBounds(pageBounds());
      view.setVisible(tabId === id);
    }
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
      busy++;
      let response: number;
      try {
        ({ response } = await dialog.showMessageBox(win, {
          type: 'warning',
          title: 'Delete Space',
          message: `Delete “${space.name}”?`,
          detail: `This closes its ${count} tab${count === 1 ? '' : 's'}. It cannot be undone.`,
          buttons: ['Delete Space and close tabs', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
        }));
      } finally {
        busy = Math.max(0, busy - 1);
      }
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
    // The sidebar shows the rename box, so make sure it is open.
    renameSpace: (spaceId) => {
      if (!pinned()) setHover(true);
      if (sidebar.isDestroyed()) return;
      sidebar.send('space:begin-rename', spaceId);
      sidebar.focus(); // So the rename box can take keyboard input.
    },
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
  // next / previous. Attached to both UI pages and to every web page.
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
  // We only accept messages that come from our own two UI pages, and we check
  // the type of everything they send.
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
    'sidebar:hover': () => {
      if (!pinned() && dragWidth === null) setHover(true);
    },
    // Dragging the sidebar's edge. While dragging the sidebar follows the mouse
    // exactly. On release: near the left edge it becomes the icon strip, anywhere
    // else it pins open at that width (which is remembered).
    'sidebar:drag-start': () => {
      if (dragWidth !== null) return;
      stopAnimation();
      dragStartedPinned = pinned();
      dragWidth = sidebarNow;
    },
    'sidebar:drag': (width) => {
      if (dragWidth === null || !isNumber(width)) return;
      dragWidth = Math.min(
        model.SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_COLLAPSED_WIDTH, width),
      );
      applyLayout(false);
    },
    'sidebar:drag-end': (width) => {
      if (dragWidth === null) return;
      const finalWidth = isNumber(width) ? width : dragWidth;
      dragWidth = null;
      hover = false;
      stopWatching();
      if (finalWidth < SIDEBAR_SNAP_WIDTH) {
        state = model.setSidebarPinned(state, false);
      } else {
        state = model.setSidebarWidth(
          model.setSidebarPinned(state, true),
          finalWidth,
        );
      }
      saver.schedule();
      applyLayout(true);
      sendState();
    },
    'tab:menu': (id) => {
      if (isId(id)) popupMenu(tabMenu(state, id, menuActions));
    },
    'space:menu': (id) => {
      if (isId(id)) popupMenu(spaceMenu(state, id, menuActions));
    },
  };
  const listeners = Object.entries(requests).map(([channel, handle]) => {
    const listener = (event: Electron.IpcMainEvent, ...args: unknown[]) => {
      if (event.sender === win.webContents || event.sender === sidebar) {
        handle(...args);
      }
    };
    ipcMain.on(channel, listener);
    return { channel, listener };
  });

  win.on('resize', () => applyLayout(false));
  win.webContents.on('before-input-event', handleShortcut);
  sidebar.on('before-input-event', handleShortcut);

  // Send the first state once each UI page is ready to listen. (Reading the save
  // file takes a moment, so the main window's page may already have loaded.)
  watchUi(win.webContents);
  watchUi(sidebar);
  if (!win.webContents.isLoading()) ready.add(win.webContents);
  void loadUi(sidebar, 'sidebar');

  // Save for sure when the window closes (a plain write might not finish).
  win.on('close', () => saver.flushSync());
  win.on('closed', () => {
    stopAnimation();
    stopWatching();
    for (const { channel, listener } of listeners)
      ipcMain.removeListener(channel, listener);
  });

  applyLayout(false);
  showActive();
}
