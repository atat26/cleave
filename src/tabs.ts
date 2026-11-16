import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  screen,
  session,
  shell,
  WebContentsView,
} from 'electron';
import path from 'node:path';
import {
  blendSizes,
  chatHeightWhileDragging,
  easeOutCubic,
  fitCentre,
  pageRect,
  panelWidthWhileDragging,
  restingChatHeight,
  settleChat,
  settlePanel,
} from './frame';
import type { FrameSizes, Size } from './frame';
import type { ChatNeed } from './layout';
import {
  DEFAULT_CHAT_EMOJI,
  DEFAULT_SPACE_EMOJI,
  defaultArtifactEmoji,
  emojiOr,
} from './emoji';
import { nextRegion } from './regions';
import type { Region } from './regions';
import {
  FRAME_ANIMATION_MS,
  CONTROLS_SYMBOL,
  CONTROLS_SYMBOL_DARK,
  FRAME_COLOR,
  FRAME_COLOR_DARK,
  PAGE_RADIUS,
  SIDEBAR_CLOSE_MARGIN,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_SNAP_WIDTH,
} from './layout';
import * as artifactsModel from './artifacts';
import type { ArtifactsState } from './artifacts';
import * as chatsModel from './chats';
import type { ChatRef, ChatsState } from './chats';
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
import { createNamer } from './aiNamer';
import { findBarRect } from './findBar';
import { registerDownloads } from './downloadManager';
import {
  clearFinished,
  defaultDownloads,
  downloadSummary,
  parseDownloads,
  RECENT_MS,
} from './downloadList';
import {
  defaultDownloadSettings,
  parseDownloadSettings,
  withDownloadSettings,
} from './downloadSettings';
import {
  ASK_KINDS,
  classify,
  decide,
  defaultPermissions,
  parsePermissions,
  resetSite,
  setAnswer,
  siteKey,
  siteRows,
} from './permissions';
import type { AskKind } from './permissions';
import {
  canProceed,
  certErrorCode,
  certErrorUrl,
  isCertError,
  parseCertLink,
} from './certPage';
import { describeSite } from './site';
import { cookieIsOfSite, siteDataGroups } from './siteData';
import {
  defaultFavicons,
  faviconFor,
  parseFavicons,
  rememberFavicon,
} from './favicons';
import { MAX_SUGGESTIONS, suggest, suggestRect } from './suggest';
import type { Suggestion, SuggestionKind } from './suggest';
import {
  addBookmark,
  defaultBookmarks,
  isBookmarked,
  parseBookmarks,
  removeBookmark,
  removeBookmarkByUrl,
  searchBookmarks,
} from './bookmarks';
import {
  defaultLibrarySettings,
  parseLibrarySettings,
  withLibrarySettings,
} from './librarySettings';
import {
  addVisit,
  clearHistory,
  defaultHistory,
  historyUrl,
  parseHistory,
  pruneHistory,
  removeVisit,
  searchHistory,
  setVisitTitle,
} from './history';
import {
  clearClosed,
  defaultClosed,
  parseClosed,
  recordClosed,
  takeClosedById,
  takeLastClosed,
} from './recentlyClosed';
import type { ClosedTab } from './recentlyClosed';
import {
  defaultZoomSettings,
  parseZoomSettings,
  stepZoom,
  withSiteZoom,
  zoomFor,
  zoomHost,
  zoomLabel,
} from './zoom';
import type { NameResult } from './naming';
import { createChatService } from './chatService';
import type { ChatService } from './chatService';
import { snapshotLookup } from './chatLinks';
import type { Workspace } from './chatLinks';
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
import { defaultNamingSettings, parseNamingSettings } from './namingSettings';
import {
  defaultThemeSettings,
  isThemeChoice,
  parseThemeSettings,
} from './themeSettings';
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
import { resolveInput, searchUrl } from './url';
import {
  addMenuItems,
  artifactMenuItems,
  chatRowMenuItems,
  emojiPickerItems,
  parseEmojiChoice,
  chatSwitchMenuItems,
  editMenuItems,
  linkMenuItems,
  pageImageMenuItems,
  pageLinkMenuItems,
  pageMenuItems,
  pageSelectionMenuItems,
  parsePageChoice,
  parseToolsChoice,
  toolsMenuItems,
  zoomChipMenuItems,
  downloadMenuItems,
  libraryMenuItems,
  parsePermissionChoice,
  parsePrivacyChoice,
  parseSiteChoice,
  privacyDataMenuItems,
  privacySiteMenuItems,
  permissionPromptItems,
  siteMenuItems,
  parseDownloadChoice,
  parseLibraryChoice,
  parseStarChoice,
  starMenuItems,
  parseAddChoice,
  parseArtifactChoice,
  parseChatChoice,
  parseEditChoice,
  parseLinkChoice,
  parseSpaceChoice,
  parseTabChoice,
  spaceMenuItems,
  tabMenuItems,
} from './menuData';
import type {
  ChatMenuActions,
  EmojiChoice,
  MenuActions,
  ToolsChoice,
} from './menuData';
import { isChoosable } from './menuTypes';

import type { MenuItem } from './menuTypes';

// What a new tab shows. Later this could become an AI chat / search page.
export const NEW_TAB_URL = 'https://duckduckgo.com';

const isId = (value: unknown): value is number => Number.isInteger(value);
const isIdOrNull = (value: unknown): value is number | null =>
  value === null || isId(value);
const isLinkKind = chatsModel.isLinkKind;
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
  // Light, dark or follow the computer. Every window (and web pages) follow it.
  const themeFile = path.join(app.getPath('userData'), 'theme.json');
  let themeSettings = await loadJson(
    themeFile,
    parseThemeSettings,
    defaultThemeSettings,
  );
  nativeTheme.themeSource = themeSettings.theme;
  // The window's own background shows at its edges (a thin line at the top
  // otherwise): keep it the frame's colour in either theme.
  const paintWindow = () => {
    if (win.isDestroyed()) return;
    const dark = nativeTheme.shouldUseDarkColors;
    win.setBackgroundColor(dark ? FRAME_COLOR_DARK : FRAME_COLOR);
    // The window buttons' colours follow the theme too.
    win.setTitleBarOverlay({
      color: dark ? FRAME_COLOR_DARK : FRAME_COLOR,
      symbolColor: dark ? CONTROLS_SYMBOL_DARK : CONTROLS_SYMBOL,
    });
  };
  paintWindow();
  nativeTheme.on('updated', paintWindow);
  win.on('closed', () => nativeTheme.off('updated', paintWindow));
  const themeSaver = createSaver(themeFile, () => themeSettings);
  if (win.isDestroyed()) return;

  // Artifact tabs only make sense for artifacts that still exist.
  state = model.reconcileArtifactTabs(state, artifacts.artifacts);

  // The first time ever (or after a reset) there is nothing: start with one tab.
  if (state.active === null) {
    state = model.addTab(state, { url: NEW_TAB_URL }).state;
  }

  const views = new Map<number, WebContentsView>();
  // Tabs saved from last time: the page loaded when one wakes up is not a visit.
  const restoredLoads = new Set(state.tabs.map((t) => t.id));
  const saver = createSaver(file, () => state);
  const chatsSaver = createSaver(chatsFile, () => chats);
  const artifactsSaver = createSaver(artifactsFile, () => artifacts);

  // The AI connection (key, model, pins, system prompt) and the chat service that
  // talks to the model. Both are set up a little later than the window.
  let llmContext: LlmContext | null = null;
  let chatService: ChatService | null = null;
  // Names things with the model (chats, Spaces, artifacts).
  const namer = createNamer(() => llmContext);
  // Whether new chats are named on their own (Settings > Naming).
  const namingFile = path.join(app.getPath('userData'), 'naming.json');
  let namingSettings = await loadJson(
    namingFile,
    parseNamingSettings,
    defaultNamingSettings,
  );
  const namingSaver = createSaver(namingFile, () => namingSettings);
  // The zoom of each site (see zoom.ts).
  const zoomFile = path.join(app.getPath('userData'), 'zoom.json');
  let zoomSettings = await loadJson(
    zoomFile,
    parseZoomSettings,
    defaultZoomSettings,
  );
  const zoomSaver = createSaver(zoomFile, () => zoomSettings);
  // Browsing history and the tabs you closed recently (see history.ts and
  // recentlyClosed.ts).
  const libraryFile = path.join(app.getPath('userData'), 'library.json');
  let librarySettings = await loadJson(
    libraryFile,
    parseLibrarySettings,
    defaultLibrarySettings,
  );
  const librarySaver = createSaver(libraryFile, () => librarySettings);
  const historyFile = path.join(app.getPath('userData'), 'history.json');
  let history = await loadJson(
    historyFile,
    (raw) => parseHistory(raw, Date.now(), librarySettings.historyDays),
    defaultHistory,
  );
  // The Library panel asks again when history or the closed list changes (at most a
  // few times a second).
  let libraryTimer: ReturnType<typeof setTimeout> | null = null;
  const libraryChanged = () => {
    if (libraryTimer !== null) return;
    libraryTimer = setTimeout(() => {
      libraryTimer = null;
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('library:changed');
      }
    }, 300);
  };
  const historySaver = createSaver(historyFile, () => history);
  // The pages you bookmarked (see bookmarks.ts).
  const bookmarksFile = path.join(app.getPath('userData'), 'bookmarks.json');
  let bookmarks = await loadJson(
    bookmarksFile,
    parseBookmarks,
    defaultBookmarks,
  );
  const bookmarksSaver = createSaver(bookmarksFile, () => bookmarks);
  // What sites may do (camera, location...): see permissions.ts.
  const permissionsFile = path.join(
    app.getPath('userData'),
    'permissions.json',
  );
  let permissions = await loadJson(
    permissionsFile,
    parsePermissions,
    defaultPermissions,
  );
  const permissionsSaver = createSaver(permissionsFile, () => permissions);
  // The little pictures of the sites you open, for lists in Settings.
  const faviconsFile = path.join(app.getPath('userData'), 'favicons.json');
  let favicons = await loadJson(faviconsFile, parseFavicons, defaultFavicons);
  const faviconsSaver = createSaver(faviconsFile, () => favicons);
  // Remember a change, and tell Settings so its list is always up to date.
  const permissionsChanged = () => {
    permissionsSaver.schedule();
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('privacy:changed');
    }
  };
  // Downloads: the manager catches what pages download (see downloadManager.ts).
  const downloadsFile = path.join(app.getPath('userData'), 'downloads.json');
  let downloads = await loadJson(
    downloadsFile,
    (raw) => parseDownloads(raw, Date.now()),
    defaultDownloads,
  );
  const downloadsSaver = createSaver(downloadsFile, () => downloads);
  const downloadSettingsFile = path.join(
    app.getPath('userData'),
    'download-settings.json',
  );
  let downloadSettings = await loadJson(
    downloadSettingsFile,
    parseDownloadSettings,
    defaultDownloadSettings,
  );
  const downloadSettingsSaver = createSaver(
    downloadSettingsFile,
    () => downloadSettings,
  );
  const closedFile = path.join(app.getPath('userData'), 'closed-tabs.json');
  let closedTabs = await loadJson(closedFile, parseClosed, defaultClosed);
  const closedSaver = createSaver(closedFile, () => closedTabs);

  // The Spaces and tabs as the chat sees them (titles and addresses).
  const workspace = (): Workspace => ({
    tabs: state.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      spaceId: t.spaceId,
      closed: t.closed,
    })),
    spaces: state.spaces.map((s) => ({ id: s.id, name: s.name })),
    artifacts: artifacts.artifacts.map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      spaceId: a.spaceId,
    })),
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
  // A pinned sidebar goes back to the icon strip while the window is too narrow to
  // leave the middle wide enough (see fitCentre); it comes back when there is room.
  const stripForced = () =>
    fitCentre({
      window: windowSize(),
      sidebarPinned: state.settings.sidebarPinned,
      sidebarWidth: state.settings.sidebarWidth,
      panelOpen: state.settings.rightPanel !== null,
      panelWidth: state.settings.panelWidth,
    }).sidebarCollapsed;
  // Is the sidebar pinned open right now (as opposed to only opened by hovering)?
  const pinnedNow = () => pinned() && !stripForced();
  const expanded = () => pinnedNow() || hover;

  const activeTabId = () =>
    state.active?.kind === 'tab' ? state.active.id : null;
  // The active tab's live page, if it has one.
  const activePage = () => {
    const id = state.active?.kind === 'tab' ? state.active.id : null;
    const contents = id === null ? undefined : views.get(id)?.webContents;
    return contents && !contents.isDestroyed() ? contents : undefined;
  };

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

  // ---- The popup layer: a transparent page above everything, for menus -------
  //
  // Web pages are drawn by the system above the window's own page, so a menu
  // drawn in a page could be hidden behind one. This view is added last (and
  // again whenever another view is added), so it is always on top. It stays
  // hidden until a menu opens; then it covers the whole window.

  const popupView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  popupView.setBackgroundColor('#00000000');
  popupView.setVisible(false);
  win.contentView.addChildView(popupView);
  const popup = popupView.webContents;
  popup.setWindowOpenHandler(() => ({ action: 'deny' }));
  popup.on('will-navigate', (event) => event.preventDefault());

  // The find bar: a small view of our own over the top right of the page. Unlike
  // a menu it is only as big as the bar, so the page stays usable while it is open.
  const findView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  findView.setBackgroundColor('#00000000');
  findView.setVisible(false);
  const find = findView.webContents;
  find.setWindowOpenHandler(() => ({ action: 'deny' }));
  find.on('will-navigate', (event) => event.preventDefault());
  // The address-bar suggestions: another small view of our own, under the address
  // bar. It never takes the keyboard: you keep typing in the address bar, which
  // sends it the rows and which one is highlighted. Clicking a row picks it.
  const suggestView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  suggestView.setBackgroundColor('#00000000');
  suggestView.setVisible(false);
  const suggestPage = suggestView.webContents;
  suggestPage.setWindowOpenHandler(() => ({ action: 'deny' }));
  suggestPage.on('will-navigate', (event) => event.preventDefault());
  // The rows on show now (what a pick means is decided from these, not from what
  // the page says).
  let suggestRows: Suggestion[] = [];
  let suggestShown = false;
  let suggestReady = false;
  let suggestWhenReady: (() => void) | null = null;
  // The tab being searched (null: the bar is closed).
  let findTabId: number | null = null;
  let findReady = false;
  let findWhenReady: (() => void) | null = null;
  // Keep the find bar above the pages and below the sidebar and the popup layer.
  const restack = () => {
    if (findTabId !== null) win.contentView.addChildView(findView);
    if (suggestShown) win.contentView.addChildView(suggestView);
    win.contentView.addChildView(sidebarView);
    win.contentView.addChildView(popupView);
  };
  // The popup page says when it is listening, so a menu is never sent too early.
  let popupReady = false;
  let waitingForPopup: (() => void) | null = null;
  // The menu that is open now: what it holds, what a choice does, and which page
  // had the keyboard (it gets it back).
  // Which UI page sent the request being handled right now (so a menu it opens
  // gives the keyboard back to it).
  let requestSender: Electron.WebContents | null = null;
  let openMenu: {
    items: MenuItem[];
    choose: (id: string) => void;
    opener: Electron.WebContents;
    // Called when the menu closes without anything being chosen.
    dismissed?: () => void;
    // What is drawn, so a card can be sent again with changes.
    shown: {
      items: MenuItem[];
      x: number;
      y: number;
      panel?: 'prompt' | 'site';
    };
  } | null = null;

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

  // What the chat on screen needs (a reply being written, an approval waiting): the
  // chat page tells us, and the frame makes room for it.
  let chatNeed: ChatNeed = 'none';

  // Where each part of the frame should be right now.
  const targetSizes = (): FrameSizes => {
    const s = state.settings;
    const window = windowSize();
    const fit = fitCentre({
      window,
      sidebarPinned: s.sidebarPinned,
      sidebarWidth: s.sidebarWidth,
      panelOpen: s.rightPanel !== null,
      panelWidth: s.panelWidth,
    });
    const sizes: FrameSizes = {
      sidebar: expanded() ? s.sidebarWidth : SIDEBAR_COLLAPSED_WIDTH,
      left: fit.left,
      panel: fit.panel,
      chat: restingChatHeight(
        s.viewMode,
        s.chatExpanded,
        s.chatHeight,
        window,
        chatNeed,
      ),
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
        sidebar: Math.round(now.sidebar),
        panel: Math.round(now.panel),
        chat: Math.round(now.chat),
      };
      win.webContents.send('ui:layout', layout);
    }
  };

  // Sites whose certificate is wrong: the tab showing the warning page, and the
  // sites you chose to go on to anyway (until the app closes).
  const certErrors = new Map<
    number,
    { url: string; code: number; host: string }
  >();
  const certAllowed = new Set<string>();
  // Is this address on a site you went on to despite its certificate? (It is never
  // shown as secure.)
  const certBypassed = (address: string | undefined): boolean => {
    try {
      return (
        address !== undefined && certAllowed.has(new URL(address).hostname)
      );
    } catch {
      return false;
    }
  };

  const sendState = () => {
    if (win.isDestroyed()) return;
    const id = activeTabId();
    const history =
      id === null ? undefined : views.get(id)?.webContents.navigationHistory;
    const generating = chatService?.runningChats() ?? [];
    const ui: UiState = {
      spaces: state.spaces.map(({ id, name, color, emoji, collapsed }) => ({
        id,
        name,
        emoji: emojiOr(emoji, DEFAULT_SPACE_EMOJI),
        color,
        collapsed,
      })),
      artifactTabs: state.artifactTabs.flatMap((t) => {
        const a = artifactsModel.findArtifact(artifacts, t.artifactId);
        return a
          ? [
              {
                id: a.id,
                title: a.title,
                emoji: emojiOr(a.emoji, defaultArtifactEmoji(a.kind)),
                kind: a.kind,
                spaceId: t.spaceId,
              },
            ]
          : [];
      }),
      artifacts: artifacts.artifacts.map((a) => ({
        id: a.id,
        title: a.title,
        emoji: emojiOr(a.emoji, defaultArtifactEmoji(a.kind)),
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
        closed: tab.closed,
      })),
      active: state.active,
      zoom: Math.round((activePage()?.getZoomFactor() ?? 1) * 100) / 100,
      bookmarked: isBookmarked(bookmarks, activePage()?.getURL()),
      certBypassed: certBypassed(activePage()?.getURL()),
      downloads: downloadSummary(downloads, Date.now()),
      loading:
        id === null ? false : (views.get(id)?.webContents.isLoading() ?? false),
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
      sidebarPinned: pinned(),
      sidebarExpanded: expanded(),
      viewMode: state.settings.viewMode,
      chats: {
        conversations: chats.conversations.map((c) => ({
          id: c.id,
          title: c.title,
          emoji: emojiOr(c.emoji, DEFAULT_CHAT_EMOJI),
          updatedAt: c.updatedAt,
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
    syncFind();
    hideSuggest();
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
      if (!hover || pinnedNow() || drag !== null || busy > 0) {
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

  // Show a menu in the popup layer, at a place in the window. `choose` is called
  // with the id of the item picked. The sidebar does not close under it.
  // Where the last menu opened, so "Change icon…" can open the picker in the
  // same place.
  let lastMenu: { x: number; y: number; opener: Electron.WebContents } | null =
    null;
  // The emoji picker: choose an emoji (or the default) for something.
  const pickEmoji = (
    current: string | null,
    apply: (choice: EmojiChoice) => void,
  ) => {
    const at = lastMenu;
    if (!at) return;
    showMenu(
      emojiPickerItems(current),
      at.x,
      at.y,
      (id) => {
        const choice = parseEmojiChoice(id);
        if (choice) apply(choice);
      },
      at.opener,
      undefined,
      true,
    );
  };

  const showMenu = (
    items: MenuItem[],
    x: number,
    y: number,
    choose: (id: string) => void,
    opener: Electron.WebContents,
    alignCenter?: number,
    picker = false,
    dismissed?: () => void,
    panel?: 'prompt' | 'site',
  ) => {
    if (openMenu) closeMenu(false);
    openMenu = {
      items,
      choose,
      opener,
      dismissed,
      shown: { items, x, y, panel },
    };
    lastMenu = { x, y, opener };
    busy++;
    const send = () =>
      popup.send('popup:show', { items, x, y, alignCenter, picker, panel });
    const size = windowSize();
    popupView.setBounds({ x: 0, y: 0, width: size.width, height: size.height });
    popupView.setVisible(true);
    win.contentView.addChildView(popupView); // On top of everything.
    if (popupReady) send();
    else waitingForPopup = send;
    popup.focus();
  };

  const closeMenu = (giveBackKeyboard = true) => {
    if (!openMenu) return;
    const { opener, dismissed } = openMenu;
    openMenu = null;
    busy = Math.max(0, busy - 1);
    dismissed?.();
    waitingForPopup = null;
    if (!popup.isDestroyed()) popup.send('popup:hide');
    popupView.setVisible(false);
    if (giveBackKeyboard && !opener.isDestroyed()) opener.focus();
  };

  // ---- Web page views ----------------------------------------------------

  // A certificate problem is refused, unless it is on a site you chose to go on to
  // (and the problem is one that can be gone past).
  const onCertificateError = (
    event: Electron.Event,
    contents: Electron.WebContents,
    url: string,
    error: string,
    _certificate: Electron.Certificate,
    callback: (isTrusted: boolean) => void,
  ) => {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      // Not an address: refused below.
    }
    const code = certErrorCode(error);
    const allowed =
      host !== '' &&
      certAllowed.has(host) &&
      code !== null &&
      canProceed(code) &&
      [...views.values()].some((view) => view.webContents === contents);
    event.preventDefault();
    callback(allowed);
  };
  app.on('certificate-error', onCertificateError);
  // Reload a tab (from the warning page, the page it could not open).
  const reloadTab = (tabId: number, contents: Electron.WebContents) => {
    const failed = certErrors.get(tabId);
    if (failed) void contents.loadURL(failed.url);
    else contents.reload();
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
    // Adding an existing view again moves it to the top: keep the find bar, the
    // sidebar and the popup layer above it, in that order.
    restack();
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
    // The reload button turns into Stop while the page loads.
    contents.on('did-start-loading', () => sendState());
    contents.on('did-stop-loading', () => sendState());
    // Right-click in the page: a menu for what is under the pointer.
    contents.on('context-menu', (_event, params) =>
      showPageMenu(tab.id, view, contents, params),
    );
    contents.on('page-title-updated', (_event, title) =>
      updateTab(tab.id, { title }),
    );
    contents.on('page-favicon-updated', (_event, icons) => {
      const icon = icons.find(model.isWebUrl) ?? null;
      updateTab(tab.id, { favicon: icon });
      const next = rememberFavicon(favicons, contents.getURL(), icon);
      if (next !== favicons) {
        favicons = next;
        faviconsSaver.schedule();
      }
    });
    // A page starts at the zoom its site was given. (Ctrl+scroll asks for a step.)
    contents.on('dom-ready', () => applySiteZoom(tab.id));
    contents.on('zoom-changed', (_event, direction) => {
      if (tab.id === activeTabId()) changeZoom(direction === 'in' ? 1 : -1);
    });
    contents.on('found-in-page', (_event, result) => {
      if (tab.id !== findTabId || find.isDestroyed()) return;
      find.send('find:result', {
        active: result.activeMatchOrdinal,
        total: result.matches,
      });
    });
    contents.on('page-title-updated', (_event, title) => {
      const next = setVisitTitle(history, contents.getURL(), title);
      if (next !== history) {
        history = next;
        historySaver.schedule();
        libraryChanged();
      }
    });
    contents.on('did-navigate', (_event, url) => {
      // A new page is a visit (but not the load of a tab restored from last time).
      if (
        restoredLoads.delete(tab.id) === false &&
        librarySettings.saveHistory
      ) {
        history = addVisit(
          history,
          url,
          contents.getTitle(),
          Date.now(),
          librarySettings.historyDays,
        );
        historySaver.schedule();
        libraryChanged();
      }
      // A new page: the search is over.
      if (tab.id === findTabId) closeFind(false);
      // The new page will report its own icon.
      updateTab(tab.id, { url: contents.getURL(), favicon: null });
    });
    contents.on('did-navigate-in-page', () =>
      updateTab(tab.id, { url: contents.getURL() }),
    );
    // A site whose certificate is wrong gets a warning page, not a blank one. The
    // address bar keeps showing the address that failed.
    contents.on('did-fail-load', (_event, code, _text, failedUrl, isMain) => {
      if (!isMain || !isCertError(code) || !model.isWebUrl(failedUrl)) return;
      let host = '';
      try {
        host = new URL(failedUrl).hostname;
      } catch {
        return;
      }
      certErrors.set(tab.id, { url: failedUrl, code, host });
      void contents.loadURL(certErrorUrl(host, code));
    });
    contents.on('did-navigate', () => {
      const failed = certErrors.get(tab.id);
      if (failed && contents.getURL().startsWith('data:text/html')) {
        updateTab(tab.id, { url: failed.url, favicon: null });
      } else if (failed) {
        certErrors.delete(tab.id);
      }
    });
    // The warning page's two links.
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith('aib:')) return;
      event.preventDefault();
      const link = parseCertLink(url);
      const failed = certErrors.get(tab.id);
      if (!link || !failed || !contents.getURL().startsWith('data:text/html')) {
        return;
      }
      certErrors.delete(tab.id);
      if (link === 'proceed') {
        if (!canProceed(failed.code)) return;
        certAllowed.add(failed.host);
        void contents.loadURL(failed.url);
      } else if (contents.navigationHistory.canGoBack()) {
        contents.navigationHistory.goBack();
      } else {
        void contents.loadURL(NEW_TAB_URL);
      }
    });

    void contents.loadURL(tab.url);
    return view;
  };

  // ---- Address-bar suggestions -----------------------------------------------

  const hideSuggest = () => {
    if (!suggestShown) return;
    suggestShown = false;
    suggestRows = [];
    suggestView.setVisible(false);
    // Clear it, so the next time it shows it never flashes the old rows.
    if (suggestReady && !suggestPage.isDestroyed()) {
      suggestPage.send('suggest:rows', { rows: [], selected: -1 });
    }
  };

  // The rows for what is typed, from your tabs, bookmarks and history.
  const suggestionsFor = (text: string): Suggestion[] =>
    suggest(
      text,
      {
        bookmarks: bookmarks.items,
        history: history.entries,
        tabs: state.tabs.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          closed: t.closed,
        })),
      },
      Date.now(),
    );

  // Go to an address in the selected tab (or in a new one when no page is selected,
  // for example on a Space's overview).
  const goTo = (url: string) => {
    const id = activeTabId();
    const view = id === null ? undefined : views.get(id);
    if (view) {
      void view.webContents.loadURL(url);
      commitAndShow(revealPage(state));
    } else {
      openTab(url, currentSpaceId());
    }
  };

  // Do what a row says: switch to its tab, reopen a kept page, or go to its address.
  const pickSuggestion = (index: number) => {
    const row = suggestRows[index];
    hideSuggest();
    if (!row) return;
    if (row.kind === 'tab' && row.tabId !== undefined) {
      const tab = model.findTab(state, row.tabId);
      if (tab?.closed) {
        reopenTab(tab.id);
        return;
      }
      if (tab) {
        select({ kind: 'tab', id: tab.id });
        return;
      }
    }
    if (model.isWebUrl(row.url)) goTo(row.url);
  };

  // ---- Find in page --------------------------------------------------------

  const placeFind = () => {
    if (findTabId !== null) findView.setBounds(findBarRect(pageBounds()));
  };

  const openFind = () => {
    const id = activeTabId();
    if (id === null || !views.has(id) || !pageIsShown()) return;
    // The bar belongs to one page; asking for it on another starts over.
    if (findTabId !== null && findTabId !== id) closeFind(false);
    findTabId = id;
    placeFind();
    findView.setVisible(true);
    restack();
    const tell = () => find.send('find:open');
    if (findReady) tell();
    else findWhenReady = tell;
    find.focus();
  };

  // Close the bar and clear the highlights. `focusPage`: give the keyboard back to
  // the page (not wanted when the page itself is going away).
  function closeFind(focusPage = true) {
    const id = findTabId;
    if (id === null) return;
    findTabId = null;
    const view = views.get(id);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.stopFindInPage('clearSelection');
      if (focusPage && pageIsShown()) view.webContents.focus();
    }
    findView.setVisible(false);
    if (!find.isDestroyed()) find.send('find:closed');
  }

  // The bar only makes sense over the page it was opened on, while it is showing.
  const syncFind = () => {
    if (findTabId === null) return;
    if (activeTabId() !== findTabId || !pageIsShown()) closeFind(false);
    else placeFind();
  };

  // Ctrl+Shift+T: bring back the tab you closed last, in its Space (or outside
  // every Space if that Space is gone). A page still kept as a closed link in that
  // Space comes back as that same link, not as a second copy.
  const reopenClosedTab = (closed: ClosedTab) => {
    const { url, spaceId } = closed;
    const space =
      spaceId !== null && model.findSpace(state, spaceId) ? spaceId : null;
    const kept =
      space === null
        ? undefined
        : state.tabs.find(
            (t) => t.closed && t.spaceId === space && historyUrl(t.url) === url,
          );
    if (kept) reopenTab(kept.id);
    else openTab(url, space);
  };

  const reopenLastClosed = () => {
    const taken = takeLastClosed(closedTabs);
    if (!taken) return;
    closedTabs = taken.state;
    closedSaver.schedule();
    libraryChanged();
    reopenClosedTab(taken.tab);
  };

  // ---- Bookmarks and saving a page into a Space ---------------------------------

  // Bookmark the selected page, or take the bookmark off.
  const toggleBookmark = () => {
    const contents = activePage();
    if (!contents) return;
    const url = contents.getURL();
    bookmarks = isBookmarked(bookmarks, url)
      ? removeBookmarkByUrl(bookmarks, url)
      : addBookmark(bookmarks, url, contents.getTitle(), Date.now());
    bookmarksSaver.schedule();
    libraryChanged();
    sendState();
  };

  // The Spaces the selected page can go into, and where it already is.
  const starSpaces = () => {
    const url = activePage()?.getURL() ?? '';
    return state.spaces.map((space) => ({
      id: space.id,
      name: space.name,
      emoji: emojiOr(space.emoji, DEFAULT_SPACE_EMOJI),
      saved: model.isPageInSpace(state, url, space.id),
    }));
  };

  // Save the selected page into a Space as a kept page (no tab is opened).
  const savePageHere = (spaceId: number) => {
    const contents = activePage();
    if (!contents) return;
    const saved = model.savePageToSpace(
      state,
      { url: contents.getURL(), title: contents.getTitle() },
      spaceId,
    );
    if (saved.added) commit(saved.state);
  };

  const saveToNewSpace = () => {
    const created = model.addSpace(state);
    commit(created.state);
    savePageHere(created.id);
  };

  // ---- Zoom, print, developer tools ------------------------------------------

  // Give a page the zoom its site was given (100% when none).
  const applySiteZoom = (tabId: number) => {
    const contents = views.get(tabId)?.webContents;
    if (!contents || contents.isDestroyed()) return;
    const wanted = zoomFor(zoomSettings, zoomHost(contents.getURL()));
    if (Math.abs(contents.getZoomFactor() - wanted) > 1e-6) {
      contents.setZoomFactor(wanted);
    }
    if (tabId === activeTabId()) sendState();
  };

  // Zoom the active page one step in (1) or out (-1), or back to 100% (0). The
  // site remembers it, and every open page of that site follows.
  const changeZoom = (direction: 1 | -1 | 0) => {
    const contents = activePage();
    if (!contents) return;
    const host = zoomHost(contents.getURL());
    if (host === null) return;
    const next =
      direction === 0 ? 1 : stepZoom(contents.getZoomFactor(), direction);
    zoomSettings = withSiteZoom(zoomSettings, host, next);
    zoomSaver.schedule();
    for (const [tabId, view] of views) {
      if (zoomHost(view.webContents.getURL()) === host) applySiteZoom(tabId);
    }
    sendState();
  };

  // The system's own print window, for the active page.
  const printPage = () => {
    const contents = activePage();
    if (contents) contents.print({ printBackground: true });
  };

  // Ctrl+S / the page menu: save the page you are on to a file you pick.
  const savePageAs = () => {
    const contents = activePage();
    if (contents) void downloadManager.savePage(contents);
  };

  const toggleDevTools = () => activePage()?.toggleDevTools();

  // What a choice in the "…" menu (or the zoom chip's) does.
  const runToolsChoice = (choice: ToolsChoice) => {
    switch (choice.action) {
      case 'find':
        openFind();
        break;
      case 'zoom-in':
        changeZoom(1);
        break;
      case 'zoom-out':
        changeZoom(-1);
        break;
      case 'zoom-reset':
        changeZoom(0);
        break;
      case 'print':
        printPage();
        break;
      case 'devtools':
        toggleDevTools();
        break;
    }
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
    syncFind();
    hideSuggest();
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

  // Close a tab. In a Space the page stays as a closed link on the overview.
  const closeTab = (id: number) => {
    const tab = model.findTab(state, id);
    if (!tab || tab.closed) return;
    syncLinkSnapshots(); // So a chat's link to this tab remembers its latest name.
    closedTabs = recordClosed(
      closedTabs,
      { url: tab.url, title: tab.title, spaceId: tab.spaceId },
      Date.now(),
    );
    closedSaver.schedule();
    libraryChanged();
    destroyView(id);
    commitAndShow(withSomethingActive(model.closeTab(state, id)));
  };

  // Delete a tab for good (including a closed link).
  const removeTab = (id: number) => {
    if (!model.findTab(state, id)) return;
    syncLinkSnapshots();
    destroyView(id);
    commitAndShow(withSomethingActive(model.removeTab(state, id)));
  };

  // Open a closed link again and show it.
  const reopenTab = (id: number) => {
    if (!model.findTab(state, id)) return;
    commitAndShow(revealPage(model.reopenTab(state, id)));
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

  const deleteArtifact = (id: number) => {
    const found = artifactsModel.findArtifact(artifacts, id);
    if (!found) return;
    // No "are you sure?": it waits in Recently deleted, and can be brought back.
    syncLinkSnapshots(); // Chats' links to it remember its name.
    commitArtifacts(artifactsModel.deleteArtifact(artifacts, id));
    libraryChanged();
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
    if (!tab || tab.closed) return { ok: false, reason: 'closed' };
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
  // ---- What sites may do: camera, microphone, location, notifications ------
  // A site that asks gets a small question under the address bar (one at a time).
  // The answer can be remembered. Anything we do not know is refused, and so is
  // every ask from a page that is not showing, or from a site that is not secure.
  const pageOf = (contents: Electron.WebContents | null) =>
    contents !== null &&
    [...views.values()].some((view) => view.webContents === contents);
  const askQueue: (() => void)[] = [];
  let asking = false;
  const nextQuestion = () => {
    asking = false;
    const next = askQueue.shift();
    if (next) next();
  };
  const askAboutSite = (
    contents: Electron.WebContents,
    site: string,
    kinds: AskKind[],
    reply: (allowed: boolean) => void,
  ) => {
    const run = () => {
      asking = true;
      // A question is only asked on the page you are looking at.
      const still = decide(permissions, site, kinds);
      if (still.verdict !== 'ask') {
        reply(still.verdict === 'allow');
        nextQuestion();
        return;
      }
      if (contents.isDestroyed() || activePage() !== contents) {
        reply(false);
        nextQuestion();
        return;
      }
      const rect = pageBounds();
      const host = new URL(site).host;
      showMenu(
        permissionPromptItems(host, still.kinds),
        rect.x + 16,
        rect.y + 4,
        (id) => {
          const choice = parsePermissionChoice(id);
          if (choice === 'allow' || choice === 'block') {
            for (const kind of still.kinds) {
              permissions = setAnswer(permissions, site, kind, choice);
            }
            permissionsChanged();
          }
          reply(choice === 'allow' || choice === 'once');
          nextQuestion();
        },
        win.webContents,
        undefined,
        false,
        () => {
          reply(false);
          nextQuestion();
        },
        'prompt',
      );
    };
    if (asking) askQueue.push(run);
    else run();
  };
  const shownTypes = (details: unknown): readonly string[] => {
    const types = (details as { mediaTypes?: unknown }).mediaTypes;
    return Array.isArray(types)
      ? types.filter((t) => typeof t === 'string')
      : [];
  };
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      const types = shownTypes(details);
      const verdict = classify(permission, types);
      if (verdict.verdict !== 'ask') {
        // The harmless ones are fine for pages; our own screens get nothing else.
        callback(verdict.verdict === 'allow');
        return;
      }
      if (!pageOf(contents)) {
        callback(false);
        return;
      }
      const site = siteKey(contents.getURL());
      const decision = decide(permissions, site, verdict.kinds);
      if (decision.verdict !== 'ask' || site === null) {
        callback(decision.verdict === 'allow');
        return;
      }
      askAboutSite(contents, site, decision.kinds, callback);
    },
  );
  // Quiet checks ("may I?") never ask: only what was already allowed passes.
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, _origin, details) => {
      const mediaType = (details as { mediaType?: string }).mediaType;
      const verdict = classify(
        permission,
        mediaType === undefined || mediaType === 'unknown'
          ? ['video', 'audio']
          : [mediaType],
      );
      if (verdict.verdict !== 'ask') return verdict.verdict === 'allow';
      if (!pageOf(contents)) return false;
      const site = siteKey(contents?.getURL() ?? '');
      return decide(permissions, site, verdict.kinds).verdict === 'allow';
    },
  );

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
    if (model.findTab(state, tabId)?.closed !== false) return;
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
      // A page kept in a Space comes back in that same Space, not as a new tab.
      const kept = model.findClosedTabByAddress(state, url);
      let tabId: number;
      if (kept) {
        commitAndShow(revealPage(model.reopenTab(state, kept.id)));
        tabId = kept.id;
      } else {
        const created = model.addTab(state, {
          url,
          spaceId: currentSpaceId(),
        });
        commitAndShow(revealPage(created.state));
        tabId = created.id;
      }
      win.webContents.focus();
      const ready = await prepareTab(tabId, signal);
      if (!ready.ok) return { ok: false, reason: 'timeout' };
      return {
        ok: true,
        tabId,
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
    namer,
    autoName: () => namingSettings.auto,
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
    artifactStore: {
      read: (id) => {
        const found = artifactsModel.findArtifact(artifacts, id);
        return found
          ? { title: found.title, kind: found.kind, content: found.content }
          : null;
      },
      create: (chatId, input) => {
        const result = artifactsModel.createArtifact(
          artifacts,
          input,
          Date.now(),
        );
        if (!result.ok) {
          return {
            ok: false,
            reason:
              result.reason === 'too-long' || result.reason === 'bad-kind'
                ? result.reason
                : 'too-many',
          };
        }
        commitArtifacts(result.state);
        // Link it to the chat, so the assistant can read and edit it.
        commitChats(
          chatsModel.addRef(chats, chatId, {
            kind: 'artifact',
            id: result.artifact.id,
            title: result.artifact.title,
            url: null,
          }),
        );
        return { ok: true, id: result.artifact.id };
      },
      update: (id, changes) => {
        const result = artifactsModel.updateArtifact(
          artifacts,
          id,
          changes,
          Date.now(),
        );
        if (!result.ok) {
          return {
            ok: false,
            reason: result.reason === 'too-long' ? 'too-long' : 'not-found',
          };
        }
        commitArtifacts(result.state);
        // An editor that has it open shows the change.
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('artifact:changed', id);
        }
        return { ok: true };
      },
    },
    spaceStore: {
      create: (chatId, input) => {
        if (state.spaces.length >= model.MAX_SPACES) {
          return { ok: false, reason: 'too-many' };
        }
        const created = model.addSpace(state, input.name);
        let next = created.state;
        if (input.emoji !== null) {
          next = model.setSpaceEmoji(next, created.id, input.emoji);
        }
        const color = model.SPACE_COLORS.find((c) => c === input.color);
        if (color) next = model.setSpaceColor(next, created.id, color);
        commit(next);
        // Link it to the chat, so the assistant can put artifacts in it.
        commitChats(
          chatsModel.addRef(chats, chatId, {
            kind: 'space',
            id: created.id,
            title: input.name,
            url: null,
          }),
        );
        return { ok: true, id: created.id };
      },
    },
    toolLevel: (tool) => levelFor(toolSettings, tool),
    search: search.catch(() => null),
    linkTab: (chatId, tabId) => {
      const tab = model.findTab(state, tabId);
      if (!tab || tab.closed) return;
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
    showMenu: (items, x, y, choose, opener, alignCenter) =>
      showMenu(items, x, y, choose, opener, alignCenter),
  });
  llm
    .then((context) => {
      llmContext = context;
      context.onChange(sendState); // The chat follows key and model changes.
      sendState();
    })
    .catch(() => undefined);

  // Clear what a site saved on this computer (cookies and stored data): one name
  // ("mail.google.com") or a main site with everything under it ("google.com").
  // Only sites that are in the list can be named. Asks first.
  const clearSiteData = async (target: unknown) => {
    const { site, host } = (target ?? {}) as { site?: unknown; host?: unknown };
    const ses = session.defaultSession;
    const cookies = await ses.cookies.get({});
    const groups = siteDataGroups(cookies);
    let names: string[] = [];
    let label = '';
    if (typeof site === 'string') {
      const group = groups.find((g) => g.site === site);
      names = group?.hosts.map((h) => h.host) ?? [];
      label =
        group && group.hosts.length > 1 ? `${site} and its subsites` : site;
    } else if (typeof host === 'string') {
      names = groups.some((g) => g.hosts.some((h) => h.host === host))
        ? [host]
        : [];
      label = host;
    }
    if (names.length === 0) return false;
    const yes = await confirm({
      title: 'Clear data for this site?',
      message: `Clear the data ${label} saved here?`,
      detail:
        'This removes its cookies and stored data, so you will be signed out of it. Your history, bookmarks and the permissions you gave it stay.',
      button: 'Clear data',
    });
    if (!yes) return false;
    for (const name of names) {
      for (const cookie of cookies.filter((c) => cookieIsOfSite(c, name))) {
        const domain = (cookie.domain ?? '').replace(/^\./, '');
        await ses.cookies
          .remove(
            `${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path ?? '/'}`,
            cookie.name,
          )
          .catch(() => undefined);
      }
      for (const origin of [name, `www.${name}`]) {
        for (const scheme of ['https', 'http']) {
          await ses.clearStorageData({ origin: `${scheme}://${origin}` });
        }
      }
    }
    return true;
  };

  // What the Downloads list's buttons and menu do.
  const runDownloadAction = (id: number, action: string) => {
    switch (action) {
      case 'open':
        void downloadManager.open(id);
        break;
      case 'show':
        downloadManager.showInFolder(id);
        break;
      case 'pause':
        downloadManager.pause(id);
        break;
      case 'resume':
        downloadManager.resume(id);
        break;
      case 'cancel':
        downloadManager.cancel(id);
        break;
      case 'remove':
        downloadManager.remove(id);
        break;
    }
  };

  // Remove what has waited in Recently deleted longer than you chose. Runs when the
  // app starts, every few hours, and when you change the time.
  const purgeTrash = () => {
    const now = Date.now();
    commitChats(
      chatsModel.purgeOldChats(chats, now, librarySettings.trashDays),
    );
    commitArtifacts(
      artifactsModel.purgeOldArtifacts(
        artifacts,
        now,
        librarySettings.trashDays,
      ),
    );
  };

  const deleteChat = (id: number) => {
    const chat = chatsModel.findConversation(chats, id);
    if (!chat) return;
    // No "are you sure?": it waits in Recently deleted, and can be brought back.
    // A reply still being written must stop before its chat goes.
    chatService?.stop(id);
    commitChats(chatsModel.deleteConversation(chats, id));
    libraryChanged();
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
      if (inSidebar && !pinnedNow()) setHover(true);
      target.send('chats:begin-rename', id);
      target.focus(); // So the box can take keyboard input.
    },
    deleteChat: (id) => void deleteChat(id),
  };

  const menuActions: MenuActions = {
    moveTabToNewSpace: (tabId) => {
      const created = model.addSpace(state);
      commit(model.moveTab(created.state, tabId, created.id));
    },
    // The sidebar shows the rename box, so make sure it is open.
    renameSpace: (spaceId) => {
      if (!pinnedNow()) setHover(true);
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

  // Link something to the chat you are looking at, and bring the chat back if it
  // was closed (page only).
  const linkToChat = (ref: ChatRef) => {
    commitChats(chatsModel.addRef(chats, chats.activeId, ref));
    if (state.settings.viewMode === 'page') {
      commitAndShow(model.setViewMode(state, 'both'));
    }
  };

  // Jump to a linked tab, Space or artifact (a closed page in a Space opens again).
  const openLink = (kind: 'tab' | 'space' | 'artifact', id: number) => {
    if (kind === 'tab' && model.findTab(state, id)?.closed) {
      reopenTab(id);
    } else if (kind === 'tab' && model.findTab(state, id)) {
      select({ kind: 'tab', id });
    } else if (kind === 'space' && model.findSpace(state, id)) {
      select({ kind: 'lead', spaceId: id });
    } else if (kind === 'artifact') {
      openArtifact(id);
    }
  };

  // Bring a page that was closed for good back from the address a link remembers
  // (as a new, ungrouped tab) and point every chat's link to it at the new tab.
  const reopenLink = (chatId: number, id: number) => {
    // The link may have been removed from the chat since; an old message's token
    // still remembers the address.
    const conversation = chatsModel.findConversation(chats, chatId);
    const ref =
      conversation?.refs.find((r) => r.kind === 'tab' && r.id === id) ??
      conversation?.messages
        .flatMap((m) => m.mentions)
        .find((x) => x.kind === 'tab' && x.id === id);
    if (!ref || !ref.url || model.findTab(state, id)) return;
    const created = model.addTab(state, { url: ref.url, spaceId: null });
    commitAndShow(revealPage(created.state));
    const reopened = { id: created.id, title: ref.title, url: ref.url };
    // Every chat that used the page follows it to the new tab: links and the
    // tokens in old messages. A link you had removed is not added back.
    commitChats(chatsModel.retargetEverywhere(chats, 'tab', id, reopened));
    chatService?.refreshMentions(); // Show the live tokens without a reload.
  };

  // Make a copy of an artifact in a Space (or none). Returns the copy's number.
  const copyArtifact = (id: number, spaceId: number | null): number | null => {
    if (spaceId !== null && !model.findSpace(state, spaceId)) return null;
    const original = artifactsModel.findArtifact(artifacts, id);
    if (!original) return null;
    const result = artifactsModel.createArtifact(
      artifacts,
      {
        kind: original.kind,
        title: `${original.title} (copy)`,
        content: original.content,
        spaceId,
      },
      Date.now(),
    );
    if (!result.ok) return null;
    commitArtifacts(result.state);
    return result.artifact.id;
  };

  // Put an artifact in a Space (or none, with null).
  const placeArtifact = (id: number, spaceId: number | null) => {
    const result = artifactsModel.updateArtifact(
      artifacts,
      id,
      { spaceId },
      Date.now(),
    );
    if (result.ok) commitArtifacts(result.state);
  };

  // What an artifact menu item does.
  const runArtifactChoice = (id: number, choiceId: string) => {
    const artifact = artifactsModel.findArtifact(artifacts, id);
    const choice = parseArtifactChoice(choiceId);
    if (!artifact || !choice) return;
    switch (choice.action) {
      case 'open':
        openArtifact(id);
        break;
      case 'close':
        commitAndShow(withSomethingActive(model.closeArtifactTab(state, id)));
        break;
      case 'rename':
        // The Artifacts panel opens with this artifact's name as a text box.
        state = model.setRightPanel(state, 'artifacts');
        saver.schedule();
        applyLayout(true);
        sendState();
        if (!win.webContents.isDestroyed()) {
          win.webContents.send('artifact:begin-rename', id);
        }
        break;
      case 'name-ai':
        nameFromMenu('artifact', id);
        break;
      case 'icon':
        pickEmoji(artifact.emoji, (picked) => {
          const result = artifactsModel.updateArtifact(
            artifacts,
            id,
            { emoji: 'emoji' in picked ? picked.emoji : null },
            Date.now(),
          );
          if (result.ok) commitArtifacts(result.state);
        });
        break;
      case 'add-to-chat':
        linkToChat({
          kind: 'artifact',
          id,
          title: artifact.title,
          url: null,
        });
        break;
      case 'move':
        if (model.findSpace(state, choice.spaceId)) {
          placeArtifact(id, choice.spaceId);
        }
        break;
      case 'move-new-space': {
        const created = model.addSpace(state);
        commit(created.state);
        placeArtifact(id, created.id);
        break;
      }
      case 'take-out':
        placeArtifact(id, null);
        break;
      case 'delete':
        void deleteArtifact(id);
        break;
    }
  };

  // What a choice in a Space overview's Add menu does.
  const runAddChoice = (spaceId: number, choiceId: string) => {
    const choice = parseAddChoice(choiceId);
    if (!choice || !model.findSpace(state, spaceId)) return;
    switch (choice.action) {
      case 'page':
        openTab(NEW_TAB_URL, spaceId);
        break;
      case 'new-artifact': {
        const result = artifactsModel.createArtifact(
          artifacts,
          { kind: choice.kind, title: '', spaceId },
          Date.now(),
        );
        if (result.ok) {
          commitArtifacts(result.state);
          openArtifact(result.artifact.id);
        }
        break;
      }
      case 'move':
        placeArtifact(choice.artifactId, spaceId);
        break;
      case 'copy':
        copyArtifact(choice.artifactId, spaceId);
        break;
    }
  };

  // What a choice in a chat link's menu does.
  const runLinkChoice = (
    chatId: number,
    kind: 'tab' | 'space' | 'artifact',
    id: number,
    choiceId: string,
  ) => {
    const choice = parseLinkChoice(choiceId);
    if (!choice) return;
    switch (choice.action) {
      case 'open':
        openLink(kind, id);
        break;
      case 'reopen':
        reopenLink(chatId, id);
        break;
      case 'show-in-space': {
        const spaceId =
          kind === 'tab'
            ? (model.findTab(state, id)?.spaceId ?? null)
            : (artifactsModel.findArtifact(artifacts, id)?.spaceId ?? null);
        if (spaceId !== null) select({ kind: 'lead', spaceId });
        break;
      }
      case 'remove':
        commitChats(chatsModel.removeRef(chats, chatId, kind, id));
        break;
    }
  };

  // What a choice in an editing menu does, in the text box that has the keyboard.
  const runEditChoice = (
    target: Electron.WebContents,
    choiceId: string,
    selected = '',
  ) => {
    const choice = parseEditChoice(choiceId);
    if (!choice || target.isDestroyed()) return;
    switch (choice.action) {
      case 'undo':
        target.undo();
        break;
      case 'cut':
        target.cut();
        break;
      case 'copy':
        target.copy();
        break;
      case 'paste':
        target.paste();
        break;
      case 'select-all':
        target.selectAll();
        break;
      case 'add-to-chat':
        if (selected.trim() !== '') insertIntoChat(selected);
        break;
      case 'paste-and-go': {
        void clipboard.readText().then((copied) => {
          const text = copied.trim();
          if (text) requests['tab:navigate'](text);
        });
        break;
      }
    }
  };

  // The menu for a right-click inside a web page: a text box gets the editing
  // menu, then a link, an image, selected text, or the page itself.
  const showPageMenu = (
    tabId: number,
    view: WebContentsView,
    contents: Electron.WebContents,
    params: Electron.ContextMenuParams,
  ) => {
    const bounds = view.getBounds();
    const x = bounds.x + params.x;
    const y = bounds.y + params.y;
    const selection = params.selectionText;

    if (params.isEditable) {
      void clipboard.readText().then((copied) =>
        showMenu(
          editMenuItems({
            hasSelection: params.editFlags.canCopy || selection !== '',
            canPaste: params.editFlags.canPaste && copied.length > 0,
            pasteAndGo: false,
          }),
          x,
          y,
          (choice) => runEditChoice(contents, choice),
          contents,
        ),
      );
      return;
    }

    let items: MenuItem[];
    if (params.linkURL !== '')
      items = pageLinkMenuItems(
        state,
        model.findTab(state, tabId)?.spaceId ?? null,
      );
    else if (params.mediaType === 'image' && params.srcURL !== '')
      items = pageImageMenuItems();
    else if (selection.trim() !== '') items = pageSelectionMenuItems(selection);
    else
      items = pageMenuItems({
        canGoBack: contents.navigationHistory.canGoBack(),
        canGoForward: contents.navigationHistory.canGoForward(),
        bookmarked: isBookmarked(bookmarks, contents.getURL()),
        spaces: starSpaces(),
      });

    showMenu(
      items,
      x,
      y,
      (choice) => runPageChoice(tabId, contents, params, choice),
      contents,
    );
  };

  // What a choice in a web page's menu does.
  const runPageChoice = (
    tabId: number,
    contents: Electron.WebContents,
    params: Electron.ContextMenuParams,
    choiceId: string,
  ) => {
    const choice = parsePageChoice(choiceId);
    const tab = model.findTab(state, tabId);
    if (!choice || !tab) return;
    const here = tab.spaceId;
    // Only ordinary web addresses are ever opened in a tab.
    const openIn = (url: string, spaceId: number | null) => {
      if (model.isWebUrl(url)) openTab(url, spaceId);
    };
    switch (choice.action) {
      case 'back':
        contents.navigationHistory.goBack();
        break;
      case 'forward':
        contents.navigationHistory.goForward();
        break;
      case 'reload':
        reloadTab(tabId, contents);
        break;
      case 'find':
        openFind();
        break;
      case 'bookmark':
        toggleBookmark();
        break;
      case 'save-to-space':
        savePageHere(choice.spaceId);
        break;
      case 'save-to-new-space':
        saveToNewSpace();
        break;
      case 'zoom-in':
        changeZoom(1);
        break;
      case 'zoom-out':
        changeZoom(-1);
        break;
      case 'zoom-reset':
        changeZoom(0);
        break;
      case 'print':
        printPage();
        break;
      case 'save-page-as':
        savePageAs();
        break;
      case 'save-link-as':
        downloadManager.saveUrl(contents, params.linkURL);
        break;
      case 'save-image-as':
        downloadManager.saveUrl(contents, params.srcURL);
        break;
      case 'inspect':
        contents.inspectElement(params.x, params.y);
        break;
      case 'add-page-to-chat':
        linkToChat({ kind: 'tab', id: tabId, title: tab.title, url: tab.url });
        break;
      case 'open-link':
        openIn(params.linkURL, here);
        break;
      case 'open-link-in':
        if (model.findSpace(state, choice.spaceId)) {
          openIn(params.linkURL, choice.spaceId);
        }
        break;
      case 'open-link-in-new-space':
        if (model.isWebUrl(params.linkURL)) {
          const created = model.addSpace(state);
          commit(created.state);
          openTab(params.linkURL, created.id);
        }
        break;
      case 'add-link-to-chat':
        insertIntoChat(params.linkURL);
        break;
      case 'copy-link':
        clipboard.writeText(params.linkURL);
        break;
      case 'open-image':
        openIn(params.srcURL, here);
        break;
      case 'copy-image':
        contents.copyImageAt(params.x, params.y);
        break;
      case 'copy-image-address':
        clipboard.writeText(params.srcURL);
        break;
      case 'copy-selection':
        clipboard.writeText(params.selectionText);
        break;
      case 'search-selection':
        openTab(searchUrl(params.selectionText), here);
        break;
      case 'add-selection-to-chat':
        insertIntoChat(params.selectionText);
        break;
    }
  };

  // Put text in the message box, bringing the chat back if it was closed.
  const insertIntoChat = (text: string) => {
    if (state.settings.viewMode === 'page') {
      commitAndShow(model.setViewMode(state, 'both'));
    }
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('composer:insert', text.slice(0, 4000));
    }
  };

  // What a Space menu item does.
  const runSpaceChoice = (spaceId: number, choiceId: string) => {
    const space = model.findSpace(state, spaceId);
    const choice = parseSpaceChoice(choiceId);
    if (!space || !choice) return;
    switch (choice.action) {
      case 'open':
        select({ kind: 'lead', spaceId });
        break;
      case 'new-tab':
        openTab(NEW_TAB_URL, spaceId);
        break;
      case 'add-to-chat':
        linkToChat({
          kind: 'space',
          id: spaceId,
          title: space.name,
          url: null,
        });
        break;
      case 'rename':
        menuActions.renameSpace(spaceId);
        break;
      case 'name-ai':
        nameFromMenu('space', spaceId);
        break;
      case 'icon':
        pickEmoji(space.emoji, (picked) =>
          commit(
            model.setSpaceEmoji(
              state,
              spaceId,
              'emoji' in picked ? picked.emoji : null,
            ),
          ),
        );
        break;
      case 'color':
        menuActions.setSpaceColor(spaceId, choice.color);
        break;
      case 'toggle-collapse':
        menuActions.setSpaceCollapsed(spaceId, !space.collapsed);
        break;
      case 'ungroup':
        menuActions.ungroupSpace(spaceId);
        break;
      case 'close-all':
        for (const tab of state.tabs.filter(
          (t) => t.spaceId === spaceId && !t.closed,
        )) {
          closeTab(tab.id);
        }
        break;
      case 'delete':
        menuActions.deleteSpace(spaceId);
        break;
    }
  };

  // What a chat menu item does.
  const runChatChoice = (choiceId: string) => {
    const choice = parseChatChoice(choiceId);
    if (!choice) return;
    switch (choice.action) {
      case 'new':
        chatMenuActions.newChat();
        break;
      case 'select':
        chatMenuActions.selectChat(choice.chatId);
        break;
      case 'rename':
        chatMenuActions.renameChat(choice.chatId);
        break;
      case 'name-ai':
        nameFromMenu('chat', choice.chatId);
        break;
      case 'icon': {
        const chatId = choice.chatId;
        pickEmoji(
          chatsModel.findConversation(chats, chatId)?.emoji ?? null,
          (picked) =>
            commitChats(
              chatsModel.setConversationEmoji(
                chats,
                chatId,
                'emoji' in picked ? picked.emoji : null,
              ),
            ),
        );
        break;
      }
      case 'delete':
        chatMenuActions.deleteChat(choice.chatId);
        break;
    }
  };

  // What a tab menu item does.
  const runTabChoice = (tabId: number, choiceId: string) => {
    const tab = model.findTab(state, tabId);
    const choice = parseTabChoice(choiceId);
    if (!tab || !choice) return;
    switch (choice.action) {
      case 'open':
        reopenTab(tabId);
        break;
      case 'new-below':
        commitAndShow(
          revealPage(
            model.addTab(state, {
              url: NEW_TAB_URL,
              spaceId: tab.spaceId,
              after: tabId,
            }).state,
          ),
        );
        break;
      case 'duplicate':
        commitAndShow(
          revealPage(
            model.addTab(state, {
              url: tab.url,
              spaceId: tab.spaceId,
              after: tabId,
            }).state,
          ),
        );
        break;
      case 'reload':
        {
          const page = views.get(tabId)?.webContents;
          if (page) reloadTab(tabId, page);
        }
        break;
      case 'add-to-chat':
        linkToChat({ kind: 'tab', id: tabId, title: tab.title, url: tab.url });
        break;
      case 'move':
        commit(model.moveTab(state, tabId, choice.spaceId));
        break;
      case 'move-new-space':
        menuActions.moveTabToNewSpace(tabId);
        break;
      case 'copy-link':
        clipboard.writeText(tab.url);
        break;
      case 'close-others':
        for (const other of state.tabs.filter(
          (t) => t.id !== tabId && t.spaceId === tab.spaceId && !t.closed,
        )) {
          closeTab(other.id);
        }
        break;
      case 'close':
        closeTab(tabId);
        break;
      case 'delete':
        removeTab(tabId);
        break;
    }
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
    // F12: developer tools for the page.
    if (
      input.type === 'keyDown' &&
      input.key === 'F12' &&
      !input.control &&
      !input.alt &&
      !input.meta
    ) {
      event.preventDefault();
      toggleDevTools();
      return;
    }
    // F6 / Shift+F6: move the keyboard to the next part of the app.
    if (
      input.type === 'keyDown' &&
      input.key === 'F6' &&
      !input.control &&
      !input.alt &&
      !input.meta
    ) {
      event.preventDefault();
      const id = activeTabId();
      const pageView = id === null ? undefined : views.get(id)?.webContents;
      const here: Region | null = sidebar.isFocused()
        ? 'sidebar'
        : win.webContents.isFocused()
          ? 'window'
          : pageView?.isFocused()
            ? 'page'
            : null;
      const next = nextRegion(here, input.shift, pageIsShown() && !!pageView);
      if (next === 'sidebar') {
        // A hovering sidebar must be open to be used.
        if (!pinnedNow()) setHover(true);
        sidebar.focus();
      } else if (next === 'page') pageView?.focus();
      else win.webContents.focus();
      return;
    }
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta)
      return;
    const key = input.key.toLowerCase();
    if (key === 'f') {
      event.preventDefault();
      openFind();
    } else if (key === 'd') {
      event.preventDefault();
      toggleBookmark();
    } else if (key === '=' || key === '+') {
      event.preventDefault();
      changeZoom(1);
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      changeZoom(-1);
    } else if (key === '0') {
      event.preventDefault();
      changeZoom(0);
    } else if (key === 's' && !input.shift) {
      event.preventDefault();
      savePageAs();
    } else if (key === 'p') {
      event.preventDefault();
      printPage();
    } else if (key === 'i' && input.shift) {
      event.preventDefault();
      toggleDevTools();
    } else if (key === 't' && input.shift) {
      event.preventDefault();
      reopenLastClosed();
    } else if (key === 't') {
      event.preventDefault();
      openTab(NEW_TAB_URL, currentSpaceId());
    } else if (key === 'r') {
      event.preventDefault();
      const id = activeTabId();
      if (id !== null) {
        const page = views.get(id)?.webContents;
        if (page) reloadTab(id, page);
      }
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
    // The chat says what it needs: a line of a reply being written, or room for
    // an approval. The frame slides to fit.
    'chat:need': (need) => {
      if (need !== 'none' && need !== 'activity' && need !== 'approval') return;
      if (need === chatNeed) return;
      chatNeed = need;
      applyLayout(true);
    },
    'tab:reload': () => {
      const id = activeTabId();
      if (id !== null) {
        const page = views.get(id)?.webContents;
        if (page) reloadTab(id, page);
      }
    },
    'tab:stop': () => {
      const id = activeTabId();
      if (id !== null) views.get(id)?.webContents.stop();
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
    'tab:remove': (id) => {
      if (isId(id)) removeTab(id);
    },
    'tab:reopen': (id) => {
      if (isId(id)) reopenTab(id);
    },
    'tab:select': (id) => {
      if (!isId(id)) return;
      if (model.findTab(state, id)?.closed) reopenTab(id);
      else select({ kind: 'tab', id });
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
      if (!pinnedNow() && drag === null) setHover(true);
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
        startedPinned: pinnedNow(),
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
    // The Library panel: open a page from history, forget a visit, reopen a closed
    // tab, bring back or delete for good something from Recently deleted, and the
    // "…" menu that clears a list.
    'library:restore': (kind, id) => {
      if (!isId(id)) return;
      if (kind === 'chat') {
        commitChats(chatsModel.restoreConversation(chats, id));
      } else if (kind === 'artifact') {
        commitArtifacts(
          artifactsModel.restoreArtifact(
            artifacts,
            id,
            (spaceId) => model.findSpace(state, spaceId) !== undefined,
          ),
        );
      }
      libraryChanged();
    },
    'library:delete-forever': (kind, id) => {
      if (!isId(id) || (kind !== 'chat' && kind !== 'artifact')) return;
      const title =
        kind === 'chat'
          ? chats.trash.find((c) => c.id === id)?.title
          : artifacts.trash.find((a) => a.id === id)?.title;
      if (title === undefined) return;
      void confirm({
        title: 'Delete for good',
        message: `Delete “${title}” for good?`,
        detail:
          'It will be removed from Recently deleted and cannot be brought back.',
        button: 'Delete for good',
      }).then((yes) => {
        if (!yes) return;
        if (kind === 'chat') {
          commitChats(chatsModel.purgeConversation(chats, id));
        } else {
          commitArtifacts(artifactsModel.purgeArtifact(artifacts, id));
        }
        libraryChanged();
      });
    },
    'library:open': (url) => {
      const kept = historyUrl(url);
      if (kept !== null) openTab(kept, currentSpaceId());
    },
    // The Downloads list: act on one download (the buttons and the row's menu).
    'downloads:act': (id, action) => {
      if (!isId(id) || typeof action !== 'string') return;
      runDownloadAction(id, action);
    },
    'downloads:menu': (id, x, y) => {
      if (!isId(id) || !isNumber(x) || !isNumber(y)) return;
      const found = downloads.items.find((d) => d.id === id);
      if (!found) return;
      showMenu(
        downloadMenuItems(found),
        x,
        y,
        (choice) => {
          const parsed = parseDownloadChoice(choice);
          if (parsed) runDownloadAction(id, parsed.action);
        },
        requestSender ?? win.webContents,
      );
    },
    // A site in Settings > Privacy (right-click).
    'privacy:menu': (site, x, y) => {
      if (typeof site !== 'string' || !isNumber(x) || !isNumber(y)) return;
      showMenu(
        privacySiteMenuItems(),
        x,
        y,
        (choice) => {
          if (parsePrivacyChoice(choice) !== 'reset') return;
          permissions = resetSite(permissions, site);
          permissionsChanged();
          if (!win.webContents.isDestroyed()) {
            win.webContents.send('privacy:changed');
          }
        },
        requestSender ?? win.webContents,
      );
    },
    // A site in the list of saved cookies and data (right-click).
    'privacy:data-menu': (kind, name, x, y) => {
      if (
        (kind !== 'site' && kind !== 'host') ||
        typeof name !== 'string' ||
        !isNumber(x) ||
        !isNumber(y)
      )
        return;
      showMenu(
        privacyDataMenuItems(),
        x,
        y,
        (choice) => {
          if (parsePrivacyChoice(choice) !== 'clear') return;
          void clearSiteData(
            kind === 'site' ? { site: name } : { host: name },
          ).then((cleared) => {
            if (cleared && !win.webContents.isDestroyed()) {
              win.webContents.send('privacy:changed');
            }
          });
        },
        requestSender ?? win.webContents,
      );
    },
    // Open the Library on a list (the download indicator opens it on Downloads).
    'library:show': (list) => {
      if (
        list !== 'bookmarks' &&
        list !== 'history' &&
        list !== 'downloads' &&
        list !== 'closed' &&
        list !== 'deleted'
      )
        return;
      state = model.setRightPanel(state, 'library');
      saver.schedule();
      applyLayout(true);
      sendState();
      if (!win.webContents.isDestroyed()) {
        win.webContents.send('library:select-list', list);
      }
    },
    'library:remove-bookmark': (id) => {
      if (!isId(id)) return;
      const next = removeBookmark(bookmarks, id);
      if (next === bookmarks) return;
      bookmarks = next;
      bookmarksSaver.schedule();
      libraryChanged();
      sendState();
    },
    'library:remove-visit': (id) => {
      if (!isId(id)) return;
      const next = removeVisit(history, id);
      if (next === history) return;
      history = next;
      historySaver.schedule();
      libraryChanged();
    },
    'library:reopen-closed': (id) => {
      if (!isId(id)) return;
      const taken = takeClosedById(closedTabs, id);
      if (!taken) return;
      closedTabs = taken.state;
      closedSaver.schedule();
      libraryChanged();
      reopenClosedTab(taken.tab);
    },
    'library:menu': (list, x, y) => {
      if (
        (list !== 'history' &&
          list !== 'closed' &&
          list !== 'deleted' &&
          list !== 'downloads') ||
        !isNumber(x) ||
        !isNumber(y)
      )
        return;
      showMenu(
        libraryMenuItems(list),
        x,
        y,
        (choice) => {
          const parsed = parseLibraryChoice(choice);
          if (!parsed) return;
          if (parsed.action === 'clear-closed') {
            closedTabs = clearClosed(closedTabs);
            closedSaver.schedule();
            libraryChanged();
          } else if (parsed.action === 'clear-downloads') {
            downloads = clearFinished(downloads);
            downloadsSaver.schedule();
            win.webContents.send('downloads:changed');
            sendState();
          } else if (parsed.action === 'empty-deleted') {
            void confirm({
              title: 'Empty Recently deleted',
              message: 'Delete everything in Recently deleted for good?',
              detail: 'These chats and artifacts cannot be brought back.',
              button: 'Empty',
            }).then((yes) => {
              if (!yes) return;
              commitChats(chatsModel.emptyChatTrash(chats));
              commitArtifacts(artifactsModel.emptyArtifactTrash(artifacts));
              libraryChanged();
            });
          } else if (parsed.range !== 'all') {
            history = clearHistory(history, parsed.range, Date.now());
            historySaver.schedule();
            libraryChanged();
          } else {
            void confirm({
              title: 'Clear history',
              message: 'Clear all browsing history?',
              detail:
                'Every page in your history will be removed. This cannot be undone.',
              button: 'Clear history',
            }).then((yes) => {
              if (!yes) return;
              history = clearHistory(history, 'all', Date.now());
              historySaver.schedule();
              libraryChanged();
            });
          }
        },
        requestSender ?? win.webContents,
      );
    },
    // The toolbar "…" menu: the browser's tools.
    'toolbar:menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      const id = activeTabId();
      showMenu(
        toolsMenuItems({
          hasPage: id !== null && pageIsShown(),
          zoomText: zoomLabel(activePage()?.getZoomFactor() ?? 1),
        }),
        x,
        y,
        (choice) => {
          const parsed = parseToolsChoice(choice);
          if (parsed) runToolsChoice(parsed);
        },
        requestSender ?? win.webContents,
      );
    },
    // The star in the address bar: bookmark the page, or save it into a Space.
    'star:menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      const contents = activePage();
      if (!contents) return;
      showMenu(
        starMenuItems({
          bookmarked: isBookmarked(bookmarks, contents.getURL()),
          spaces: starSpaces(),
        }),
        x,
        y,
        (choice) => {
          const parsed = parseStarChoice(choice);
          if (!parsed) return;
          if (parsed.action === 'bookmark') toggleBookmark();
          else if (parsed.action === 'space') savePageHere(parsed.spaceId);
          else saveToNewSpace();
        },
        requestSender ?? win.webContents,
      );
    },
    // The lock chip in the address bar: what this site may do.
    'site:menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      const contents = activePage();
      // The same address the chip shows.
      const id = activeTabId();
      const address =
        (id === null ? undefined : model.findTab(state, id)?.url) ??
        contents?.getURL() ??
        '';
      const info = contents ? describeSite(address) : null;
      if (!contents || !info) return;
      const key = siteKey(address);
      const build = () =>
        siteMenuItems({
          host: info.host,
          secure: info.secure && !certBypassed(address),
          problem: certBypassed(address),
          canAsk: key !== null,
          answers: key === null ? {} : (permissions.sites[key] ?? {}),
        });
      showMenu(
        build(),
        x,
        y,
        (choice) => {
          const parsed = parseSiteChoice(choice);
          if (parsed?.action === 'rewarn') {
            // Warnings back on: forget the choice and load the page again, which
            // shows the warning page.
            try {
              certAllowed.delete(new URL(address).hostname);
            } catch {
              // Not an address; nothing to forget.
            }
            closeMenu(true);
            void contents.session
              .closeAllConnections()
              .then(() => reloadTab(id ?? -1, contents));
            sendState();
            return;
          }
          if (parsed?.action === 'settings') {
            closeMenu(true);
            openSettings();
            if (!win.webContents.isDestroyed()) {
              win.webContents.send('settings:section', 'privacy');
            }
            return;
          }
          if (!parsed || parsed.action !== 'set' || key === null) return;
          permissions = setAnswer(permissions, key, parsed.kind, parsed.answer);
          permissionsChanged();
          // The card stays open, showing the new state.
          if (openMenu) {
            const items = build();
            openMenu.items = items;
            openMenu.shown = { ...openMenu.shown, items };
            popup.send('popup:show', openMenu.shown);
          }
        },
        requestSender ?? win.webContents,
        undefined,
        false,
        undefined,
        'site',
      );
    },
    // The zoom chip in the address bar.
    'zoom:menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      showMenu(
        zoomChipMenuItems(),
        x,
        y,
        (choice) => {
          const parsed = parseToolsChoice(choice);
          if (parsed) runToolsChoice(parsed);
        },
        requestSender ?? win.webContents,
      );
    },
    // The pin in the sidebar's header: pin it open, or back to the strip (which
    // slides open over the page while the mouse is on it).
    'sidebar:toggle-pin': () => {
      const pin = !pinned();
      state = model.setSidebarPinned(state, pin);
      if (pin) {
        hover = false;
        stopWatching();
      }
      saver.schedule();
      applyLayout(true);
      sendState();
      // Unpinned with the mouse on it: it stays open until the mouse leaves.
      if (!pin) setHover(true);
    },
    // Drag and drop in the sidebar (and Alt+Up / Alt+Down). Each says what to move,
    // where (a Space, or null for outside every Space), and before which item (null:
    // at the end). The rules are in model.ts; anything that does not exist is ignored.
    'sidebar:move-tab': (tabId, spaceId, beforeTabId) => {
      if (!isId(tabId)) return;
      if (spaceId !== null && !isId(spaceId)) return;
      if (beforeTabId !== null && !isId(beforeTabId)) return;
      commit(model.placeTab(state, tabId, spaceId, beforeTabId));
    },
    'sidebar:move-artifact': (artifactId, spaceId, beforeArtifactId) => {
      if (!isId(artifactId)) return;
      if (spaceId !== null && !isId(spaceId)) return;
      if (beforeArtifactId !== null && !isId(beforeArtifactId)) return;
      const found = artifactsModel.findArtifact(artifacts, artifactId);
      if (!found) return;
      if (spaceId !== null && !model.findSpace(state, spaceId)) return;
      // The artifact belongs to one Space: change that first (its open tab follows).
      if (found.spaceId !== spaceId) placeArtifact(artifactId, spaceId);
      commit(model.placeArtifactTab(state, artifactId, beforeArtifactId));
    },
    'sidebar:move-space': (spaceId, beforeSpaceId) => {
      if (!isId(spaceId)) return;
      if (beforeSpaceId !== null && !isId(beforeSpaceId)) return;
      commit(model.placeSpace(state, spaceId, beforeSpaceId));
    },
    'sidebar:nudge': (kind, id, direction) => {
      if (kind !== 'tab' && kind !== 'artifact' && kind !== 'space') return;
      if (!isId(id) || (direction !== -1 && direction !== 1)) return;
      commit(model.nudge(state, { kind, id }, direction));
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
      if (isLinkKind(kind) && isId(id)) openLink(kind, id);
    },
    // Bring a closed tab back (as a new, ungrouped tab) and point every chat's
    // link to it at the new tab.
    'chats:reopen-link': (chatId, id) => {
      if (isId(chatId) && isId(id)) reopenLink(chatId, id);
    },
    // Menus: an artifact, a Space's Add button, a link in a chat, and the editing
    // menu of a text box.
    'artifact:menu': (id, x, y) => {
      if (!isId(id) || !isNumber(x) || !isNumber(y)) return;
      const items = artifactMenuItems(state, artifacts, id);
      if (!items) return;
      showMenu(
        items,
        x,
        y,
        (choice) => runArtifactChoice(id, choice),
        requestSender ?? win.webContents,
      );
    },
    'space:add-menu': (id, x, y) => {
      if (!isId(id) || !isNumber(x) || !isNumber(y)) return;
      const items = addMenuItems(state, artifacts, id);
      if (!items) return;
      showMenu(
        items,
        x,
        y,
        (choice) => runAddChoice(id, choice),
        requestSender ?? win.webContents,
      );
    },
    'link:menu': (chatId, kind, id, removable, x, y) => {
      if (!isId(chatId) || !isLinkKind(kind) || !isId(id)) return;
      if (!isNumber(x) || !isNumber(y)) return;
      const conversation = chatsModel.findConversation(chats, chatId);
      if (!conversation) return;
      // The link itself, or the remembered copy in an old message.
      const ref =
        conversation.refs.find((r) => r.kind === kind && r.id === id) ??
        conversation.messages
          .flatMap((m) => m.mentions)
          .find((m) => m.kind === kind && m.id === id);
      if (!ref) return;
      showMenu(
        linkMenuItems(ref, workspace(), removable === true),
        x,
        y,
        (choice) => runLinkChoice(chatId, kind, id, choice),
        requestSender ?? win.webContents,
      );
    },
    'edit:menu': (kind, x, y, hasSelection, selected) => {
      if (kind !== 'address' && kind !== 'composer' && kind !== 'editor')
        return;
      if (!isNumber(x) || !isNumber(y)) return;
      const opener = requestSender ?? win.webContents;
      void clipboard.readText().then((copied) =>
        showMenu(
          editMenuItems({
            hasSelection: hasSelection === true,
            canPaste: copied.length > 0,
            pasteAndGo: kind === 'address',
            addToChat: kind === 'editor',
          }),
          x,
          y,
          (choice) =>
            runEditChoice(
              opener,
              choice,
              typeof selected === 'string' ? selected : '',
            ),
          opener,
        ),
      );
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
    // The chat-name menu (no id) or the menu of one chat in the list.
    'chats:menu': (id, x, y, alignCenter) => {
      if (!isNumber(x) || !isNumber(y)) return;
      const items =
        id === undefined || id === null
          ? chatSwitchMenuItems(chats)
          : isId(id)
            ? chatRowMenuItems(chats, id)
            : null;
      if (!items) return;
      showMenu(
        items,
        x,
        y,
        (choice) => runChatChoice(choice),
        requestSender ?? win.webContents,
        isNumber(alignCenter) ? alignCenter : undefined,
      );
    },
    'tab:menu': (id, x, y) => {
      if (!isId(id) || !isNumber(x) || !isNumber(y)) return;
      const items = tabMenuItems(state, id);
      if (!items) return;
      showMenu(
        items,
        x,
        y,
        (choice) => runTabChoice(id, choice),
        requestSender ?? win.webContents,
      );
    },
    'space:menu': (id, x, y) => {
      if (!isId(id) || !isNumber(x) || !isNumber(y)) return;
      const items = spaceMenuItems(state, id);
      if (!items) return;
      showMenu(
        items,
        x,
        y,
        (choice) => runSpaceChoice(id, choice),
        requestSender ?? win.webContents,
      );
    },
  };
  // The popup page reports: ready, a choice, or a close. Only that page is heard.
  const onPopupReady = (event: Electron.IpcMainEvent) => {
    if (event.sender !== popup) return;
    popupReady = true;
    const waiting = waitingForPopup;
    waitingForPopup = null;
    waiting?.();
  };
  const onPopupChoose = (event: Electron.IpcMainEvent, id: unknown) => {
    if (event.sender !== popup || !openMenu) return;
    // Only an item of the menu that is open (and enabled) counts.
    if (!isChoosable(openMenu.items, id)) return;
    const { choose } = openMenu;
    if (openMenu.shown.panel === 'site') {
      // The site card stays open: the choice is applied and the card sent again.
      choose(id);
      return;
    }
    openMenu.dismissed = undefined; // something was chosen
    closeMenu(true);
    choose(id);
  };
  const onPopupClose = (event: Electron.IpcMainEvent) => {
    if (event.sender === popup) closeMenu(true);
  };
  ipcMain.on('popup:ready', onPopupReady);
  ipcMain.on('popup:choose', onPopupChoose);
  ipcMain.on('popup:close', onPopupClose);
  // A menu closes when the window is left or resized, like a native one.
  win.on('blur', () => closeMenu(false));
  win.on('resize', () => {
    if (openMenu) closeMenu(false);
  });

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

  // Address-bar suggestions. The toolbar asks for rows (answered here), then says
  // what to show and where; the dropdown's own page reports a click.
  ipcMain.handle('suggest:query', (event, text: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return typeof text === 'string' ? suggestionsFor(text.slice(0, 500)) : [];
  });
  const KINDS: SuggestionKind[] = [
    'search',
    'go',
    'bookmark',
    'history',
    'tab',
  ];
  const onSuggestShow = (
    event: Electron.IpcMainEvent,
    rows: unknown,
    selected: unknown,
    bar: unknown,
  ) => {
    if (event.sender !== win.webContents || !Array.isArray(rows)) return;
    const b = bar as {
      x?: unknown;
      y?: unknown;
      width?: unknown;
      height?: unknown;
    };
    if (
      typeof bar !== 'object' ||
      bar === null ||
      !isNumber(b.x) ||
      !isNumber(b.y) ||
      !isNumber(b.width) ||
      !isNumber(b.height)
    )
      return;
    const clean: Suggestion[] = [];
    for (const row of rows.slice(0, MAX_SUGGESTIONS)) {
      const r = row as Partial<Suggestion> | null;
      if (
        !r ||
        typeof r.url !== 'string' ||
        typeof r.title !== 'string' ||
        typeof r.detail !== 'string' ||
        !KINDS.includes(r.kind as SuggestionKind)
      )
        continue;
      clean.push({
        kind: r.kind as SuggestionKind,
        title: r.title.slice(0, 300),
        detail: r.detail.slice(0, 300),
        url: r.url.slice(0, 2000),
        ...(isId(r.tabId) ? { tabId: r.tabId } : {}),
        ...(r.closed === true ? { closed: true } : {}),
      });
    }
    if (clean.length === 0) {
      hideSuggest();
      return;
    }
    suggestRows = clean;
    const index = isNumber(selected) ? selected : -1;
    const show = () =>
      suggestPage.send('suggest:rows', { rows: clean, selected: index });
    suggestView.setBounds(
      suggestRect(b as never, clean.length, windowSize().height),
    );
    if (!suggestShown) {
      suggestShown = true;
      suggestView.setVisible(true);
      restack();
    }
    if (suggestReady) show();
    else suggestWhenReady = show;
  };
  const onSuggestPick = (event: Electron.IpcMainEvent, index: unknown) => {
    if (
      (event.sender !== suggestPage && event.sender !== win.webContents) ||
      !isNumber(index)
    )
      return;
    pickSuggestion(index);
  };
  const onSuggestHide = (event: Electron.IpcMainEvent) => {
    if (event.sender === win.webContents) hideSuggest();
  };
  const onSuggestReady = (event: Electron.IpcMainEvent) => {
    if (event.sender !== suggestPage) return;
    suggestReady = true;
    const waiting = suggestWhenReady;
    suggestWhenReady = null;
    waiting?.();
  };
  ipcMain.on('suggest:show', onSuggestShow);
  ipcMain.on('suggest:pick', onSuggestPick);
  ipcMain.on('suggest:hide', onSuggestHide);
  ipcMain.on('suggest:ready', onSuggestReady);
  win.on('blur', hideSuggest);
  win.on('resize', hideSuggest);

  // The find bar's own page: says it is listening, searches, steps, and closes.
  const fromFind = (event: Electron.IpcMainEvent) => event.sender === find;
  const onFindReady = (event: Electron.IpcMainEvent) => {
    if (!fromFind(event)) return;
    findReady = true;
    const waiting = findWhenReady;
    findWhenReady = null;
    waiting?.();
  };
  const onFindQuery = (
    event: Electron.IpcMainEvent,
    text: unknown,
    forward: unknown,
    again: unknown,
  ) => {
    if (!fromFind(event) || findTabId === null) return;
    const contents = views.get(findTabId)?.webContents;
    if (!contents || contents.isDestroyed() || typeof text !== 'string') return;
    if (text === '') {
      contents.stopFindInPage('clearSelection');
      if (!find.isDestroyed())
        find.send('find:result', { active: 0, total: 0 });
      return;
    }
    contents.findInPage(text.slice(0, 500), {
      forward: forward !== false,
      findNext: again === true,
    });
  };
  const onFindClose = (event: Electron.IpcMainEvent) => {
    if (fromFind(event)) closeFind();
  };
  ipcMain.on('find:ready', onFindReady);
  ipcMain.on('find:query', onFindQuery);
  ipcMain.on('find:close', onFindClose);

  const listeners = Object.entries(requests).map(([channel, handle]) => {
    const listener = (event: Electron.IpcMainEvent, ...args: unknown[]) => {
      if (event.sender === win.webContents || event.sender === sidebar) {
        requestSender = event.sender;
        try {
          handle(...args);
        } finally {
          requestSender = null;
        }
      }
    };
    ipcMain.on(channel, listener);
    return { channel, listener };
  });

  // The Tools panel asks for the tools and their levels, and changes them. A
  // change applies from the assistant's next reply.
  const fromWindow = (event: Electron.IpcMainInvokeEvent) =>
    event.sender === win.webContents;
  let indicatorTimer: ReturnType<typeof setTimeout> | null = null;
  // Downloads: the manager catches what pages download (see downloadManager.ts).
  const downloadManager = registerDownloads({
    session: session.defaultSession,
    getSettings: () => downloadSettings,
    getList: () => downloads,
    setList: (next) => {
      downloads = next;
      downloadsSaver.schedule();
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('downloads:changed');
      }
      // The indicator follows, and goes quiet a few seconds after the last one ends.
      sendState();
      if (indicatorTimer !== null) clearTimeout(indicatorTimer);
      indicatorTimer = setTimeout(() => {
        indicatorTimer = null;
        sendState();
      }, RECENT_MS + 500);
    },
    isPage: (contents) =>
      contents !== undefined &&
      [...views.values()].some((view) => view.webContents === contents),
    chooseSavePath: async (defaultPath) => {
      const result = await dialog.showSaveDialog(win, {
        defaultPath,
        filters: [{ name: 'Web page', extensions: ['html'] }],
      });
      return result.canceled || !result.filePath ? null : result.filePath;
    },
    confirm,
  });
  ipcMain.handle('downloads:list', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return downloads.items;
  });
  const permissionRows = () =>
    siteRows(permissions).map((row) => ({
      ...row,
      icon: faviconFor(favicons, row.host),
    }));
  ipcMain.handle('privacy:sites', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return permissionRows();
  });
  // The sites that have cookies saved here.
  ipcMain.handle('privacy:data-sites', async (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return siteDataGroups(await session.defaultSession.cookies.get({})).map(
      (group) => ({
        ...group,
        icon: faviconFor(favicons, group.site),
        hosts: group.hosts.map((row) => ({
          ...row,
          icon: faviconFor(favicons, row.host, group.site),
        })),
      }),
    );
  });
  ipcMain.handle('privacy:clear-site', async (event, target: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return clearSiteData(target);
  });
  const siteDetail = (site: string) => ({
    site,
    host: new URL(site).host,
    icon: faviconFor(favicons, new URL(site).host),
    answers: permissions.sites[site] ?? {},
  });
  // One site's page in Settings: all its permissions.
  ipcMain.handle('privacy:site-detail', (event, site: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (typeof site !== 'string' || siteKey(site) !== site) return null;
    return siteDetail(site);
  });
  ipcMain.handle(
    'privacy:set-answer',
    (event, site: unknown, kind: unknown, answer: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (typeof site !== 'string' || siteKey(site) !== site) return null;
      const asked = ASK_KINDS.find((k) => k === kind);
      if (
        !asked ||
        (answer !== null && answer !== 'allow' && answer !== 'block')
      ) {
        return siteDetail(site);
      }
      permissions = setAnswer(permissions, site, asked, answer);
      permissionsChanged();
      return siteDetail(site);
    },
  );
  ipcMain.handle('privacy:reset-site', (event, site: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (typeof site === 'string') {
      permissions = resetSite(permissions, site);
      permissionsChanged();
    }
    return permissionRows();
  });
  // "Clear browsing data": cookies and stored data, and/or saved page files.
  // Asks first. History, bookmarks and downloads are not touched.
  ipcMain.handle('privacy:clear', async (event, what: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const { siteData, cache } = (what ?? {}) as {
      siteData?: unknown;
      cache?: unknown;
    };
    if (siteData !== true && cache !== true) return false;
    const yes = await confirm({
      title: 'Clear browsing data?',
      message: 'Clear browsing data?',
      detail:
        siteData === true
          ? 'This removes cookies and stored data for every site, so you will be signed out of them. Your history, bookmarks, downloads and site permissions stay.'
          : 'This removes pages and pictures saved to load sites faster. Nothing else changes.',
      button: 'Clear data',
    });
    if (!yes) return false;
    if (siteData === true) await session.defaultSession.clearStorageData();
    if (cache === true) {
      await session.defaultSession.clearCache();
      favicons = defaultFavicons();
      faviconsSaver.schedule();
    }
    return true;
  });
  ipcMain.handle('download-settings:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return downloadSettings;
  });
  ipcMain.handle('download-settings:set', (event, changes: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    downloadSettings = withDownloadSettings(downloadSettings, changes);
    downloadSettingsSaver.schedule();
    return downloadSettings;
  });
  // "Change…": pick the folder in the system's folder window.
  ipcMain.handle('download-settings:pick-folder', async (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose where downloads are saved',
      defaultPath: downloadSettings.folder ?? app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!result.canceled && result.filePaths[0]) {
      downloadSettings = withDownloadSettings(downloadSettings, {
        folder: result.filePaths[0],
      });
      downloadSettingsSaver.schedule();
    }
    return downloadSettings;
  });
  ipcMain.handle('downloads:open-folder', async (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    await shell.openPath(downloadSettings.folder ?? app.getPath('downloads'));
  });

  // The Library panel reads the lists (it asks again when told they changed).
  ipcMain.handle('library:history', (event, query: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const text = typeof query === 'string' ? query.slice(0, 200) : '';
    return searchHistory(history, text, 300);
  });
  ipcMain.handle('library:deleted', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const now = Date.now();
    const dayMs = 24 * 60 * 60_000;
    const daysLeft = (deletedAt: number) =>
      Math.max(
        0,
        Math.ceil(
          (deletedAt + librarySettings.trashDays * dayMs - now) / dayMs,
        ),
      );
    const items = [
      ...chats.trash.map((c) => ({
        kind: 'chat' as const,
        id: c.id,
        title: c.title,
        emoji: emojiOr(c.emoji, DEFAULT_CHAT_EMOJI),
        detail: `Chat · ${c.messages.length} message${c.messages.length === 1 ? '' : 's'}`,
        deletedAt: c.deletedAt,
        daysLeft: daysLeft(c.deletedAt),
      })),
      ...artifacts.trash.map((a) => ({
        kind: 'artifact' as const,
        id: a.id,
        title: a.title,
        emoji: emojiOr(a.emoji, defaultArtifactEmoji(a.kind)),
        detail: `Artifact · ${a.kind}`,
        deletedAt: a.deletedAt,
        daysLeft: daysLeft(a.deletedAt),
      })),
    ];
    return items.sort((a, b) => b.deletedAt - a.deletedAt);
  });
  ipcMain.handle('library-settings:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return librarySettings;
  });
  ipcMain.handle('library-settings:set', (event, changes: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    librarySettings = withLibrarySettings(librarySettings, changes);
    librarySaver.schedule();
    // A shorter time takes effect at once.
    history = pruneHistory(history, Date.now(), librarySettings.historyDays);
    historySaver.schedule();
    purgeTrash();
    libraryChanged();
    return librarySettings;
  });
  ipcMain.handle('library:bookmarks', (event, query: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const text = typeof query === 'string' ? query.slice(0, 200) : '';
    return searchBookmarks(bookmarks, text);
  });
  ipcMain.handle('library:closed', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return [...closedTabs.tabs].reverse().map((t) => {
      const space =
        t.spaceId === null ? undefined : model.findSpace(state, t.spaceId);
      return {
        id: t.id,
        url: t.url,
        title: t.title,
        closedAt: t.closedAt,
        spaceName: space?.name ?? null,
        spaceEmoji: space ? emojiOr(space.emoji, DEFAULT_SPACE_EMOJI) : null,
      };
    });
  });
  ipcMain.handle('naming:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return namingSettings.auto;
  });
  ipcMain.handle('naming:set', (event, auto: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (typeof auto === 'boolean') {
      namingSettings = { ...namingSettings, auto };
      namingSaver.schedule();
    }
    return namingSettings.auto;
  });
  // The "name it with AI" button on a Space or an artifact (a chat's is handled by
  // the chat service). It replaces the name and emoji; the result says how it went.
  const nameThing = async (kind: unknown, id: unknown): Promise<NameResult> => {
    if (!isId(id)) return { ok: false, error: 'That no longer exists.' };
    if (kind === 'space') {
      const space = model.findSpace(state, id);
      if (!space) return { ok: false, error: 'That Space no longer exists.' };
      const tabTitles = state.tabs
        .filter((t) => t.spaceId === id && !t.closed)
        .slice(0, 20)
        .map((t) => t.title);
      const docTitles = artifacts.artifacts
        .filter((a) => a.spaceId === id)
        .slice(0, 10)
        .map((a) => a.title);
      const material = [
        tabTitles.length > 0 ? `Pages: ${tabTitles.join('; ')}` : '',
        docTitles.length > 0 ? `Documents: ${docTitles.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const result = await namer('space', material, null);
      if (result.ok && model.findSpace(state, id)) {
        let next = state;
        if (result.name !== null) {
          next = model.renameSpace(next, id, result.name);
        }
        if (result.emoji !== null) {
          next = model.setSpaceEmoji(next, id, result.emoji);
        }
        commit(next);
      }
      return result;
    }
    if (kind === 'artifact') {
      const artifact = artifactsModel.findArtifact(artifacts, id);
      if (!artifact) {
        return { ok: false, error: 'That artifact no longer exists.' };
      }
      const material = `Title: ${artifact.title}
Kind: ${artifact.kind}

${artifact.content.slice(0, 1500)}`;
      const result = await namer('artifact', material, null);
      if (result.ok) {
        const updated = artifactsModel.updateArtifact(
          artifacts,
          id,
          {
            ...(result.name !== null ? { title: result.name } : {}),
            ...(result.emoji !== null ? { emoji: result.emoji } : {}),
          },
          Date.now(),
        );
        if (updated.ok) commitArtifacts(updated.state);
      }
      return result;
    }
    return { ok: false, error: 'That cannot be named.' };
  };
  ipcMain.handle('name:ai', (event, kind: unknown, id: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (kind === 'chat') {
      return isId(id)
        ? (chatService?.nameChat(id) ??
            Promise.resolve({ ok: false, error: 'Not ready yet.' }))
        : Promise.resolve({ ok: false, error: 'That no longer exists.' });
    }
    return nameThing(kind, id);
  });
  // "Name with AI" from a menu: the same, with a plain message if it fails (there
  // is no button to show it on).
  const nameFromMenu = (kind: 'chat' | 'space' | 'artifact', id: number) => {
    const run =
      kind === 'chat'
        ? (chatService?.nameChat(id) ??
          Promise.resolve({ ok: false as const, error: 'Not ready yet.' }))
        : nameThing(kind, id);
    void run.then((result) => {
      if (!result.ok && !win.isDestroyed()) {
        void dialog.showMessageBox(win, {
          type: 'info',
          message: "Couldn't name it",
          detail: result.error,
        });
      }
    });
  };
  ipcMain.handle('theme:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return themeSettings.theme;
  });
  ipcMain.handle('theme:set', (event, choice: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (isThemeChoice(choice)) {
      themeSettings = { ...themeSettings, theme: choice };
      nativeTheme.themeSource = choice;
      themeSaver.schedule();
    }
    return themeSettings.theme;
  });
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
          revision: found.revision,
        }
      : null;
  });
  ipcMain.handle(
    'artifact:write',
    (event, id: unknown, content: unknown, revision: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (!isId(id) || typeof content !== 'string' || !isNumber(revision)) {
        return { ok: false, reason: 'failed' };
      }
      const current = artifactsModel.findArtifact(artifacts, id);
      if (!current) return { ok: false, reason: 'failed' };
      // The text changed since the editor loaded it (the assistant edited it):
      // saving now would overwrite that, so refuse and let the editor ask.
      if (current.revision !== revision) {
        return { ok: false, reason: 'conflict' };
      }
      const result = artifactsModel.updateArtifact(
        artifacts,
        id,
        { content },
        Date.now(),
      );
      if (!result.ok) return { ok: false, reason: 'failed' };
      commitArtifacts(result.state);
      return { ok: true, revision: result.artifact.revision };
    },
  );
  ipcMain.handle('artifact:copy', (event, id: unknown, spaceId: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (!isId(id)) return null;
    if (spaceId !== null && !isId(spaceId)) return null;
    return copyArtifact(id, spaceId);
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
  find.on('before-input-event', handleShortcut);
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
  void loadUi(popup, 'popup');
  void loadUi(find, 'find');
  void loadUi(suggestPage, 'suggest');

  // While developing, the dev server sometimes rebuilds its bundled libraries just
  // as the app starts, and a page that loads in that moment fails to start (it
  // never asks for its state). If a page has not checked in after a few seconds,
  // load it again (a few tries at most).
  // Clear out Recently deleted (see purgeTrash) now and every few hours.
  purgeTrash();
  const trashTimer = setInterval(purgeTrash, 6 * 60 * 60_000);
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
    namingSaver.flushSync();
    librarySaver.flushSync();
    zoomSaver.flushSync();
    historySaver.flushSync();
    bookmarksSaver.flushSync();
    downloadsSaver.flushSync();
    permissionsSaver.flushSync();
    faviconsSaver.flushSync();
    downloadSettingsSaver.flushSync();
    closedSaver.flushSync();
  });
  win.on('closed', () => {
    stopAnimation();
    stopWatching();
    for (const timer of startupTimers) clearTimeout(timer);
    ipcMain.removeListener('ui:ready', onUiReady);
    ipcMain.removeHandler('suggest:query');
    ipcMain.removeListener('suggest:show', onSuggestShow);
    ipcMain.removeListener('suggest:pick', onSuggestPick);
    ipcMain.removeListener('suggest:hide', onSuggestHide);
    ipcMain.removeListener('suggest:ready', onSuggestReady);
    ipcMain.removeListener('find:ready', onFindReady);
    ipcMain.removeListener('find:query', onFindQuery);
    ipcMain.removeListener('find:close', onFindClose);
    ipcMain.removeListener('popup:ready', onPopupReady);
    ipcMain.removeListener('popup:choose', onPopupChoose);
    ipcMain.removeListener('popup:close', onPopupClose);
    app.removeListener('certificate-error', onCertificateError);
    downloadManager.dispose();
    ipcMain.removeHandler('downloads:list');
    ipcMain.removeHandler('privacy:sites');
    ipcMain.removeHandler('privacy:data-sites');
    ipcMain.removeHandler('privacy:clear-site');
    ipcMain.removeHandler('privacy:site-detail');
    ipcMain.removeHandler('privacy:set-answer');
    ipcMain.removeHandler('privacy:reset-site');
    ipcMain.removeHandler('privacy:clear');
    ipcMain.removeHandler('download-settings:get');
    ipcMain.removeHandler('download-settings:set');
    ipcMain.removeHandler('download-settings:pick-folder');
    ipcMain.removeHandler('downloads:open-folder');
    ipcMain.removeHandler('library:history');
    ipcMain.removeHandler('library:bookmarks');
    ipcMain.removeHandler('library:deleted');
    ipcMain.removeHandler('library-settings:get');
    ipcMain.removeHandler('library-settings:set');
    ipcMain.removeHandler('library:closed');
    ipcMain.removeHandler('naming:get');
    ipcMain.removeHandler('naming:set');
    ipcMain.removeHandler('name:ai');
    ipcMain.removeHandler('tools:list');
    ipcMain.removeHandler('tools:set');
    ipcMain.removeHandler('tools:reset');
    ipcMain.removeHandler('artifact:create');
    ipcMain.removeHandler('artifact:copy');
    ipcMain.removeHandler('artifact:read');
    ipcMain.removeHandler('artifact:write');
    clearInterval(watchdog);
    clearInterval(trashTimer);
    for (const { channel, listener } of listeners)
      ipcMain.removeListener(channel, listener);
  });

  applyLayout(false);
  showActive();
}
