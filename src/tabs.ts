import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
  session,
  WebContentsView,
} from 'electron';
import path from 'node:path';
import {
  blendSizes,
  chatHeightWhileDragging,
  easeOutCubic,
  pageRect,
  panelWidthWhileDragging,
  restingChatHeight,
  restingPanelWidth,
  settleChat,
  settlePanel,
} from './frame';
import type { FrameSizes, Size } from './frame';
import {
  FRAME_ANIMATION_MS,
  PAGE_RADIUS,
  SIDEBAR_CLOSE_MARGIN,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_SNAP_WIDTH,
} from './layout';
import * as artifactsModel from './artifacts';
import type { ArtifactsState } from './artifacts';
import * as chatsModel from './chats';
import type { ChatsState } from './chats';
import type {
  ActionEnv,
  ActionResult,
  OutlineRead,
  PageRead,
} from './agentTools';
import {
  chooseOption,
  clickControl,
  pressKey as pressKeyInPage,
  readLinkAddress,
  scrollPage,
  typeIntoControl,
} from './pageActions';
import type { Cdp, DoneResult } from './pageActions';
import { buildOutline } from './pageOutline';
import { readAccessibilityTree, readPageText, withCdp } from './pageReader';
import { createChatService } from './chatService';
import type { ChatService } from './chatService';
import { snapshotLookup } from './chatLinks';
import type { Workspace } from './chatLinks';
import { chatMenu, chatRowMenu, spaceMenu, tabMenu } from './menus';
import type { ChatMenuActions, MenuActions } from './menus';
import * as model from './model';
import type { ActiveRef, SavedState, SavedTab } from './model';
import type { LlmContext } from './llm';
import type { SearchContext } from './search';
import {
  createSaver,
  loadArtifacts,
  loadChats,
  loadJson,
  loadState,
} from './storage';
import { isApprovalLevel } from './toolPolicy';
import {
  defaultToolSettings,
  describeTools,
  levelFor,
  parseToolSettings,
  withLevel,
} from './toolSettings';
import type { FrameLayout, ResizeKind, UiState } from './types';
import { loadUi } from './ui';
import { resolveInput } from './url';

// What a new tab shows. Later this could become an AI chat / search page.
export const NEW_TAB_URL = 'https://duckduckgo.com';

const isId = (value: unknown): value is number => Number.isInteger(value);
const isIdOrNull = (value: unknown): value is number | null =>
  value === null || isId(value);
const isLinkKind = (value: unknown): value is 'tab' | 'space' =>
  value === 'tab' || value === 'space';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isResizeKind = (value: unknown): value is ResizeKind =>
  value === 'sidebar' || value === 'chat' || value === 'panel';
const clamp = (min: number, max: number, value: number) =>
  Math.min(max, Math.max(min, value));

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
export async function createTabs(
  win: BrowserWindow,
  llm: Promise<LlmContext>,
  search: Promise<SearchContext>,
): Promise<void> {
  const file = path.join(app.getPath('userData'), 'spaces.json');
  const chatsFile = path.join(app.getPath('userData'), 'chats.json');
  let state: SavedState = await loadState(file);
  let chats: ChatsState = await loadChats(chatsFile);
  // Documents made inside the browser (not uploads).
  const artifactsFile = path.join(app.getPath('userData'), 'artifacts.json');
  let artifacts: ArtifactsState = await loadArtifacts(artifactsFile);
  // How much each tool may do without asking (the Tools panel's choices).
  const toolsFile = path.join(app.getPath('userData'), 'tools.json');
  let toolSettings = await loadJson(
    toolsFile,
    parseToolSettings,
    defaultToolSettings,
  );
  const toolsSaver = createSaver(toolsFile, () => toolSettings);
  if (win.isDestroyed()) return;

  // Artifact tabs only make sense for artifacts that still exist.
  state = model.reconcileArtifactTabs(state, artifacts.artifacts);

  // The first time ever (or after a reset) there is nothing: start with one tab.
  if (state.active === null) {
    state = model.addTab(state, { url: NEW_TAB_URL }).state;
  }

  const views = new Map<number, WebContentsView>();
  const saver = createSaver(file, () => state);
  const chatsSaver = createSaver(chatsFile, () => chats);
  const artifactsSaver = createSaver(artifactsFile, () => artifacts);

  // The AI connection (key, model, pins, system prompt) and the chat service that
  // talks to the model. Both are set up a little later than the window.
  let llmContext: LlmContext | null = null;
  let chatService: ChatService | null = null;

  // The Spaces and tabs as the chat sees them (titles and addresses).
  const workspace = (): Workspace => ({
    tabs: state.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      spaceId: t.spaceId,
    })),
    spaces: state.spaces.map((s) => ({ id: s.id, name: s.name })),
  });

  // Keep each chat link's remembered name and address current. Done just before
  // something closes, so a link to a closed tab or Space can still show its name
  // (and a closed tab can be reopened).
  const syncLinkSnapshots = () => {
    const next = chatsModel.refreshRefs(chats, snapshotLookup(workspace()));
    if (next !== chats) {
      chats = next;
      chatsSaver.schedule();
    }
  };

  // The sidebar is open without being pinned because the mouse is on it.
  let hover = false;
  // How many menus / dialogs are open (the sidebar must not close under them).
  let busy = 0;
  // While an edge of the frame is being dragged: which one, and where it is now
  // (the sidebar's width, the chat's height, or the right panel's width).
  let drag: { kind: ResizeKind; size: number; startedPinned: boolean } | null =
    null;

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
  // Four numbers describe the frame (see frame.ts and layout.ts), and every one
  // of them can be in the middle of sliding:
  //   sidebar: width of the sidebar view (a hover-opened one floats over the page)
  //   left:    room the sidebar takes from the page (only a PINNED sidebar
  //            pushes the page aside)
  //   panel:   width of the right panel (0 when closed)
  //   chat:    height of the bottom chat

  // The size of the area the views are positioned in. (This is deliberately not
  // win.getContentSize(): on Windows that can disagree with the real area by the
  // height of the menu bar, which put the page 26 pixels out of line.)
  const windowSize = (): Size => {
    const { width, height } = win.contentView.getBounds();
    return { width, height };
  };

  // Where each part of the frame should be right now.
  const targetSizes = (): FrameSizes => {
    const s = state.settings;
    const window = windowSize();
    const left = pinned() ? s.sidebarWidth : SIDEBAR_COLLAPSED_WIDTH;
    const sizes: FrameSizes = {
      sidebar: expanded() ? s.sidebarWidth : SIDEBAR_COLLAPSED_WIDTH,
      left,
      panel: restingPanelWidth(
        s.rightPanel !== null,
        s.panelWidth,
        { left },
        window,
      ),
      chat: restingChatHeight(s.viewMode, s.chatExpanded, s.chatHeight, window),
    };
    // The part being dragged follows the mouse exactly.
    if (drag?.kind === 'sidebar') {
      sizes.sidebar = drag.size;
      // A sidebar that was hover-opened floats while you drag it; a pinned one
      // pushes the page.
      sizes.left = drag.startedPinned ? drag.size : SIDEBAR_COLLAPSED_WIDTH;
    } else if (drag?.kind === 'chat') {
      sizes.chat = drag.size;
    } else if (drag?.kind === 'panel') {
      sizes.panel = drag.size;
    }
    return sizes;
  };

  let now: FrameSizes = targetSizes();

  // The rounded card where web pages are drawn.
  const pageBounds = () => pageRect(now, windowSize());
  // Is the page on screen? Not in chat-only mode (the chat covers everything),
  // and not while it has no room.
  const pageIsShown = () => {
    if (state.settings.viewMode === 'chat') return false;
    const rect = pageBounds();
    return rect.width > 4 && rect.height > 4;
  };

  // ---- Telling the UI pages what changed -----------------------------------

  // A UI page can only be sent messages after it has finished loading.
  const ready = new Set<Electron.WebContents>();
  const watchUi = (contents: Electron.WebContents) => {
    contents.on('did-finish-load', () => {
      ready.add(contents);
      sendState();
    });
    // Show problems in the app's own pages in the terminal, so a blank panel can
    // be diagnosed (these pages are ours, not web content).
    contents.on('console-message', (event) => {
      if (event.level === 'error') {
        console.error(
          `[ui] ${event.message} (${event.sourceId}:${event.lineNumber})`,
        );
      }
    });
    contents.on('render-process-gone', (_event, details) => {
      console.error(`[ui] page process gone: ${details.reason}`);
    });
    contents.on('did-fail-load', (_event, code, description, url) => {
      console.error(
        `[ui] page failed to load (${code} ${description}): ${url}`,
      );
    });
  };

  const sendToUi = (channel: string, ...args: unknown[]) => {
    for (const contents of [win.webContents, sidebar]) {
      if (ready.has(contents) && !contents.isDestroyed()) {
        contents.send(channel, ...args);
      }
    }
  };

  // Tell the window's UI page how much room each part of the frame takes, so its
  // toolbar, chat and panels follow the frame while it slides.
  const sendLayout = () => {
    if (ready.has(win.webContents) && !win.webContents.isDestroyed()) {
      const layout: FrameLayout = {
        left: Math.round(now.left),
        panel: Math.round(now.panel),
        chat: Math.round(now.chat),
      };
      win.webContents.send('ui:layout', layout);
    }
  };

  const sendState = () => {
    if (win.isDestroyed()) return;
    const id = activeTabId();
    const history =
      id === null ? undefined : views.get(id)?.webContents.navigationHistory;
    const generating = chatService?.runningChats() ?? [];
    const ui: UiState = {
      spaces: state.spaces.map(({ id, name, color, collapsed }) => ({
        id,
        name,
        color,
        collapsed,
      })),
      artifactTabs: state.artifactTabs.flatMap((t) => {
        const a = artifactsModel.findArtifact(artifacts, t.artifactId);
        return a
          ? [{ id: a.id, title: a.title, kind: a.kind, spaceId: t.spaceId }]
          : [];
      }),
      artifacts: artifacts.artifacts.map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        spaceId: a.spaceId,
        updatedAt: a.updatedAt,
        size: a.content.length,
      })),
      tabs: state.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        spaceId: tab.spaceId,
        loaded: views.has(tab.id),
        working: working.has(tab.id),
      })),
      active: state.active,
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
      sidebarPinned: pinned(),
      sidebarExpanded: expanded(),
      viewMode: state.settings.viewMode,
      chats: {
        conversations: chats.conversations.map((c) => ({
          id: c.id,
          title: c.title,
          messageCount: c.messages.length,
          model: c.model,
          generating: generating.includes(c.id),
        })),
        activeId: chats.activeId,
        // The links on the chat you are looking at.
        refs: chatsModel.activeConversation(chats).refs,
      },
      llm: {
        hasKey: llmContext?.hasKey() ?? false,
        model: llmContext?.getSettings().model ?? null,
        pinned: llmContext?.getSettings().pinned ?? [],
        // The chat you are looking at may use its own model.
        activeModelSupportsTools: (() => {
          const model =
            chatsModel.activeConversation(chats).model ??
            llmContext?.getSettings().model ??
            null;
          return model === null
            ? null
            : (llmContext?.getModelInfo(model)?.supportsTools ?? null);
        })(),
      },
      chatExpanded: state.settings.chatExpanded,
      rightPanel: state.settings.rightPanel,
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

  // Put the sidebar and the visible web page where the frame's sizes say.
  const render = () => {
    if (win.isDestroyed()) return;
    sidebarView.setBounds({
      x: 0,
      y: 0,
      width: Math.round(now.sidebar),
      height: windowSize().height,
    });
    const view = views.get(activeTabId() ?? -1);
    if (view) {
      // In chat-only mode (or while the page is sliding shut) the page has no
      // room, so hide it instead of leaving a sliver on screen.
      const shown = pageIsShown();
      if (shown) view.setBounds(pageBounds());
      view.setVisible(shown);
    }
    sendLayout();
  };

  const sameSizes = (a: FrameSizes, b: FrameSizes) =>
    a.sidebar === b.sidebar &&
    a.left === b.left &&
    a.panel === b.panel &&
    a.chat === b.chat;

  let animation: ReturnType<typeof setInterval> | null = null;
  const stopAnimation = () => {
    if (animation !== null) clearInterval(animation);
    animation = null;
  };

  // Slide (or, with animate = false, jump) to wherever the frame should be now.
  // Every part moves together, so the whole frame morphs as one.
  const applyLayout = (animate: boolean) => {
    stopAnimation();
    const to = targetSizes();
    if (!animate || sameSizes(now, to)) {
      now = to;
      render();
      return;
    }
    const from = now;
    const started = Date.now();
    animation = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / FRAME_ANIMATION_MS);
      now = blendSizes(from, to, easeOutCubic(t));
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
      if (!hover || pinned() || drag !== null || busy > 0) {
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
    // The page is a rounded card inset in the frame.
    view.setBorderRadius(PAGE_RADIUS);
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
      view.setVisible(tabId === id && pageIsShown());
    }
    // Keyboard focus goes to the page, unless it is hidden (chat-only mode).
    if (id !== null && pageIsShown()) views.get(id)?.webContents.focus();
    else win.webContents.focus();
    sendState();
  };

  // Change the model, save soon, and show the new selection. If that also
  // changed what the middle of the window shows, slide to the new layout.
  const commitAndShow = (next: SavedState) => {
    const before = state.settings.viewMode;
    state = next;
    saver.schedule();
    showActive();
    if (state.settings.viewMode !== before) applyLayout(true);
  };

  // Choosing a page (a tab, an overview, an address) while the chat is on its
  // own brings the page back alongside the chat.
  const revealPage = (next: SavedState): SavedState =>
    next.settings.viewMode === 'chat' ? model.setViewMode(next, 'both') : next;

  // ---- Actions -------------------------------------------------------------

  const openTab = (url: string, spaceId: number | null) =>
    commitAndShow(revealPage(model.addTab(state, { url, spaceId }).state));

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
    syncLinkSnapshots(); // So a chat's link to this tab remembers its latest name.
    destroyView(id);
    commitAndShow(withSomethingActive(model.removeTab(state, id)));
  };

  // Ask a yes/no question in a native dialog (default answer: cancel). While it
  // is open the sidebar must not close under it.
  const confirm = async (options: {
    title: string;
    message: string;
    detail: string;
    button: string;
  }): Promise<boolean> => {
    busy++;
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: [options.button, 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      return response === 0;
    } finally {
      busy = Math.max(0, busy - 1);
    }
  };

  const commitArtifacts = (next: ArtifactsState) => {
    if (next === artifacts) return;
    artifacts = next;
    artifactsSaver.schedule();
    // Open tabs follow their artifacts (closed when deleted, regrouped when moved).
    const reconciled = model.reconcileArtifactTabs(state, artifacts.artifacts);
    if (reconciled !== state) {
      commitAndShow(withSomethingActive(reconciled));
    } else {
      sendState();
    }
  };

  // Open an artifact as a tab and show it (editing takes over the page area).
  const openArtifact = (id: number) => {
    const found = artifactsModel.findArtifact(artifacts, id);
    if (!found) return;
    commitAndShow(revealPage(model.openArtifactTab(state, id, found.spaceId)));
  };

  const deleteArtifact = async (id: number) => {
    const found = artifactsModel.findArtifact(artifacts, id);
    if (!found) return;
    if (
      !(await confirm({
        title: 'Delete artifact',
        message: `Delete “${found.title}”?`,
        detail: 'It cannot be undone.',
        button: 'Delete artifact',
      }))
    ) {
      return;
    }
    commitArtifacts(artifactsModel.deleteArtifact(artifacts, id));
  };

  const deleteSpace = async (id: number) => {
    const space = model.findSpace(state, id);
    if (!space) return;
    const count = state.tabs.filter((tab) => tab.spaceId === id).length;
    // Nothing to lose in an empty Space; otherwise ask first.
    if (
      count > 0 &&
      !(await confirm({
        title: 'Delete Space',
        message: `Delete “${space.name}”?`,
        detail: `This closes its ${count} tab${count === 1 ? '' : 's'}. It cannot be undone.`,
        button: 'Delete Space and close tabs',
      }))
    ) {
      return;
    }
    // The Space may have changed while the dialog was open.
    syncLinkSnapshots(); // Chats' links to this Space and its tabs remember them.
    const result = model.deleteSpace(state, id);
    // Its artifacts are kept, just no longer in a Space.
    commitArtifacts(artifactsModel.releaseSpace(artifacts, id));
    for (const tabId of result.removedTabIds) destroyView(tabId);
    commitAndShow(withSomethingActive(result.state));
  };

  // ---- Conversations (chats) -----------------------------------------------
  // Chats are managed on their own: they do not belong to a Space or a tab.

  const commitChats = (next: ChatsState) => {
    chats = next;
    chatsSaver.schedule();
    sendState();
  };

  // Open the Settings panel (e.g. from the chat when a key or model is missing).
  const openSettings = () => {
    state = model.setRightPanel(state, 'settings');
    saver.schedule();
    applyLayout(true);
    sendState();
  };

  // Wait until a page has finished loading (true), or the time runs out or Stop
  // is pressed (false). Returns at once if it is not loading.
  const waitForLoad = (
    contents: Electron.WebContents,
    signal: AbortSignal,
    limitMs: number,
  ) =>
    new Promise<boolean>((resolve) => {
      if (!contents.isLoading()) {
        resolve(true);
        return;
      }
      const done = (value: boolean) => {
        clearTimeout(timer);
        contents.removeListener('did-stop-loading', onStop);
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      };
      const onStop = () => done(true);
      const onAbort = () => done(false);
      const timer = setTimeout(() => done(false), limitMs);
      contents.once('did-stop-loading', onStop);
      signal.addEventListener('abort', onAbort);
    });

  // Get a tab ready for the assistant to look at (read-only). A sleeping tab is
  // woken up (hidden) first, and we wait for it to finish loading.
  const prepareTab = async (
    tabId: number,
    signal: AbortSignal,
  ): Promise<
    | { ok: true; contents: Electron.WebContents }
    | { ok: false; reason: 'closed' | 'timeout' }
  > => {
    const tab = model.findTab(state, tabId);
    if (!tab) return { ok: false, reason: 'closed' };
    const wasAsleep = !views.has(tabId);
    const contents = ensureView(tab).webContents;
    if (wasAsleep) sendState();
    if (contents.isDestroyed()) return { ok: false, reason: 'closed' };
    if (!(await waitForLoad(contents, signal, 15_000))) {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: true, contents };
  };

  // The text of a tab.
  const readTab = async (
    tabId: number,
    signal: AbortSignal,
  ): Promise<PageRead> => {
    const ready = await prepareTab(tabId, signal);
    if (!ready.ok) return ready;
    try {
      const page = await readPageText(ready.contents);
      return { ok: true, ...page };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };

  // The outline of a tab: its controls, as a numbered list.
  const outlineTab = async (
    tabId: number,
    signal: AbortSignal,
  ): Promise<OutlineRead> => {
    const ready = await prepareTab(tabId, signal);
    if (!ready.ok) return ready;
    try {
      const { nodes, sensitive } = await readAccessibilityTree(ready.contents);
      const outline = buildOutline(nodes, sensitive);
      return {
        ok: true,
        title: ready.contents.getTitle(),
        url: ready.contents.getURL(),
        lines: outline.lines,
        count: outline.elements.length,
        truncated: outline.truncated,
        elements: outline.elements,
      };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };

  // ---- Acting in a tab for the assistant ------------------------------------------
  // (Whether an action may happen at all, and your approval, are decided before
  // anything here runs: see agentActions.ts and chatRunner.ts.)

  // Tabs the assistant is working in right now (shown with a marker, and no
  // downloads are allowed from them).
  const working = new Set<number>();
  const setWorking = (tabId: number, on: boolean) => {
    if (on) working.add(tabId);
    else working.delete(tabId);
    sendState();
  };
  session.defaultSession.on('will-download', (event, _item, contents) => {
    const tabId = [...views].find(([, v]) => v.webContents === contents)?.[0];
    if (tabId !== undefined && working.has(tabId)) event.preventDefault();
  });

  const pause = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      }
      signal.addEventListener('abort', done);
    });

  // After an action, give the page a moment to react, then wait while it loads.
  const settle = async (
    contents: Electron.WebContents,
    signal: AbortSignal,
  ) => {
    await pause(500, signal);
    if (!contents.isDestroyed()) await waitForLoad(contents, signal, 10_000);
  };

  // Show the tab the assistant is acting in, so you can see what it does. The
  // keyboard stays in the chat, not in the page.
  const focusTab = (tabId: number) => {
    const active = state.active;
    if (!model.findTab(state, tabId)) return;
    if (!(active?.kind === 'tab' && active.id === tabId && pageIsShown())) {
      select({ kind: 'tab', id: tabId });
    }
    win.webContents.focus();
  };

  const finished = (contents: Electron.WebContents): ActionResult => ({
    ok: true,
    url: contents.getURL(),
    title: contents.getTitle(),
  });

  // Do something in a tab's page through the debugger, then let it settle.
  const actOn = async (
    tabId: number,
    signal: AbortSignal,
    work: (cdp: Cdp) => Promise<DoneResult>,
  ): Promise<ActionResult> => {
    const ready = await prepareTab(tabId, signal);
    if (!ready.ok) return ready;
    focusTab(tabId);
    let done: DoneResult;
    try {
      done = await withCdp(ready.contents, 15_000, async (cdp) => {
        // Act as if the page has the keyboard, even though the chat does.
        await cdp
          .send('Emulation.setFocusEmulationEnabled', { enabled: true })
          .catch(() => undefined);
        return work(cdp);
      });
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    if (!done.ok) return done;
    await settle(ready.contents, signal);
    return finished(ready.contents);
  };

  const actionEnv: ActionEnv = {
    tabUrl: (tabId) => model.findTab(state, tabId)?.url ?? null,
    click: (tabId, control, signal) =>
      actOn(tabId, signal, (cdp) => clickControl(cdp, control.backendNodeId)),
    typeText: (tabId, control, text, signal) =>
      actOn(tabId, signal, (cdp) =>
        typeIntoControl(cdp, control.backendNodeId, text),
      ),
    pressKey: (tabId, key, signal) =>
      actOn(tabId, signal, (cdp) => pressKeyInPage(cdp, key)),
    scroll: (tabId, direction, signal) =>
      actOn(tabId, signal, (cdp) => scrollPage(cdp, direction)),
    selectOption: (tabId, control, option, signal) =>
      actOn(tabId, signal, (cdp) =>
        chooseOption(cdp, control.backendNodeId, option),
      ),
    goTo: async (tabId, url, signal) => {
      const ready = await prepareTab(tabId, signal);
      if (!ready.ok) return ready;
      focusTab(tabId);
      // A redirect can cancel the first load; the page still ends up somewhere.
      void ready.contents.loadURL(url).catch(() => undefined);
      await pause(300, signal);
      if (!(await waitForLoad(ready.contents, signal, 15_000))) {
        return { ok: false, reason: 'timeout' };
      }
      return finished(ready.contents);
    },
    goBack: async (tabId, signal) => {
      const ready = await prepareTab(tabId, signal);
      if (!ready.ok) return ready;
      focusTab(tabId);
      const history = ready.contents.navigationHistory;
      if (!history.canGoBack()) return { ok: false, reason: 'blocked' };
      history.goBack();
      await settle(ready.contents, signal);
      return finished(ready.contents);
    },
    // A new tab for the assistant, shown straight away (it is about to act in it).
    openTab: async (url, signal) => {
      const created = model.addTab(state, {
        url,
        spaceId: currentSpaceId(),
      });
      commitAndShow(revealPage(created.state));
      win.webContents.focus();
      const ready = await prepareTab(created.id, signal);
      if (!ready.ok) return { ok: false, reason: 'timeout' };
      return {
        ok: true,
        tabId: created.id,
        url: ready.contents.getURL(),
        title: ready.contents.getTitle(),
      };
    },
    setWorking,
  };

  // Talking to the model: sending messages and streaming replies into the chats.
  chatService = createChatService({
    win,
    llm: llm.catch(() => null),
    getChats: () => chats,
    getWorkspace: workspace,
    readPage: readTab,
    outlinePage: outlineTab,
    // Where a numbered link goes (its full address, read from the page).
    linkAddress: async (tabId, control, signal) => {
      const ready = await prepareTab(tabId, signal);
      if (!ready.ok) return null;
      try {
        return await withCdp(ready.contents, 8000, (cdp) =>
          readLinkAddress(cdp, control.backendNodeId),
        );
      } catch {
        return null;
      }
    },
    actions: actionEnv,
    toolLevel: (tool) => levelFor(toolSettings, tool),
    search: search.catch(() => null),
    linkTab: (chatId, tabId) => {
      const tab = model.findTab(state, tabId);
      if (!tab) return;
      commitChats(
        chatsModel.addRef(chats, chatId, {
          kind: 'tab',
          id: tabId,
          title: tab.title,
          url: tab.url,
        }),
      );
    },
    // Every piece of a streaming reply lands here: save soon, but do not rebuild
    // the whole UI each time.
    setChats: (next) => {
      chats = next;
      chatsSaver.schedule();
    },
    onMeta: sendState,
    openSettings,
    popupMenu: (menu) => popupMenu(menu),
  });
  llm
    .then((context) => {
      llmContext = context;
      context.onChange(sendState); // The chat follows key and model changes.
      sendState();
    })
    .catch(() => undefined);

  const deleteChat = async (id: number) => {
    const chat = chatsModel.findConversation(chats, id);
    if (!chat) return;
    // Nothing to lose in an empty chat; otherwise ask first.
    if (
      chat.messages.length > 0 &&
      !(await confirm({
        title: 'Delete chat',
        message: `Delete “${chat.title}”?`,
        detail: `Its ${chat.messages.length} message${chat.messages.length === 1 ? '' : 's'} will be deleted. It cannot be undone.`,
        button: 'Delete chat',
      }))
    ) {
      return;
    }
    // A reply still being written must stop before its chat goes.
    chatService?.stop(id);
    // The chat may have changed while the dialog was open.
    commitChats(chatsModel.deleteConversation(chats, id));
  };

  const chatMenuActions: ChatMenuActions = {
    selectChat: (id) =>
      commitChats(chatsModel.setActiveConversation(chats, id)),
    newChat: () => commitChats(chatsModel.newConversation(chats).state),
    // The chat's name becomes a text box. With only the chat open, the chat list
    // is in the sidebar (which must be open to show the box); otherwise the
    // title is in the chat bar.
    renameChat: (id) => {
      const inSidebar = state.settings.viewMode === 'chat';
      const target = inSidebar ? sidebar : win.webContents;
      if (target.isDestroyed()) return;
      if (inSidebar && !pinned()) setHover(true);
      target.send('chats:begin-rename', id);
      target.focus(); // So the box can take keyboard input.
    },
    deleteChat: (id) => void deleteChat(id),
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
    ungroupSpace: (spaceId) => {
      syncLinkSnapshots(); // The Space goes away; links to it remember its name.
      commitAndShow(model.ungroupSpace(state, spaceId));
    },
    deleteSpace: (spaceId) => void deleteSpace(spaceId),
  };

  const select = (ref: ActiveRef) =>
    commitAndShow(revealPage(model.setActive(state, ref)));

  // Expand the chat, or shrink it back to the compact bar. If the chat is
  // closed, or fills the window, bring back the page with the chat instead.
  const toggleChat = () => {
    const settings = state.settings;
    state =
      settings.viewMode === 'both'
        ? model.setChatExpanded(state, !settings.chatExpanded)
        : model.setViewMode(state, 'both');
    saver.schedule();
    applyLayout(true);
    showActive();
  };

  // How far a part of the frame may be dragged while the mouse is down.
  const sizeWhileDragging = (kind: ResizeKind, size: number) => {
    if (kind === 'sidebar') {
      return clamp(SIDEBAR_COLLAPSED_WIDTH, model.SIDEBAR_MAX_WIDTH, size);
    }
    if (kind === 'chat') return chatHeightWhileDragging(size, windowSize());
    return panelWidthWhileDragging(size, { left: now.left }, windowSize());
  };

  // The Space the user is "in": where Ctrl+T puts a new tab.
  const currentSpaceId = (): number | null => {
    const active = state.active;
    if (active?.kind === 'lead') return active.spaceId;
    if (active?.kind === 'tab')
      return model.findTab(state, active.id)?.spaceId ?? null;
    if (active?.kind === 'artifact')
      return (
        state.artifactTabs.find((t) => t.artifactId === active.id)?.spaceId ??
        null
      );
    return null;
  };

  // Keyboard shortcuts: Ctrl+T new tab, Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab
  // next / previous, Ctrl+J expand / shrink the chat. Attached to both UI pages
  // and to every web page.
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
      else if (state.active?.kind === 'artifact') {
        commitAndShow(
          withSomethingActive(model.closeArtifactTab(state, state.active.id)),
        );
      }
    } else if (key === 'j') {
      event.preventDefault();
      toggleChat();
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
      if (url === '') return;
      void views.get(id)?.webContents.loadURL(url);
      // Going somewhere while the chat fills the window brings the page back.
      commitAndShow(revealPage(state));
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
        revealPage(
          model.setActive(created.state, { kind: 'lead', spaceId: created.id }),
        ),
      );
    },
    'space:collapse': (id, collapsed) => {
      if (isId(id) && typeof collapsed === 'boolean') {
        commit(model.setSpaceCollapsed(state, id, collapsed));
      }
    },
    'artifact:open': (id) => {
      if (isId(id)) openArtifact(id);
    },
    'artifact:select': (id) => {
      if (isId(id)) select({ kind: 'artifact', id });
    },
    'artifact:close': (id) => {
      if (isId(id))
        commitAndShow(withSomethingActive(model.closeArtifactTab(state, id)));
    },
    'artifact:rename': (id, title) => {
      if (!isId(id) || typeof title !== 'string') return;
      const result = artifactsModel.updateArtifact(
        artifacts,
        id,
        { title },
        Date.now(),
      );
      if (result.ok) commitArtifacts(result.state);
    },
    'artifact:move': (id, spaceId) => {
      if (!isId(id)) return;
      if (
        spaceId !== null &&
        !(isId(spaceId) && model.findSpace(state, spaceId))
      )
        return;
      const result = artifactsModel.updateArtifact(
        artifacts,
        id,
        { spaceId },
        Date.now(),
      );
      if (result.ok) commitArtifacts(result.state);
    },
    'artifact:delete': (id) => {
      if (isId(id)) void deleteArtifact(id);
    },
    'space:rename': (id, name) => {
      if (isId(id) && typeof name === 'string')
        commit(model.renameSpace(state, id, name));
    },
    // A link in one of the assistant's replies was clicked: open it as a new tab.
    'ui:open-url': (url) => {
      if (
        typeof url === 'string' &&
        url.length <= 2000 &&
        model.isWebUrl(url)
      ) {
        openTab(url, currentSpaceId());
      }
    },
    'sidebar:hover': () => {
      if (!pinned() && drag === null) setHover(true);
    },
    // Asked for from the chat itself: keep the keyboard in the chat, rather than
    // moving it to the web page (so typing carries on where it was).
    'chat:toggle': () => {
      toggleChat();
      win.webContents.focus();
    },
    // Show the page alone (chat closed), both, or the chat alone (page hidden).
    'view:set': (mode) => {
      if (!model.VIEW_MODES.includes(mode as model.ViewMode)) return;
      commitAndShow(model.setViewMode(state, mode as model.ViewMode));
    },
    'panel:open': (panel) => {
      if (panel === 'settings') openSettings();
      else if (panel === 'artifacts') {
        state = model.setRightPanel(state, 'artifacts');
        saver.schedule();
        applyLayout(true);
        sendState();
      }
    },
    'panel:toggle': (panel) => {
      if (!model.RIGHT_PANELS.includes(panel as model.RightPanel)) return;
      const open = state.settings.rightPanel === panel;
      state = model.setRightPanel(
        state,
        open ? null : (panel as model.RightPanel),
      );
      saver.schedule();
      applyLayout(true);
      sendState();
    },
    // Dragging an edge of the frame (the sidebar, the chat or the right panel).
    // While you drag, that part follows the mouse exactly; the others slide to
    // make room. On release it either snaps (to the icon strip, the compact
    // chat bar, or closed) or stays at the size you chose, which is remembered.
    'resize:start': (kind) => {
      if (!isResizeKind(kind) || drag !== null) return;
      // The chat can only be dragged while it shares the window with the page.
      if (kind === 'chat' && state.settings.viewMode !== 'both') return;
      stopAnimation();
      drag = {
        kind,
        size:
          kind === 'sidebar'
            ? now.sidebar
            : kind === 'chat'
              ? now.chat
              : now.panel,
        startedPinned: pinned(),
      };
    },
    'resize:move': (kind, size) => {
      if (!isResizeKind(kind) || drag === null || drag.kind !== kind) return;
      if (!isNumber(size)) return;
      drag.size = sizeWhileDragging(kind, size);
      applyLayout(false);
    },
    'resize:end': (kind, size) => {
      if (!isResizeKind(kind) || drag === null || drag.kind !== kind) return;
      const final = sizeWhileDragging(kind, isNumber(size) ? size : drag.size);
      drag = null;
      if (kind === 'sidebar') {
        // Near the left edge: back to the icon strip. Anywhere else: pinned open
        // at that width.
        hover = false;
        stopWatching();
        state =
          final < SIDEBAR_SNAP_WIDTH
            ? model.setSidebarPinned(state, false)
            : model.setSidebarWidth(model.setSidebarPinned(state, true), final);
      } else if (kind === 'chat') {
        const result = settleChat(final, windowSize());
        state = result.expanded
          ? model.setChatHeight(
              model.setChatExpanded(state, true),
              result.height,
            )
          : model.setChatExpanded(state, false);
      } else {
        const result = settlePanel(final, { left: now.left }, windowSize());
        state = result.open
          ? model.setPanelWidth(state, result.width)
          : model.setRightPanel(state, null);
      }
      saver.schedule();
      applyLayout(true);
      sendState();
    },
    // Linking Spaces and tabs to a chat. Only things that exist can be linked.
    'chats:link': (chatId, kind, id) => {
      if (!isId(chatId) || !isLinkKind(kind) || !isId(id)) return;
      const found = snapshotLookup(workspace())(kind, id);
      if (!found) return;
      commitChats(
        chatsModel.addRef(chats, chatId, {
          kind,
          id,
          title: found.title,
          url: found.url,
        }),
      );
    },
    'chats:unlink': (chatId, kind, id) => {
      if (!isId(chatId) || !isLinkKind(kind) || !isId(id)) return;
      commitChats(chatsModel.removeRef(chats, chatId, kind, id));
    },
    // Clicking a link chip jumps to that tab, or to that Space's overview.
    'chats:open-link': (kind, id) => {
      if (!isLinkKind(kind) || !isId(id)) return;
      if (kind === 'tab' && model.findTab(state, id)) {
        select({ kind: 'tab', id });
      } else if (kind === 'space' && model.findSpace(state, id)) {
        select({ kind: 'lead', spaceId: id });
      }
    },
    // Bring a closed tab back (as a new, ungrouped tab) and point every chat's
    // link to it at the new tab.
    'chats:reopen-link': (chatId, id) => {
      if (!isId(chatId) || !isId(id)) return;
      // The link may have been removed from the chat since; an old message's
      // token still remembers the address.
      const conversation = chatsModel.findConversation(chats, chatId);
      const ref =
        conversation?.refs.find((r) => r.kind === 'tab' && r.id === id) ??
        conversation?.messages
          .flatMap((m) => m.mentions)
          .find((x) => x.kind === 'tab' && x.id === id);
      // Only for a closed tab whose address was remembered.
      if (!ref || !ref.url || model.findTab(state, id)) return;
      const created = model.addTab(state, { url: ref.url, spaceId: null });
      commitAndShow(revealPage(created.state));
      const reopened = { id: created.id, title: ref.title, url: ref.url };
      // Every chat that used the page follows it to the new tab: links and the
      // tokens in old messages. A link you had removed is not added back.
      commitChats(chatsModel.retargetEverywhere(chats, 'tab', id, reopened));
      chatService?.refreshMentions(); // Show the live tokens without a reload.
    },
    'chats:new': () => chatMenuActions.newChat(),
    'chats:select': (id) => {
      if (isId(id)) chatMenuActions.selectChat(id);
    },
    'chats:rename': (id, title) => {
      if (isId(id) && typeof title === 'string') {
        commitChats(chatsModel.renameConversation(chats, id, title));
      }
    },
    'chats:delete': (id) => {
      if (isId(id)) void deleteChat(id);
    },
    'chats:menu': (id) => {
      if (id === undefined || id === null) {
        popupMenu(chatMenu(chats, chatMenuActions));
      } else if (isId(id) && chatsModel.findConversation(chats, id)) {
        popupMenu(chatRowMenu(id, chatMenuActions));
      }
    },
    'tab:menu': (id) => {
      if (isId(id)) popupMenu(tabMenu(state, id, menuActions));
    },
    'space:menu': (id) => {
      if (isId(id)) popupMenu(spaceMenu(state, id, menuActions));
    },
  };
  // A UI page says it is listening and asks for the current state. That, not
  // the page's "finished loading" event (which can come before the page is
  // listening, or long after), is what marks the page ready for messages.
  const listening = new Set<Electron.WebContents>();
  const onUiReady = (event: Electron.IpcMainEvent) => {
    if (event.sender === win.webContents || event.sender === sidebar) {
      listening.add(event.sender);
      ready.add(event.sender);
      sendState();
    }
  };
  ipcMain.on('ui:ready', onUiReady);

  const listeners = Object.entries(requests).map(([channel, handle]) => {
    const listener = (event: Electron.IpcMainEvent, ...args: unknown[]) => {
      if (event.sender === win.webContents || event.sender === sidebar) {
        handle(...args);
      }
    };
    ipcMain.on(channel, listener);
    return { channel, listener };
  });

  // The Tools panel asks for the tools and their levels, and changes them. A
  // change applies from the assistant's next reply.
  const fromWindow = (event: Electron.IpcMainInvokeEvent) =>
    event.sender === win.webContents;
  ipcMain.handle('tools:list', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return describeTools(toolSettings);
  });
  ipcMain.handle('tools:set', (event, tool: unknown, level: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (typeof tool === 'string' && isApprovalLevel(level)) {
      toolSettings = withLevel(toolSettings, tool, level);
      toolsSaver.schedule();
    }
    return describeTools(toolSettings);
  });
  // The editor loads an artifact's text when it opens, and saves as you type.
  ipcMain.handle('artifact:read', (event, id: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const found = isId(id)
      ? artifactsModel.findArtifact(artifacts, id)
      : undefined;
    return found
      ? {
          id: found.id,
          title: found.title,
          kind: found.kind,
          content: found.content,
        }
      : null;
  });
  ipcMain.handle('artifact:write', (event, id: unknown, content: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (!isId(id) || typeof content !== 'string') return false;
    const result = artifactsModel.updateArtifact(
      artifacts,
      id,
      { content },
      Date.now(),
    );
    if (!result.ok) return false;
    commitArtifacts(result.state);
    return true;
  });
  ipcMain.handle(
    'artifact:create',
    (event, kind: unknown, title: unknown, spaceId: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (
        spaceId !== null &&
        !(isId(spaceId) && model.findSpace(state, spaceId))
      )
        return null;
      const result = artifactsModel.createArtifact(
        artifacts,
        {
          kind: typeof kind === 'string' ? kind : '',
          title: typeof title === 'string' ? title : '',
          spaceId: spaceId as number | null,
        },
        Date.now(),
      );
      if (!result.ok) return null;
      commitArtifacts(result.state);
      return result.artifact.id;
    },
  );
  ipcMain.handle('tools:reset', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    toolSettings = defaultToolSettings();
    toolsSaver.schedule();
    return describeTools(toolSettings);
  });

  win.on('resize', () => applyLayout(false));
  // The window's size can still settle a moment after it appears (when it is
  // first shown, maximized or restored), so lay the frame out again then.
  const relayout = () => {
    if (!win.isDestroyed()) applyLayout(false);
  };
  win.on('show', relayout);
  win.on('maximize', relayout);
  win.on('unmaximize', relayout);
  win.on('restore', relayout);
  win.on('enter-full-screen', relayout);
  win.on('leave-full-screen', relayout);
  win.webContents.on('did-finish-load', relayout);
  const startupTimers = [300, 1000].map((ms) => setTimeout(relayout, ms));

  win.webContents.on('before-input-event', handleShortcut);
  sidebar.on('before-input-event', handleShortcut);

  // Send the first state once each UI page is ready to listen. (Reading the save
  // file takes a moment, so the main window's page may already have loaded.)
  watchUi(win.webContents);
  watchUi(sidebar);
  // The main window's page may have finished loading (and asked for its state)
  // while the save files were being read, before anyone was listening for that
  // request. Send it the state now so it is not left blank.
  if (!win.webContents.isLoading()) {
    ready.add(win.webContents);
    sendState();
  }
  void loadUi(sidebar, 'sidebar');

  // While developing, the dev server sometimes rebuilds its bundled libraries just
  // as the app starts, and a page that loads in that moment fails to start (it
  // never asks for its state). If a page has not checked in after a few seconds,
  // load it again (a few tries at most).
  let reloadsLeft = 6;
  const watchdog = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(watchdog);
      return;
    }
    const pages = [win.webContents, sidebar];
    if (pages.every((page) => listening.has(page))) {
      clearInterval(watchdog);
      return;
    }
    for (const page of pages) {
      if (
        !listening.has(page) &&
        !page.isDestroyed() &&
        !page.isLoading() &&
        reloadsLeft > 0
      ) {
        reloadsLeft--;
        console.warn('[ui] a page did not start; loading it again');
        page.reload();
      }
    }
  }, 3000);

  // Save for sure when the window closes (a plain write might not finish).
  win.on('close', () => {
    // Stop any reply still being written. (A reply cut off like this is saved as
    // it stands and marked "stopped" the next time the app starts.)
    chatService?.dispose();
    saver.flushSync();
    chatsSaver.flushSync();
    toolsSaver.flushSync();
    artifactsSaver.flushSync();
  });
  win.on('closed', () => {
    stopAnimation();
    stopWatching();
    for (const timer of startupTimers) clearTimeout(timer);
    ipcMain.removeListener('ui:ready', onUiReady);
    ipcMain.removeHandler('tools:list');
    ipcMain.removeHandler('tools:set');
    ipcMain.removeHandler('tools:reset');
    ipcMain.removeHandler('artifact:create');
    ipcMain.removeHandler('artifact:read');
    ipcMain.removeHandler('artifact:write');
    clearInterval(watchdog);
    for (const { channel, listener } of listeners)
      ipcMain.removeListener(channel, listener);
  });

  applyLayout(false);
  showActive();
}
