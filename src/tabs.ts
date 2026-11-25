import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  session,
  shell,
  WebContentsView,
} from 'electron';
import fs from 'node:fs';
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
  TOOLBAR_HEIGHT,
} from './layout';
import * as artifactsModel from './artifacts';
import { landingTab, neighborSpaceId, spaceIdByNumber } from './spaceSwitch';
import { chatMarkdown } from './chatExport';
import {
  MAKE_SKILL_REQUEST,
  createSkill,
  defaultSkills,
  deleteSkill,
  duplicateSkill,
  findSkill,
  parseSkillMarkdown,
  parseSkills,
  PROBLEM_WORDS,
  purgeOldSkills,
  purgeSkill,
  restoreSkill,
  setSkillEnabled,
  skillFileName,
  skillInfo,
  skillMarkdown,
  updateSkill,
} from './skills';
import type { SkillsState } from './skills';
import { exportFileName, spaceMarkdown } from './spaceExport';
import type { FileReading } from './artifactTools';
import { fitWithin, MAX_SHOT_SIDE } from './pageEyes';
import { cleanSavedText, saveFailureWords, savedContent } from './saveTools';
import type { SaveResult } from './saveTools';
import type { FindRead, ShotRead, TablesRead } from './pageEyes';
import { parsePdfText } from './pdfTextFormat';
import type { PdfTextResult } from './pdfTextFormat';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  PASTED_IMAGE_EXTENSIONS,
  planUpload,
} from './uploadRules';
import { isViewableExtension } from './uploadTypes';
import {
  defaultSleepSettings,
  idleSleepers,
  parseSleepSettings,
  spaceSleepers,
  withSleepSettings,
} from './sleep';
import type { SleepTab } from './sleep';
import {
  defaultSpaceTrash,
  emptySpaceTrash,
  parseSpaceTrash,
  purgeOldTrashedSpaces,
  purgeTrashedSpace,
  takeTrashedSpace,
  trashSpace,
} from './spaceTrash';
import { setPreviewInternetCheck } from './previewGuard';
import type { ArtifactsState } from './artifacts';
import * as chatsModel from './chats';
import type { ChatRef, ChatsState, LinkKind } from './chats';
import type {
  ActionEnv,
  ActionResult,
  OutlineRead,
  PageRead,
} from './agentTools';
import {
  chooseOption,
  clickControl,
  locateControl,
  pressKey as pressKeyInPage,
  readLinkAddress,
  scrollPage,
  typeIntoControl,
} from './pageActions';
import type { Cdp, DoneResult } from './pageActions';
import { buildOutline } from './pageOutline';
import {
  captureScreenshotVia,
  findInPageVia,
  readAccessibilityTree,
  readPageText,
  readSelectionVia,
  readTablesVia,
  withCdp,
} from './pageReader';
import { createNamer } from './aiNamer';
import { findBarRect } from './findBar';
import { registerDownloads } from './downloadManager';
import { registerExtensions } from './extensionManager';
import type { ExtensionManager } from './extensionManager';
import {
  defaultExtensionSettings,
  parseExtensionSettings,
  withExtensionSettings,
} from './extensionSettings';
import {
  defaultExtensions,
  describePermissions,
  parseExtensions,
} from './extensionList';
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
  answerFor,
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
import { crashPageUrl, isLoadError, loadErrorUrl } from './errorPage';
import { addBlocked, decidePopup, opensInBackground } from './popups';
import { parseQuickChoice, quickSearchItems } from './quickSearch';
import { CONTINUE_TEXT, madeOf, retryRequest, stepState } from './runModel';
import {
  createThumbnailStore,
  THUMBNAIL_WIDTH,
  thumbnailKey,
} from './thumbnails';
import { parseTabSearchChoice, tabSearchItems } from './tabSearch';
import {
  clearHiddenPickUp,
  defaultNewTabSettings,
  hidePickUp,
  parseNewTabSettings,
  withNewTabSettings,
} from './newTabSettings';
import { pickUpRows, recentSpaceIds } from './pickUp';
import { HINT_HEIGHT, HINT_MS, HINT_WIDTH, hintUrl } from './fullscreenHint';
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
  iconAfterNavigation,
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
  searchBookmarksLoose,
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
  searchHistoryLoose,
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
import { cleanLabel, snapshotLookup } from './chatLinks';
import type { Workspace } from './chatLinks';
import * as model from './model';
import type { ActiveRef, SavedState, SavedTab } from './model';
import type { LlmContext } from './llm';
import type { SearchContext } from './search';
import {
  createSaver,
  isUnreadable,
  loadArtifacts,
  loadChats,
  loadJson,
  loadState,
  sweepTempFiles,
} from './storage';
import { defaultNamingSettings, parseNamingSettings } from './namingSettings';
import {
  defaultThemeSettings,
  isThemeChoice,
  parseThemeSettings,
} from './themeSettings';
import { defaultLevel, GROUP_TITLES, isApprovalLevel } from './toolPolicy';
import type { ApprovalLevel } from './toolPolicy';
import {
  commonLevel,
  defaultToolSettings,
  describeTools,
  groupLevels,
  levelFor,
  parseToolSettings,
  presetLevels,
  TOOL_PRESETS,
  withLevel,
  withLevels,
} from './toolSettings';
import { devEnv } from './devEnv';
import { isAllowedNavigation } from './navigationRules';
import {
  defaultSiteTrust,
  normalizeSite,
  parseSiteTrust,
  siteTrustRows,
  trustOf,
  withSiteTrust,
} from './siteTrust';
import type {
  FrameLayout,
  SiteTrustResult,
  LibraryList,
  NewTabInfo,
  ResizeKind,
  UiState,
} from './types';
import { loadUi } from './ui';
import {
  defaultAgentVisualSettings,
  overlayBounds,
  overlayFor,
  parseAgentVisualSettings,
} from './agentVisuals';
import type { AgentVisualSettings } from './agentVisuals';
import { recentSteps, runOf } from './runModel';
import {
  labelPlacement,
  markerLabel,
  markerTone,
  toOverlayRect,
} from './marker';
import type { MarkerView, Rect, StepTarget } from './marker';
import {
  noOverlayFlags,
  overlayFlags,
  PILL_HEIGHT,
  PILL_MAX_WIDTH,
  popoutOf,
} from './agentVisuals';
import type { OverlayFlags } from './agentVisuals';
import { cardMayTakeFocus } from './approvalCard';
import { pendingChanges } from './pendingChanges';
import { setTraceSink } from './requestTrace';
import { testScope } from './testScope';
import { runChip, tabStatuses, unseenAfterRun } from './sidebarStatus';
import type { Unseen } from './sidebarStatus';
import { CURSOR_DONE_MS, cursorFor, scrollDirection } from './cursor';
import type { CursorView } from './cursor';
import { resolveInput, searchUrl } from './url';
import {
  activeEngine,
  defaultSearchEngineSettings,
  engineHome,
  parseSearchEngineSettings,
  withSearchEngine,
} from './searchEngine';
import {
  addMenuItems,
  artifactMenuItems,
  addToChatMenuItems,
  newSkillMenuItems,
  skillMenuItems,
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
  addExtensionMenuItems,
  extensionMenuItems,
  parseSwitchSpaceChoice,
  spaceSwitcherItems,
  newArtifactMenuItems,
  parseNewArtifactChoice,
  libraryMenuItems,
  parseAddExtensionChoice,
  parsePuzzleChoice,
  puzzleMenuItems,
  newTabSpacesMenuItems,
  parseNewTabSpaceChoice,
  parsePermissionChoice,
  parsePopupChoice,
  blockedPopupItems,
  parsePrivacyChoice,
  parseSiteChoice,
  privacyDataMenuItems,
  privacySiteMenuItems,
  permissionPromptItems,
  siteMenuItems,
  parseDownloadChoice,
  parseExtensionChoice,
  parseLibraryChoice,
  parseStarChoice,
  starMenuItems,
  parseAddChoice,
  parseArtifactChoice,
  parseAddToChatChoice,
  parseNewSkillChoice,
  parseSkillChoice,
  parseStepChoice,
  stepMenuItems,
  parseToolLevelChoice,
  parseToolTarget,
  toolLevelMenuItems,
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
export const NEW_TAB_URL = model.NEW_TAB_PAGE;

const isId = (value: unknown): value is number => Number.isInteger(value);
const isIdOrNull = (value: unknown): value is number | null =>
  value === null || isId(value);
const isLinkKind = chatsModel.isLinkKind;
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
// A box on the window ({ x, y, width, height }), as a button reports it.
const isBox = (
  value: unknown,
): value is { x: number; y: number; width: number; height: number } =>
  typeof value === 'object' &&
  value !== null &&
  ['x', 'y', 'width', 'height'].every((k) =>
    isNumber((value as Record<string, unknown>)[k]),
  );
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
  // For the AI prompt pipeline inspection only: with AIB_TRACE=1 one line of sizes (never what
  // was said, read or typed) is written per model call (see requestTrace.ts).
  if (devEnv('AIB_TRACE') === '1') {
    const traceFile = path.join(
      app.getPath('userData'),
      'pipeline-trace.jsonl',
    );
    setTraceSink((entry) => {
      fs.appendFile(traceFile, JSON.stringify(entry) + '\n', () => undefined);
    });
  }
  await sweepTempFiles(app.getPath('userData'));
  const file = path.join(app.getPath('userData'), 'spaces.json');
  const chatsFile = path.join(app.getPath('userData'), 'chats.json');
  let state: SavedState = await loadState(file);
  let chats: ChatsState = await loadChats(chatsFile);
  // Empty chats left behind by an earlier version are not kept (only the one you
  // are on may be empty: it is the "new chat" screen).
  chats = chatsModel.dropUntouched(chats, chats.activeId);
  // Documents made inside the browser (not uploads).
  const artifactsFile = path.join(app.getPath('userData'), 'artifacts.json');
  let artifacts: ArtifactsState = artifactsModel.releaseMissingSpaces(
    await loadArtifacts(artifactsFile),
    state.spaces.map((space) => space.id),
  );
  // How much each tool may do without asking (the Tools panel's choices).
  const toolsFile = path.join(app.getPath('userData'), 'tools.json');
  let toolSettings = await loadJson(
    toolsFile,
    parseToolSettings,
    defaultToolSettings,
  );
  const toolsSaver = createSaver(toolsFile, () => toolSettings);
  // The sites the assistant may act on freely, and the ones it may never touch (see siteTrust.ts).
  const siteTrustFile = path.join(app.getPath('userData'), 'site-trust.json');
  let siteTrustState = await loadJson(
    siteTrustFile,
    parseSiteTrust,
    defaultSiteTrust,
  );
  const siteTrustSaver = createSaver(siteTrustFile, () => siteTrustState);
  // How the assistant's work is shown on pages (see agentVisuals.ts).
  const agentVisualsFile = path.join(
    app.getPath('userData'),
    'agent-visuals.json',
  );
  let agentVisualSettings: AgentVisualSettings = await loadJson(
    agentVisualsFile,
    parseAgentVisualSettings,
    defaultAgentVisualSettings,
  );
  const agentVisualsSaver = createSaver(
    agentVisualsFile,
    () => agentVisualSettings,
  );
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
  let launchTabId: number | null = null;
  if (state.active === null) {
    const first = model.addTab(state, { url: NEW_TAB_URL });
    state = first.state;
    launchTabId = first.id;
  }

  const views = new Map<number, WebContentsView>();
  // Tabs saved from last time: the page loaded when one wakes up is not a visit.
  const restoredLoads = new Set(state.tabs.map((t) => t.id));
  const saver = createSaver(file, () => state);
  const chatsSaver = createSaver(chatsFile, () => chats);
  const artifactsSaver = createSaver(artifactsFile, () => artifacts);
  // The skills (see skills.ts).
  const skillsFile = path.join(app.getPath('userData'), 'skills.json');
  let skills: SkillsState = await loadJson(
    skillsFile,
    (raw) => parseSkills(raw),
    () => defaultSkills(),
  );
  const skillsSaver = createSaver(skillsFile, () => skills);
  const commitSkills = (next: SkillsState) => {
    if (next === skills) return;
    skills = next;
    skillsSaver.schedule();
    sendState();
  };

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
  // The search engine the address bar uses: see searchEngine.ts.
  const searchEngineFile = path.join(
    app.getPath('userData'),
    'search-engine.json',
  );
  let searchEngine = await loadJson(
    searchEngineFile,
    parseSearchEngineSettings,
    defaultSearchEngineSettings,
  );
  const searchEngineSaver = createSaver(searchEngineFile, () => searchEngine);
  // What you chose for the new-tab page (see newTabSettings.ts).
  const newTabSettingsFile = path.join(app.getPath('userData'), 'new-tab.json');
  let newTabSettings = await loadJson(
    newTabSettingsFile,
    parseNewTabSettings,
    defaultNewTabSettings,
  );
  const newTabSettingsSaver = createSaver(
    newTabSettingsFile,
    () => newTabSettings,
  );
  // A new tab shows the new-tab page (no web page behind it).
  const newTabUrl = () => model.NEW_TAB_PAGE;
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
  // Deleted Spaces, kept for a while so they can be brought back (see spaceTrash.ts).
  const deletedSpacesFile = path.join(
    app.getPath('userData'),
    'deleted-spaces.json',
  );
  let spaceTrash = await loadJson(
    deletedSpacesFile,
    parseSpaceTrash,
    defaultSpaceTrash,
  );
  const spaceTrashSaver = createSaver(deletedSpacesFile, () => spaceTrash);
  // Whether unused pages go to sleep by themselves (see sleep.ts).
  const sleepSettingsFile = path.join(
    app.getPath('userData'),
    'sleep-settings.json',
  );
  let sleepSettings = await loadJson(
    sleepSettingsFile,
    parseSleepSettings,
    defaultSleepSettings,
  );
  const sleepSettingsSaver = createSaver(
    sleepSettingsFile,
    () => sleepSettings,
  );
  // The browser extensions you added (see extensionList.ts).
  const extensionsFile = path.join(app.getPath('userData'), 'extensions.json');
  let extensionList = await loadJson(
    extensionsFile,
    parseExtensions,
    defaultExtensions,
  );
  const extensionsSaver = createSaver(extensionsFile, () => extensionList);
  // What you chose about extensions (see extensionSettings.ts).
  const extensionSettingsFile = path.join(
    app.getPath('userData'),
    'extension-settings.json',
  );
  let extensionSettings = await loadJson(
    extensionSettingsFile,
    parseExtensionSettings,
    defaultExtensionSettings,
  );
  const extensionSettingsSaver = createSaver(
    extensionSettingsFile,
    () => extensionSettings,
  );
  // Set once the window exists (see registerExtensions below).
  let extensions: ExtensionManager | null = null;

  // The Spaces and tabs as the chat sees them (titles and addresses).
  const workspace = (): Workspace => ({
    tabs: state.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      spaceId: t.spaceId,
      closed: t.closed,
    })),
    spaces: state.spaces.map((s) => ({
      id: s.id,
      name: s.name,
      about: s.about,
    })),
    artifacts: artifacts.artifacts.map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      fileLabel: artifactsModel.fileLabel(a),
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
  // How far each uploaded image or PDF is zoomed while the app is open (1 = 100%). They
  // use the same steps and menu as web pages.
  const fileZooms = new Map<number, number>();
  // The uploaded image or PDF on screen, if that is what is open.
  const activeFileId = (): number | null => {
    const active = state.active;
    if (active?.kind !== 'artifact') return null;
    const found = artifactsModel.findArtifact(artifacts, active.id);
    return found?.file ? found.id : null;
  };
  // The active tab's live page, if it has one.
  const activePage = () => {
    const id = state.active?.kind === 'tab' ? state.active.id : null;
    const contents = id === null ? undefined : pageContents(id);
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

  // The overlay on the page: the glow round the page while the assistant works in it,
  // and a small pill with its state and Stop. It is a page of our own in a view above the
  // page, so a web page cannot see it, move it or draw over it. While the glow is up it
  // covers the page (the assistant is working there, so you are not); the pill alone is
  // only a strip at the top.
  const overlayView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  overlayView.setBackgroundColor('#00000000');
  overlayView.setVisible(false);
  const overlayPage = overlayView.webContents;
  overlayPage.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlayPage.on('will-navigate', (event) => event.preventDefault());
  let overlayReady = false;
  let overlayShown = false;
  // Is an approval card popped out over the page? And which card has been given the keyboard.
  let lastFlags: OverlayFlags = noOverlayFlags();
  // The pill's hover list is open (the overlay's strip is taller while it is).
  let overlayPeek = false;
  // Cards you minimized (by step), so a new question pops out fresh.
  const minimizedCards = new Set<string>();
  let focusedCardKey: string | null = null;
  // The reply the overlay follows, and the replies whose pill you dismissed.
  // Small pictures of the screenshots taken this session, for the step rows (never saved).
  const thumbnails = createThumbnailStore();
  let overlayReply: { chatId: number; message: chatsModel.ChatMessage } | null =
    null;
  const dismissedReplies = new Set<number>();

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
    if (overlayShown) win.contentView.addChildView(overlayView);
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
      panel?: 'prompt' | 'site' | 'search' | 'quick';
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
  // Is the tab you are on a new tab, with the new-tab page and no web page?
  const onNewTabPage = () => {
    const id = activeTabId();
    const tab = id === null ? undefined : model.findTab(state, id);
    return tab !== undefined && model.isNewTabPage(tab.url);
  };

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
      // The new-tab page has its own box, so there is no chat bar under it (but with
      // only the chat showing, the chat still gets the window).
      chat:
        onNewTabPage() && s.viewMode !== 'chat'
          ? 0
          : restingChatHeight(
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

  // If one of the app's own pages (toolbar, sidebar, menus, find, suggestions, the pop-out card) crashes
  // or is killed, it is loaded again, so a blank toolbar or menus that do nothing do not stay until the
  // next start. `reset` says the page is no longer ready. Not forever: a page that keeps crashing
  // (four times in five minutes) is left alone.
  const uiCrashes = new Map<Electron.WebContents, number[]>();
  const recoverOnCrash = (
    contents: Electron.WebContents,
    reset: () => void,
  ) => {
    contents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return;
      if (contents.isDestroyed() || windowGone()) return;
      const at = Date.now();
      const recent = (uiCrashes.get(contents) ?? []).filter(
        (time) => at - time < 5 * 60_000,
      );
      recent.push(at);
      uiCrashes.set(contents, recent);
      if (recent.length > 4) {
        console.error('[ui] a page keeps crashing: leaving it as it is');
        return;
      }
      ready.delete(contents);
      listening.delete(contents);
      reset();
      setTimeout(() => {
        if (!contents.isDestroyed() && !windowGone()) contents.reload();
      }, 500);
    });
  };

  // The window, or the page that draws it, is already gone (the app is closing).
  const windowGone = () => win.isDestroyed() || win.webContents.isDestroyed();

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
  const failedPages = new Map<
    number,
    { url: string; code: number; host: string; kind: 'cert' | 'load' | 'crash' }
  >();
  const certAllowed = new Set<string>();
  // Pop-ups: when you last clicked or typed on each page, and what each page tried
  // to open without you asking (see popups.ts).
  const lastGesture = new Map<number, number>();
  const blockedPopups = new Map<number, string[]>();
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

  // What the new-tab page shows, worked out from what is on this computer.
  const newTabInfo = (tabId: number): NewTabInfo => {
    const tab = model.findTab(state, tabId);
    const spaceId = tab?.spaceId ?? null;
    const from = {
      tabs: state.tabs,
      artifacts: artifacts.artifacts,
      chats: chats.conversations,
      history: history.entries,
      unread: unreadChats,
    };
    const picked = pickUpRows(spaceId, from, newTabSettings.hidden);
    const ordered = recentSpaceIds(
      state.spaces.map((s) => s.id),
      from,
    );
    // The current Space first, then the most recently used.
    const ids = [
      ...(spaceId === null ? [] : [spaceId]),
      ...ordered.filter((id) => id !== spaceId),
    ];
    const info = (id: number) => state.spaces.find((s) => s.id === id);
    return {
      firstRun: state.spaces.length === 0,
      welcomeBack: tabId === launchTabId && state.spaces.length > 0,
      secondInRow: (() => {
        const previous = secondNewTabs.get(tabId);
        return previous !== undefined && untouchedNewTab(previous);
      })(),
      autoMode: newTabSettings.autoMode,
      suggestions: newTabSettings.suggestions,
      pick: picked.rows,
      pickTotal: picked.total,
      spaces: ids.slice(0, 3).flatMap((id) => {
        const s = info(id);
        return s
          ? [
              {
                id: s.id,
                name: s.name,
                emoji: emojiOr(s.emoji, DEFAULT_SPACE_EMOJI),
                color: s.color,
                collapsed: s.collapsed,
                about: s.about,
              },
            ]
          : [];
      }),
      moreSpaces: Math.max(0, ids.length - 3),
      now: Date.now(),
    };
  };

  // Chats with a reply that finished while you were not looking at that chat ("Reply
  // waiting"). Kept while the app is open. A chat is being looked at when it is the
  // open chat and the chat is showing in full (alone, or tall enough in the bar).
  const unreadChats = new Set<number>();
  let wasGenerating = new Set<number>();
  const watching = (chatId: number) =>
    chats.activeId === chatId &&
    (state.settings.viewMode === 'chat' ||
      (state.settings.viewMode === 'both' && state.settings.chatExpanded));
  const trackUnread = (generating: number[]) => {
    const now = new Set(generating);
    for (const id of wasGenerating) {
      if (
        !now.has(id) &&
        chats.conversations.some((c) => c.id === id) &&
        !watching(id)
      ) {
        unreadChats.add(id);
      }
    }
    wasGenerating = now;
    if (watching(chats.activeId)) unreadChats.delete(chats.activeId);
    for (const id of unreadChats) {
      if (!chats.conversations.some((c) => c.id === id)) unreadChats.delete(id);
    }
  };

  const sendState = () => {
    if (win.isDestroyed()) return;
    const id = activeTabId();
    const sidebar = assistantSidebar();
    const history =
      id === null ? undefined : pageContents(id)?.navigationHistory;
    const generating = chatService?.runningChats() ?? [];
    trackUnread(generating);
    const ui: UiState = {
      spaces: state.spaces.map(
        ({ id, name, color, emoji, collapsed, about }) => ({
          about,
          id,
          name,
          emoji: emojiOr(emoji, DEFAULT_SPACE_EMOJI),
          color,
          collapsed,
        }),
      ),
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
      skills: skills.skills.map(skillInfo),
      artifacts: artifacts.artifacts.map((a) => ({
        id: a.id,
        title: a.title,
        emoji: emojiOr(a.emoji, defaultArtifactEmoji(a.kind)),
        kind: a.kind,
        fileLabel: artifactsModel.fileLabel(a),
        spaceId: a.spaceId,
        updatedAt: a.updatedAt,
        size: a.file ? a.file.bytes : a.content.length,
      })),
      tabs: state.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        spaceId: tab.spaceId,
        loaded: views.has(tab.id),
        working: working.has(tab.id),
        status:
          sidebar.statuses.get(tab.id) ??
          (working.has(tab.id) ? 'working' : null),
        pending: sidebar.pending.get(tab.id) ?? null,
        loading: pageContents(tab.id)?.isLoading() ?? false,
        wokeForAssistant: wokeForAssistant.has(tab.id),
        closed: tab.closed,
        audible: pageContents(tab.id)?.isCurrentlyAudible() ?? false,
        muted: pageContents(tab.id)?.isAudioMuted() ?? false,
      })),
      assistantChip: sidebar.chip,
      active: state.active,
      zoom:
        Math.round(
          (activeFileId() === null
            ? (activePage()?.getZoomFactor() ?? 1)
            : (fileZooms.get(activeFileId() as number) ?? 1)) * 100,
        ) / 100,
      zoomable: activeFileId() !== null || activePage() !== undefined,
      bookmarked: isBookmarked(bookmarks, activePage()?.getURL()),
      certBypassed: certBypassed(activePage()?.getURL()),
      blockedPopups:
        (id === null ? undefined : blockedPopups.get(id))?.length ?? 0,
      newTab: id !== null && onNewTabPage() ? newTabInfo(id) : null,
      downloads: downloadSummary(downloads, Date.now()),
      loading: id === null ? false : (pageContents(id)?.isLoading() ?? false),
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
          unread: unreadChats.has(c.id),
          spaceIds: c.refs.filter((r) => r.kind === 'space').map((r) => r.id),
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

  // A page that is full screen (a video, a slide show): it fills the whole window
  // and everything else is hidden until it leaves (Esc, or you switch tabs).
  let htmlFullscreen: number | null = null;
  // The window went full screen because of the page (so it goes back when the page
  // leaves), rather than because you pressed F11.
  let windowFollowsPage = false;

  // Put the sidebar and the visible web page where the frame's sizes say.
  const render = () => {
    if (win.isDestroyed()) return;
    if (exitFullscreenIfAway()) return;
    if (htmlFullscreen !== null) {
      const full = views.get(htmlFullscreen);
      if (full && !full.webContents.isDestroyed()) {
        sidebarView.setVisible(false);
        full.setBorderRadius(0);
        full.setBounds({ x: 0, y: 0, ...windowSize() });
        full.setVisible(true);
        syncFind();
        hideSuggest();
        return;
      }
    }
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
    updateOverlay();
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
    panel?: 'prompt' | 'site' | 'search' | 'quick',
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

  // ---- Full screen ---------------------------------------------------------

  // The "Press Esc to exit full screen" pill, shown for a moment.
  let hintView: WebContentsView | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  const showFullscreenHint = () => {
    if (win.isDestroyed()) return;
    if (!hintView) {
      hintView = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      hintView.setBackgroundColor('#00000000');
      hintView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      hintView.webContents.on('will-navigate', (event) =>
        event.preventDefault(),
      );
      void hintView.webContents.loadURL(hintUrl());
    }
    const size = windowSize();
    hintView.setBounds({
      x: Math.round((size.width - HINT_WIDTH) / 2),
      y: 28,
      width: HINT_WIDTH,
      height: HINT_HEIGHT,
    });
    win.contentView.addChildView(hintView);
    hintView.setVisible(true);
    if (hintTimer !== null) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hintTimer = null;
      if (hintView && !win.isDestroyed()) {
        hintView.setVisible(false);
        win.contentView.removeChildView(hintView);
      }
    }, HINT_MS);
  };

  const enterHtmlFullscreen = (tabId: number) => {
    if (htmlFullscreen === tabId) return;
    htmlFullscreen = tabId;
    if (!win.isFullScreen()) {
      windowFollowsPage = true;
      win.setFullScreen(true);
    }
    const view = views.get(tabId);
    if (view) win.contentView.addChildView(view); // above everything
    render();
    showFullscreenHint();
  };

  const leaveHtmlFullscreen = () => {
    if (htmlFullscreen === null) return;
    htmlFullscreen = null;
    sidebarView.setVisible(true);
    for (const view of views.values()) view.setBorderRadius(PAGE_RADIUS);
    if (windowFollowsPage && !win.isDestroyed()) {
      windowFollowsPage = false;
      win.setFullScreen(false);
    }
    if (hintView && !win.isDestroyed()) {
      hintView.setVisible(false);
      win.contentView.removeChildView(hintView);
    }
    restack();
    applyLayout(false);
  };

  // Switching to another tab (or one that is not showing) ends full screen.
  const exitFullscreenIfAway = (): boolean => {
    if (htmlFullscreen === null || activeTabId() === htmlFullscreen)
      return false;
    pageContents(htmlFullscreen)
      ?.executeJavaScript(
        'document.fullscreenElement && document.exitFullscreen()',
      )
      .catch(() => undefined);
    leaveHtmlFullscreen();
    return true;
  };

  // Ctrl+L (or Alt+D): the keyboard goes to the address bar.
  const focusAddress = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.focus();
    win.webContents.send('toolbar:focus-address');
  };

  // Reload without using saved copies (Ctrl+Shift+R, Ctrl+F5).
  const hardReload = () => {
    const id = activeTabId();
    const page = id === null ? undefined : pageContents(id);
    if (id === null || !page) return;
    if (failedPages.has(id)) reloadTab(id, page);
    else page.reloadIgnoringCache();
  };

  // Back and forward in the page you are on (Alt+Left / Alt+Right, and the mouse's
  // back and forward buttons).
  const goBackOrForward = (direction: 'back' | 'forward') => {
    const id = activeTabId();
    const history =
      id === null ? undefined : pageContents(id)?.navigationHistory;
    if (!history) return;
    if (direction === 'back' && history.canGoBack()) history.goBack();
    if (direction === 'forward' && history.canGoForward()) history.goForward();
  };

  // Ctrl+1 to Ctrl+8: that tab, counting from the top of the sidebar; Ctrl+9: the
  // last one.
  const goToTabNumber = (number: number) => {
    const order = model.navOrder(state);
    const target = number === 9 ? order[order.length - 1] : order[number - 1];
    if (target) select(target);
  };

  // Open the Library on a list (History for Ctrl+H, Downloads from the indicator).
  const showLibraryList = (list: LibraryList) => {
    state = model.setRightPanel(state, 'library');
    saver.schedule();
    applyLayout(true);
    sendState();
    const send = () => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('library:select-list', list);
      }
    };
    send();
    // A panel that was not open yet is still starting: say it again once it is.
    setTimeout(send, 300);
  };

  // Reopen a tab from the recently closed list by its number there.
  const reopenClosedById = (id: number) => {
    const taken = takeClosedById(closedTabs, id);
    if (!taken) return;
    closedTabs = taken.state;
    closedSaver.schedule();
    libraryChanged();
    reopenClosedTab(taken.tab);
  };

  // Ctrl+Shift+A: a box over the page that lists your tabs (open, then recently
  // closed) and goes to the one you pick.
  const openTabSearch = () => {
    showMenu(
      tabSearchItems(state, closedTabs.tabs),
      0,
      0,
      (choice) => {
        const parsed = parseTabSearchChoice(choice);
        if (!parsed) return;
        if (parsed.kind === 'open') {
          if (model.findTab(state, parsed.id)) {
            select({ kind: 'tab', id: parsed.id });
          }
        } else {
          reopenClosedById(parsed.id);
        }
      },
      win.webContents,
      undefined,
      false,
      undefined,
      'search',
    );
  };

  // Ctrl+K: one box that finds anything (tabs, Spaces, artifacts, chats, history),
  // or goes to an address, searches the web, or asks the assistant. The rows are
  // asked for as you type (the 'quick:query' answer below).
  const quickSources = () => ({
    state,
    closed: closedTabs.tabs,
    artifacts: artifacts.artifacts,
    chats,
    history: history.entries,
    bookmarks: bookmarks.items,
    engineName: activeEngine(searchEngine).name,
  });
  // "Ask about ..." from the box: a new chat with the text sent. The chat bar is
  // shown under the page when only the page was showing.
  const askFromQuickSearch = (text: string) => {
    if (!chatService) return;
    const created = chatsModel.startNewChat(chats);
    commitChats(created.state);
    if (state.settings.viewMode === 'page') {
      commitAndShow(model.setViewMode(state, 'both'));
      applyLayout(true);
    }
    const result = chatService.sendMessage(created.id, text, []);
    if (!result.ok && !win.webContents.isDestroyed()) {
      win.webContents.send('composer:insert', text.slice(0, 4000));
    }
  };
  // An address from the box: in the new-tab page you are on (it becomes that page),
  // else in the selected tab (or a new one when no page is selected).
  const quickGo = (url: string) => {
    const id = activeTabId();
    if (id !== null && onNewTabPage() && goFromNewTab(id, url)) return;
    goTo(url);
  };
  const runQuickChoice = (choiceId: string) => {
    const choice = parseQuickChoice(choiceId);
    if (!choice) return;
    const template = activeEngine(searchEngine).template;
    switch (choice.kind) {
      case 'go': {
        const url = resolveInput(choice.text, template);
        if (url !== '') quickGo(url);
        break;
      }
      case 'search': {
        const url = searchUrl(choice.text, template);
        if (url !== '') quickGo(url);
        break;
      }
      case 'ask':
        askFromQuickSearch(choice.text);
        break;
      case 'page':
        // A bookmark or a visited page: a new tab (only a real web address).
        if (model.isWebUrl(choice.url)) {
          const id = activeTabId();
          if (id === null || !onNewTabPage() || !goFromNewTab(id, choice.url)) {
            openTab(choice.url, currentSpaceId());
          }
        }
        break;
      case 'tab': {
        const tab = model.findTab(state, choice.id);
        if (!tab) break;
        if (tab.closed) reopenTab(choice.id);
        else select({ kind: 'tab', id: choice.id });
        break;
      }
      case 'closed':
        reopenClosedById(choice.id);
        break;
      case 'space':
        if (model.findSpace(state, choice.id)) {
          select({ kind: 'lead', spaceId: choice.id });
        }
        break;
      case 'artifact':
        openArtifact(choice.id);
        break;
      case 'chat':
        if (chatsModel.findConversation(chats, choice.id)) {
          chatMenuActions.selectChat(choice.id);
          if (state.settings.viewMode === 'page') {
            commitAndShow(model.setViewMode(state, 'both'));
            applyLayout(true);
          }
        }
        break;
    }
  };
  const openQuickSearch = () => {
    showMenu(
      quickSearchItems('', quickSources()),
      0,
      0,
      runQuickChoice,
      win.webContents,
      undefined,
      false,
      undefined,
      'quick',
    );
  };

  // ---- The marker on the element a step acts on -------------------------------------
  // One debugger user at a time per page: the assistant's own action and the measuring of
  // its element take turns, so neither finds the page "busy".
  const debuggerTurns = new Map<number, Promise<unknown>>();
  const inTurn = <T>(tabId: number, work: () => Promise<T>): Promise<T> => {
    const before = debuggerTurns.get(tabId) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(work);
    debuggerTurns.set(
      tabId,
      mine.catch(() => undefined),
    );
    return mine;
  };
  // The element each step acts on, and where it was measured to be on its page. The box
  // goes stale when the page changes size or zoom, or is scrolled: it is then measured
  // again (without scrolling the page back), and the ring is left out until it is.
  interface MarkerBox {
    box: Rect | null;
    width: number;
    height: number;
    zoom: number;
  }
  const stepTargets = new Map<string, StepTarget>();
  const markerBoxes = new Map<string, MarkerBox | 'measuring'>();
  const markerStale = new Set<string>();
  const markerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const markerDoneAt = new Map<string, number>();
  const MARKER_DONE_MS = 1500;
  const REMEASURE_MS = 150;
  const stepKey = (messageId: number, partId: number) =>
    `${messageId}:${partId}`;
  const measureTarget = (key: string, target: StepTarget, scroll: boolean) => {
    if (markerBoxes.get(key) === 'measuring') return;
    markerBoxes.set(key, 'measuring');
    markerStale.delete(key);
    const contents = pageContents(target.tabId);
    const page = pageBounds();
    const zoom = contents?.getZoomFactor() ?? 1;
    if (!contents) {
      markerBoxes.set(key, {
        box: null,
        width: page.width,
        height: page.height,
        zoom,
      });
      return;
    }
    void inTurn(target.tabId, () =>
      withCdp(contents, 4000, (cdp) =>
        locateControl(cdp, target.backendNodeId, scroll),
      ),
    )
      .catch(() => null)
      .then((box) => {
        markerBoxes.set(key, {
          box,
          width: page.width,
          height: page.height,
          zoom,
        });
        updateOverlay();
      });
  };
  // Measure the element of the current step again soon (the page was resized, zoomed or
  // scrolled). Several calls in a row make one measuring.
  const remeasureSoon = (key: string, target: StepTarget) => {
    markerStale.add(key);
    if (markerTimers.has(key)) return;
    markerTimers.set(
      key,
      setTimeout(() => {
        markerTimers.delete(key);
        measureTarget(key, target, false);
      }, REMEASURE_MS),
    );
  };
  // The marker to draw now, or null: the current step acts on an element of the page on
  // screen, and the setting asks for markers.
  const markerFor = (
    run: ReturnType<typeof runOf>,
    activeId: number | null,
  ): MarkerView | null => {
    if (!run || !overlayReply || activeId === null) return null;
    const key = stepKey(overlayReply.message.id, run.partId);
    const target = stepTargets.get(key);
    const tone = markerTone(run.state);
    if (!target || tone === null || target.tabId !== activeId) return null;
    if (tone === 'done') {
      const first = markerDoneAt.get(key) ?? Date.now();
      markerDoneAt.set(key, first);
      if (Date.now() - first > MARKER_DONE_MS) return null;
      setTimeout(updateOverlay, MARKER_DONE_MS + 100);
    }
    const entry = markerBoxes.get(key);
    if (entry === undefined) {
      measureTarget(key, target, true);
      return null;
    }
    if (entry === 'measuring') return null;
    const page = pageBounds();
    const zoom = pageContents(activeId)?.getZoomFactor() ?? 1;
    // The page changed size or zoom since it was measured, or was scrolled: measure again.
    if (
      markerStale.has(key) ||
      entry.width !== page.width ||
      entry.height !== page.height ||
      entry.zoom !== zoom
    ) {
      if (tone !== 'done') remeasureSoon(key, target);
      return null;
    }
    if (entry.box === null) return null;
    const rect = toOverlayRect(entry.box, zoom, page);
    if (!rect) return null;
    const stepPart = overlayReply.message.parts.find(
      (p) => p.type === 'tool' && p.id === run.partId,
    );
    const toolName = stepPart?.type === 'tool' ? stepPart.name : '';
    const pillWidth = Math.min(PILL_MAX_WIDTH, page.width - 24);
    return {
      rect,
      tone,
      label: markerLabel(toolName, tone, target.name),
      placement: labelPlacement(rect, page, {
        x: (page.width - pillWidth) / 2,
        width: pillWidth,
        height: PILL_HEIGHT,
      }),
    };
  };
  // The assistant's cursor to draw now, or null: the current step clicks, types in, chooses
  // from or scrolls the page on screen (see cursor.ts). It points at the box measured for
  // the marker, and a finished step keeps it for a moment so a click is seen to land.
  const cursorDoneAt = new Map<string, number>();
  const cursorFrom = (
    run: ReturnType<typeof runOf>,
    activeId: number | null,
    marker: MarkerView | null,
  ): CursorView | null => {
    if (!run || !overlayReply || activeId === null) return null;
    if (run.tabId !== activeId) return null;
    const part = overlayReply.message.parts.find(
      (p) => p.type === 'tool' && p.id === run.partId,
    );
    if (part?.type !== 'tool') return null;
    const key = stepKey(overlayReply.message.id, run.partId);
    let sinceDoneMs: number | null = null;
    if (run.state === 'done') {
      const first = cursorDoneAt.get(key) ?? Date.now();
      cursorDoneAt.set(key, first);
      sinceDoneMs = Date.now() - first;
      if (sinceDoneMs <= CURSOR_DONE_MS) {
        setTimeout(updateOverlay, CURSOR_DONE_MS - sinceDoneMs + 50);
      }
    }
    const page = pageBounds();
    return cursorFor({
      toolName: part.name,
      state: run.state,
      rect: marker?.rect ?? null,
      page: { width: page.width, height: page.height },
      direction:
        part.name === 'scroll' ? scrollDirection(part.arguments) : null,
      sinceDoneMs,
    });
  };
  // The page was scrolled (the wheel was passed on to it): the ring has moved with its
  // element, so measure it again.
  const markerPageScrolled = () => {
    const run = overlayReply ? runOf(overlayReply.message) : null;
    if (!run || !overlayReply) return;
    const key = stepKey(overlayReply.message.id, run.partId);
    const target = stepTargets.get(key);
    if (target) remeasureSoon(key, target);
  };

  // Show, move or hide the overlay for what the assistant is doing now (see
  // agentVisuals.ts for the rules). Called when the reply changes, and whenever the
  // page moves or another tab comes to the front.
  const updateOverlay = () => {
    if (win.isDestroyed() || overlayPage.isDestroyed()) return;
    const activeId = activeTabId();
    // Is the page area on screen (whatever is in it)? And is a web page in it?
    const pageArea = pageIsShown() && htmlFullscreen === null;
    const webTab =
      pageArea && activeId !== null && views.has(activeId) ? activeId : null;
    const run = overlayReply ? runOf(overlayReply.message) : null;
    const approval =
      overlayReady && overlayReply
        ? popoutOf(overlayReply.message, state.tabs)
        : null;
    const approvalKey = approval
      ? stepKey(approval.messageId, approval.partId)
      : null;
    // The step's tab, if it is open and is not the one on screen: "Go to tab" takes you there.
    const stepTab = run?.tabId ?? null;
    const goToTab =
      stepTab !== null &&
      stepTab !== activeId &&
      model.findTab(state, stepTab)?.closed === false;
    const marker = webTab !== null ? markerFor(run, webTab) : null;
    const next = overlayFor({
      run,
      activeTab: webTab,
      pageShown: pageArea,
      dismissed: overlayReply
        ? dismissedReplies.has(overlayReply.message.id)
        : false,
      settings: agentVisualSettings,
      marker,
      cursor: cursorFrom(run, webTab, marker),
      recent: overlayReply ? recentSteps(overlayReply.message) : [],
      // Only once the overlay can show it: until then the chat holds the question.
      approval,
      minimized: approvalKey !== null && minimizedCards.has(approvalKey),
      goToTab,
    });
    // Tell the chat what the overlay already shows (so it does not show it again).
    const flags = overlayFlags(next);
    if (
      (flags.pill !== lastFlags.pill || flags.card !== lastFlags.card) &&
      !win.webContents.isDestroyed()
    ) {
      lastFlags = flags;
      win.webContents.send('overlay:flags', flags);
    }
    if (!next) {
      if (overlayShown) {
        overlayShown = false;
        overlayView.setVisible(false);
        win.contentView.removeChildView(overlayView);
        // Clear it too, so an old state is never flashed when it comes back.
        if (overlayReady) overlayPage.send('overlay:state', null);
      }
      return;
    }
    overlayView.setBounds(
      overlayBounds(
        next.mode,
        pageBounds(),
        overlayPeek && next.recent.length > 0,
      ),
    );
    const wasShown = overlayShown;
    overlayShown = true;
    overlayView.setVisible(true);
    if (!wasShown) restack();
    if (overlayReady) overlayPage.send('overlay:state', next);
    // A card that has just appeared asks for the keyboard, unless you are in the middle of
    // typing (then an Enter you are about to press for something else must not answer it).
    const cardKey = next.card
      ? stepKey(next.card.messageId, next.card.partId)
      : null;
    if (cardKey !== focusedCardKey) {
      focusedCardKey = cardKey;
      if (cardKey !== null) {
        void win.webContents
          .executeJavaScript(
            `(() => { const a = document.activeElement; return a ? { tagName: a.tagName, isContentEditable: a.isContentEditable, type: a.type } : null; })()`,
          )
          .then((active) => {
            if (cardMayTakeFocus(active) && !overlayPage.isDestroyed()) {
              overlayPage.focus();
            }
          })
          .catch(() => undefined);
      }
    }
  };

  // The window itself full screen (F11, and "Full screen" in the "…" menu).
  const toggleWindowFullscreen = () => {
    if (htmlFullscreen !== null) {
      // A full screen page: leaving it is the page's own business (Esc).
      pageContents(htmlFullscreen)
        ?.executeJavaScript(
          'document.fullscreenElement && document.exitFullscreen()',
        )
        .catch(() => undefined);
      return;
    }
    win.setFullScreen(!win.isFullScreen());
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
    const failed = failedPages.get(tabId);
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
      // Web content is untrusted: no Node.js, no bridge of ours, fully sandboxed. (The extension
      // library adds a small helper script to every page; it does nothing outside extension addresses.)
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
    // Tell the extensions about this page.
    extensions?.addTab(contents);
    // Links that want a new window (target="_blank") open as a new tab in the
    // same Space. Only normal web addresses are allowed.
    // A page may open a window only when you just clicked or pressed a key on it.
    // Otherwise it is blocked, and the chip in the address bar offers it to you.
    contents.setWindowOpenHandler(({ url, disposition }) => {
      const site = siteKey(
        model.findTab(state, tab.id)?.url ?? contents.getURL(),
      );
      const last = lastGesture.get(tab.id);
      const decision = decidePopup({
        answer: site === null ? null : answerFor(permissions, site, 'popups'),
        sinceGesture: last === undefined ? null : Date.now() - last,
      });
      if (decision === 'open') {
        const spaceId = model.findTab(state, tab.id)?.spaceId ?? null;
        if (model.isWebUrl(url)) {
          if (opensInBackground(disposition)) {
            openBackgroundTab(url, spaceId, tab.id);
          } else {
            openTab(url, spaceId);
          }
        }
      } else if (decision === 'block') {
        blockedPopups.set(
          tab.id,
          addBlocked(blockedPopups.get(tab.id) ?? [], url),
        );
        sendState();
      }
      return { action: 'deny' };
    });
    // A page can close its own window (window.close()). Its page is then gone, so
    // the tab closes with it (and is kept in Recently closed, like any closed tab).
    contents.once('destroyed', () => {
      // The window itself is closing and is taking its pages with it: there is nothing to tidy
      // (the tab must stay as it was saved, and the window can no longer be touched). Without this
      // an uncaught "Object has been destroyed" error could appear when the app was closed.
      if (windowGone()) return;
      if (htmlFullscreen === tab.id) leaveHtmlFullscreen();
      if (views.get(tab.id) !== view) return; // we closed it ourselves
      views.delete(tab.id);
      try {
        win.contentView.removeChildView(view);
      } catch {
        // Already gone.
      }
      closeTab(tab.id);
    });
    // Esc stops a page that is still loading (the key still reaches the page).
    contents.on('before-input-event', (_event, input) => {
      if (
        input.type === 'keyDown' &&
        input.key === 'Escape' &&
        !input.control &&
        !input.alt &&
        !input.meta &&
        !input.shift &&
        contents.isLoading()
      ) {
        contents.stop();
      }
    });
    // A video (or page) goes full screen, or stops being: it fills the window.
    contents.on('enter-html-full-screen', () => enterHtmlFullscreen(tab.id));
    contents.on('leave-html-full-screen', () => {
      if (htmlFullscreen === tab.id) leaveHtmlFullscreen();
    });
    // A page starts or stops making sound: the speaker on its tab follows.
    contents.on('audio-state-changed', () => sendState());
    // Remember when you last clicked or typed on the page.
    contents.on('input-event', (_event, input) => {
      if (
        input.type === 'mouseDown' ||
        input.type === 'mouseUp' ||
        input.type === 'keyDown' ||
        input.type === 'rawKeyDown' ||
        input.type === 'char'
      ) {
        lastGesture.set(tab.id, Date.now());
      }
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
      // The new page will report its own icon if it has another one. Until then the tab keeps the
      // icon it had on the same site (the engine does not always say it again), or shows the one
      // remembered for the other site.
      const before = model.findTab(state, tab.id);
      updateTab(tab.id, {
        url: contents.getURL(),
        favicon: iconAfterNavigation(
          favicons,
          before?.url ?? '',
          contents.getURL(),
          before?.favicon ?? null,
        ),
      });
    });
    contents.on('did-navigate-in-page', () =>
      updateTab(tab.id, { url: contents.getURL() }),
    );
    // A site whose certificate is wrong gets a warning page, not a blank one. The
    // address bar keeps showing the address that failed.
    contents.on('did-fail-load', (_event, code, _text, failedUrl, isMain) => {
      const cert = isCertError(code);
      if (
        !isMain ||
        !(cert || isLoadError(code)) ||
        !model.isWebUrl(failedUrl)
      ) {
        return;
      }
      let host = '';
      try {
        host = new URL(failedUrl).hostname;
      } catch {
        return;
      }
      failedPages.set(tab.id, {
        url: failedUrl,
        code,
        host,
        kind: cert ? 'cert' : 'load',
      });
      void contents.loadURL(
        cert ? certErrorUrl(host, code) : loadErrorUrl(host, code),
      );
    });
    // A page whose process crashed (or ran out of memory) gets a page saying so,
    // with Reload, instead of staying blank.
    contents.on('render-process-gone', (_event, details) => {
      // Not when the page was closed on purpose, or the window is closing (nothing can be shown then).
      // A page process that was killed from outside (the task manager, the system) shows the same
      // "this page stopped" page as a crash: it used to be left blank.
      if (details.reason === 'clean-exit') return;
      if (
        contents.isDestroyed() ||
        windowGone() ||
        views.get(tab.id) !== view
      ) {
        return;
      }
      const address = model.findTab(state, tab.id)?.url ?? '';
      if (!model.isWebUrl(address)) return;
      let host = '';
      try {
        host = new URL(address).hostname;
      } catch {
        // No name to show.
      }
      failedPages.set(tab.id, { url: address, code: 0, host, kind: 'crash' });
      void contents.loadURL(crashPageUrl(host));
    });
    contents.on('did-navigate', () => {
      // A new page starts with nothing blocked.
      blockedPopups.delete(tab.id);
      const failed = failedPages.get(tab.id);
      if (failed && contents.getURL().startsWith('data:text/html')) {
        updateTab(tab.id, { url: failed.url, favicon: null });
      } else if (failed) {
        failedPages.delete(tab.id);
      }
    });
    // A page may only send its own tab to a web address (or a blank page, or an extension's own
    // page): not to a file or any other kind of address, by a link, a script or a redirect.
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault();
    });
    // The warning page's two links.
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith('aib:')) return;
      event.preventDefault();
      const link = parseCertLink(url);
      const failed = failedPages.get(tab.id);
      if (!link || !failed || !contents.getURL().startsWith('data:text/html')) {
        return;
      }
      // "Reload" tries the address again; the other two are the certificate page's.
      if (link === 'reload') {
        failedPages.delete(tab.id);
        void contents.loadURL(failed.url);
        return;
      }
      if (failed.kind !== 'cert') return;
      failedPages.delete(tab.id);
      if (link === 'proceed') {
        if (!canProceed(failed.code)) return;
        certAllowed.add(failed.host);
        void contents.loadURL(failed.url);
      } else if (contents.navigationHistory.canGoBack()) {
        contents.navigationHistory.goBack();
      } else {
        void contents.loadURL(engineHome(activeEngine(searchEngine)));
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
      activeEngine(searchEngine),
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
    const contents = pageContents(tabId);
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
    const fileId = activeFileId();
    if (fileId !== null) {
      const next =
        direction === 0 ? 1 : stepZoom(fileZooms.get(fileId) ?? 1, direction);
      if (next === 1) fileZooms.delete(fileId);
      else fileZooms.set(fileId, next);
      sendState();
      return;
    }
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
      case 'fullscreen':
        toggleWindowFullscreen();
        break;
      case 'quick-search':
        openQuickSearch();
        break;
      case 'tab-search':
        openTabSearch();
        break;
    }
  };

  // Show whatever is selected: wake the active tab if needed, hide the other
  // views. A Lead tab has no web page: the toolbar window draws it instead.
  let lastOnNewTabPage = false;
  const showActive = () => {
    if (windowGone()) return;
    exitFullscreenIfAway();
    const id = activeTabId();
    const tab = id === null ? undefined : model.findTab(state, id);
    if (tab && !model.isNewTabPage(tab.url)) ensureView(tab);
    if (tab && tab.spaceId !== null && !tab.closed) {
      lastInSpace.set(tab.spaceId, tab.id);
    }
    if (tab) lastUsed.set(tab.id, Date.now());
    for (const [tabId, view] of views) {
      // Hidden pages are not resized while the layout slides, so catch up now.
      if (tabId === id) view.setBounds(pageBounds());
      view.setVisible(tabId === id && pageIsShown());
    }
    syncFind();
    hideSuggest();
    updateOverlay();
    if (id !== null) {
      const shown = pageContents(id);
      if (shown) extensions?.selectTab(shown);
    }
    // Keyboard focus goes to the page, unless it is hidden (chat-only mode). A
    // new-tab page is drawn by the window itself, which takes the keyboard.
    if (id !== null && pageIsShown() && !onNewTabPage()) {
      pageContents(id)?.focus();
    } else win.webContents.focus();
    // Entering or leaving a new-tab page moves the chat bar away or back.
    const now = onNewTabPage();
    if (now !== lastOnNewTabPage) {
      lastOnNewTabPage = now;
      applyLayout(true);
    }
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

  // New tabs opened straight after another untouched new tab (they show less).
  // Each one remembers the new tab it came after. It stays the plain version only
  // while that one is still an untouched new tab (not used to Ask, not gone, not a
  // web page any more).
  const secondNewTabs = new Map<number, number>();
  // New tabs that were used to Ask (they are not "untouched").
  const usedNewTabs = new Set<number>();
  const untouchedNewTab = (id: number): boolean => {
    const t = model.findTab(state, id);
    return t !== undefined && model.isNewTabPage(t.url) && !usedNewTabs.has(id);
  };
  const openTab = (url: string, spaceId: number | null) => {
    const before = activeTabId();
    const afterNewTab =
      model.isNewTabPage(url) &&
      before !== null &&
      onNewTabPage() &&
      untouchedNewTab(before);
    const added = model.addTab(state, { url, spaceId });
    if (afterNewTab && before !== null) secondNewTabs.set(added.id, before);
    commitAndShow(revealPage(added.state));
  };

  // Open a page behind the one you are on, right after it, and start loading it
  // (middle-click and Ctrl+click on a link, or on a row in the Library).
  const openBackgroundTab = (
    url: string,
    spaceId: number | null,
    after?: number,
  ) => {
    const added = model.addTab(state, {
      url,
      spaceId,
      activate: false,
      after,
    });
    commit(added.state);
    const tab = model.findTab(state, added.id);
    if (tab) ensureView(tab);
  };

  // Throw away a tab's live web page (if it has one).
  // A tab's page, or nothing if it has none (or it is gone: a page can close its own
  // window, which destroys it).
  const pageContents = (id: number): Electron.WebContents | undefined => {
    const contents = views.get(id)?.webContents;
    return contents && !contents.isDestroyed() ? contents : undefined;
  };

  const destroyView = (id: number) => {
    const view = views.get(id);
    if (!view) return;
    views.delete(id);
    if (!view.webContents.isDestroyed())
      extensions?.removeTab(view.webContents);
    win.contentView.removeChildView(view);
    view.webContents.close();
  };

  // The window is never left with nothing to show.
  const withSomethingActive = (next: SavedState): SavedState =>
    next.active === null
      ? model.addTab(next, { url: newTabUrl() }).state
      : next;

  // Close a tab. In a Space the page stays as a closed link on the overview.
  const closeTab = (id: number) => {
    const tab = model.findTab(state, id);
    if (!tab || tab.closed) return;
    syncLinkSnapshots(); // So a chat's link to this tab remembers its latest name.
    if (!model.isNewTabPage(tab.url)) {
      closedTabs = recordClosed(
        closedTabs,
        { url: tab.url, title: tab.title, spaceId: tab.spaceId },
        Date.now(),
      );
      closedSaver.schedule();
      libraryChanged();
    }
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

  // Allow (or stop allowing) the internet in an HTML artifact's preview. Allowing it
  // asks first, in a native window: such a page can send out whatever is written in
  // it. The permission is for the text as it is now (see artifacts.ts). Returns
  // whether it is allowed afterwards.
  const askArtifactInternet = async (
    id: number,
    on: boolean,
  ): Promise<boolean> => {
    const found = artifactsModel.findArtifact(artifacts, id);
    if (!found || found.kind !== 'html') return false;
    if (on && !artifactsModel.hasInternet(found)) {
      const yes = await confirm({
        title: 'Allow the internet for this page?',
        message: `Let “${found.title}” use the internet?`,
        detail:
          'The page will be able to load files from websites (like fonts and libraries) and to send information out, including anything written in the page. It still cannot reach your own computer or network.\n\nThis is only for the page as it is now: if the assistant changes it, you will be asked again. Only allow pages you trust.',
        button: 'Allow internet',
      });
      const again = artifactsModel.findArtifact(artifacts, id);
      if (!yes || !again)
        return again ? artifactsModel.hasInternet(again) : false;
    }
    const result = artifactsModel.setArtifactInternet(artifacts, id, on);
    if (!result.ok) return false;
    commitArtifacts(result.state);
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('artifact:internet', id);
    }
    return artifactsModel.hasInternet(result.artifact);
  };
  // The app refuses what a preview asks of the network unless this says yes: the
  // artifact on screen is an HTML one you allowed.
  setPreviewInternetCheck(() => {
    const active = state.active;
    if (!active || active.kind !== 'artifact') return false;
    const found = artifactsModel.findArtifact(artifacts, active.id);
    return (
      found !== undefined &&
      found.kind === 'html' &&
      artifactsModel.hasInternet(found)
    );
  });

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
        detail: `This closes its ${count} tab${count === 1 ? '' : 's'}. It waits in Recently deleted in the Library, where you can bring it back.`,
        button: 'Delete Space and close tabs',
      }))
    ) {
      return;
    }
    // The Space may have changed (or been deleted by something else) while the dialog was open: what
    // is put away is what it is now, and nothing is put away twice.
    const current = model.findSpace(state, id);
    if (!current) return;
    syncLinkSnapshots(); // Chats' links to this Space and its tabs remember them.
    // It waits in Recently deleted (its pages as links, and which artifacts it held),
    // unless there was nothing in it.
    const pages = state.tabs
      .filter((t) => t.spaceId === id && model.isWebUrl(t.url))
      .map((t) => ({ title: t.title, url: t.url }));
    const artifactIds = artifacts.artifacts
      .filter((a) => a.spaceId === id)
      .map((a) => a.id);
    if (pages.length > 0 || artifactIds.length > 0 || current.about !== '') {
      spaceTrash = trashSpace(
        spaceTrash,
        {
          spaceId: id,
          name: current.name,
          color: current.color,
          emoji: current.emoji,
          about: current.about,
          pages,
          artifactIds,
        },
        Date.now(),
      );
      spaceTrashSaver.schedule();
      libraryChanged();
    }
    const result = model.deleteSpace(state, id);
    // Its artifacts are kept, just no longer in a Space.
    commitArtifacts(artifactsModel.releaseSpace(artifacts, id));
    for (const tabId of result.removedTabIds) destroyView(tabId);
    commitAndShow(withSomethingActive(result.state));
  };

  // Delete a Space with no question and no "Recently deleted" copy. Only for test runs
  // (AIB_TEST_SCOPE=1), which clean up the Spaces they made.
  const deleteSpaceQuietly = (id: number) => {
    const result = model.deleteSpace(state, id);
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
      // A page that is already gone has nothing left to load (the caller then finds it closed).
      if (contents.isDestroyed() || !contents.isLoading()) {
        resolve(true);
        return;
      }
      const done = (value: boolean) => {
        clearTimeout(timer);
        if (!contents.isDestroyed()) {
          contents.removeListener('did-stop-loading', onStop);
          contents.removeListener('destroyed', onStop);
        }
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      };
      const onStop = () => done(true);
      const onAbort = () => done(false);
      const timer = setTimeout(() => done(false), limitMs);
      contents.once('did-stop-loading', onStop);
      // The page closing while it loads ends the wait at once, instead of after the whole limit.
      contents.once('destroyed', onStop);
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
    if (!tab || tab.closed || model.isNewTabPage(tab.url)) {
      return { ok: false, reason: 'closed' };
    }
    const wasAsleep = !views.has(tabId);
    if (wasAsleep) wokeForAssistant.add(tabId);
    const contents = ensureView(tab).webContents;
    if (wasAsleep) sendState();
    if (contents.isDestroyed()) return { ok: false, reason: 'closed' };
    if (!(await waitForLoad(contents, signal, 15_000))) {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: true, contents };
  };

  // Save a page's text (or just the selected text) as a Markdown artifact. The text is
  // read straight from the page and never passes through a model. Used by the
  // assistant's save_page_as_artifact and by the page's right-click menu.
  const savePageAsArtifact = async (
    contents: Electron.WebContents,
    what: 'page' | 'selection',
    title: string | null,
    spaceId: number | null,
    fallbackText = '',
  ): Promise<SaveResult> => {
    let page: { title: string; url: string; text: string };
    try {
      page =
        what === 'selection'
          ? await withCdp(contents, 8000, readSelectionVia)
          : await readPageText(contents);
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    // If the page would not give the selection back, use what the menu was given.
    const text = cleanSavedText(page.text) || cleanSavedText(fallbackText);
    if (text === '') return { ok: false, reason: 'empty' };
    const name = title ?? (cleanLabel(page.title, 80) || 'Saved page');
    const made = artifactsModel.createArtifact(
      artifacts,
      {
        kind: 'markdown',
        title: name,
        content: savedContent({
          title: name,
          url: page.url,
          what,
          text,
          now: new Date(),
        }),
        spaceId:
          spaceId !== null && model.findSpace(state, spaceId) ? spaceId : null,
      },
      Date.now(),
    );
    if (!made.ok) {
      return {
        ok: false,
        reason:
          made.reason === 'too-long'
            ? 'too-long'
            : made.reason === 'too-many'
              ? 'too-many'
              : 'unavailable',
      };
    }
    commitArtifacts(made.state);
    return {
      ok: true,
      artifactId: made.artifact.id,
      title: made.artifact.title,
      chars: text.length,
    };
  };

  // "Save page as artifact" / "Save selection as artifact" in a page's right-click
  // menu: save it in the page's Space, then show it.
  const saveFromMenu = async (
    tabId: number,
    contents: Electron.WebContents,
    what: 'page' | 'selection',
    selectedText: string,
  ) => {
    const tab = model.findTab(state, tabId);
    if (!tab || contents.isDestroyed()) return;
    const saved = await savePageAsArtifact(
      contents,
      what,
      null,
      tab.spaceId,
      selectedText,
    );
    if (saved.ok) {
      openArtifact(saved.artifactId);
      return;
    }
    const reason =
      saved.reason === 'closed' || saved.reason === 'timeout'
        ? 'unavailable'
        : saved.reason;
    void dialog.showMessageBox(win, {
      type: 'info',
      message: 'Nothing was saved.',
      detail: saveFailureWords(reason, what),
    });
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

  // A picture of what a tab shows (shrunk if it is big), for a model that can see.
  const screenshotTab = async (
    tabId: number,
    signal: AbortSignal,
  ): Promise<ShotRead> => {
    const ready = await prepareTab(tabId, signal);
    if (!ready.ok) return ready;
    try {
      const raw = await withCdp(ready.contents, 10_000, captureScreenshotVia);
      const bytes = Buffer.from(raw, 'base64');
      const picture = nativeImage.createFromBuffer(bytes);
      const size = picture.getSize();
      const fit = fitWithin(size.width, size.height, MAX_SHOT_SIDE);
      const shrunk =
        !picture.isEmpty() &&
        (fit.width !== size.width || fit.height !== size.height);
      const out = shrunk
        ? picture.resize({
            width: fit.width,
            height: fit.height,
            quality: 'good',
          })
        : picture;
      return {
        ok: true,
        title: ready.contents.getTitle(),
        url: ready.contents.getURL(),
        mime: 'image/jpeg',
        data: shrunk ? out.toJPEG(80).toString('base64') : raw,
        width: shrunk ? fit.width : size.width,
        height: shrunk ? fit.height : size.height,
      };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };

  // Find text in a tab, scrolling to the first match.
  const findInTab = async (
    tabId: number,
    text: string,
    signal: AbortSignal,
  ): Promise<FindRead> => {
    const ready = await prepareTab(tabId, signal);
    if (!ready.ok) return ready;
    try {
      const found = await withCdp(ready.contents, 8000, (cdp) =>
        findInPageVia(cdp, text),
      );
      return { ok: true, ...found };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };

  // The tables of a tab.
  const tablesInTab = async (
    tabId: number,
    signal: AbortSignal,
  ): Promise<TablesRead> => {
    const ready = await prepareTab(tabId, signal);
    if (!ready.ok) return ready;
    try {
      const read = await withCdp(ready.contents, 8000, readTablesVia);
      return { ok: true, ...read };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };

  // What the HTML previews of artifacts last reported (errors, blocked loads), and who
  // is waiting for the next report (the assistant's check_artifact tool).
  interface PreviewReport {
    at: number;
    messages: { kind: 'blocked' | 'error'; text: string }[];
  }
  const previewReports = new Map<number, PreviewReport>();
  const previewWaiters = new Map<
    number,
    ((r: PreviewReport | null) => void)[]
  >();
  ipcMain.on(
    'artifact:preview-report',
    (event, id: unknown, messages: unknown) => {
      if (event.sender !== win.webContents || typeof id !== 'number') return;
      if (!Array.isArray(messages)) return;
      const clean: PreviewReport['messages'] = [];
      for (const m of messages.slice(0, 20)) {
        const item = m as { kind?: unknown; text?: unknown } | null;
        if (
          item !== null &&
          typeof item === 'object' &&
          (item.kind === 'blocked' || item.kind === 'error') &&
          typeof item.text === 'string'
        ) {
          clean.push({ kind: item.kind, text: item.text.slice(0, 200) });
        }
      }
      const entry: PreviewReport = { at: Date.now(), messages: clean };
      previewReports.set(id, entry);
      for (const resolve of previewWaiters.get(id) ?? []) resolve(entry);
      previewWaiters.delete(id);
    },
  );

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
  // The tabs it worked in during the newest run, and what a finished run left on them (green:
  // finished while you were elsewhere, red: got stuck) until you open them (sidebarStatus.ts).
  const ranIn = new Set<number>();
  // Tabs that were asleep when the assistant needed them (shown on its step while it runs).
  const wokeForAssistant = new Set<number>();
  const unseen = new Map<number, Unseen>();
  let sidebarRunId: number | null = null;
  let sidebarRunEnded = true;
  let sidebarKey = '';
  const setWorking = (tabId: number, on: boolean) => {
    if (on) {
      working.add(tabId);
      ranIn.add(tabId);
    } else {
      working.delete(tabId);
      wokeForAssistant.delete(tabId);
    }
    sendState();
  };
  // What the sidebar shows of the assistant's work now: a dot per tab and the chip on top.
  const assistantSidebar = () => {
    // A tab that is gone has nothing to show. (What a finished run left on a tab stays until
    // you have seen it at its row, even if you are in that tab: see 'tab:seen'.)
    for (const tab of [...unseen.keys()]) {
      if (model.findTab(state, tab)?.closed !== false) unseen.delete(tab);
    }
    const run = overlayReply ? runOf(overlayReply.message) : null;
    const statuses = tabStatuses({ run, working, unseen });
    const batch = overlayReply
      ? popoutOf(overlayReply.message, state.tabs)?.card
      : null;
    const chip = runChip({
      run,
      workingTabs: working.size,
      changes: batch?.list ? batch.list.length + (batch.more ?? 0) : 0,
      stuck: [...statuses.values()].includes('stuck'),
    });
    // Which tabs a move or close request waiting for you would change.
    const waiting = overlayReply
      ? overlayReply.message.parts.find(
          (p): p is Extract<typeof p, { type: 'tool' }> =>
            p.type === 'tool' && p.status === 'waiting',
        )
      : undefined;
    const pending = pendingChanges(
      overlayReply?.message.status === 'streaming' && waiting ? waiting : null,
      state.tabs,
      state.spaces,
    );
    return { statuses, chip, pending };
  };
  // The run changed: note when it ends (for the green and red dots), and tell the sidebar if
  // what it shows is different now.
  const sidebarRunChanged = (message: chatsModel.ChatMessage) => {
    if (message.id !== sidebarRunId) {
      sidebarRunId = message.id;
      sidebarRunEnded = false;
      ranIn.clear();
    }
    if (message.status !== 'streaming' && !sidebarRunEnded) {
      sidebarRunEnded = true;
      for (const [tab, mark] of unseenAfterRun(runOf(message), ranIn)) {
        unseen.set(tab, mark);
      }
    }
    const view = assistantSidebar();
    const key = JSON.stringify([
      [...view.statuses],
      view.chip,
      [...view.pending],
    ]);
    if (key !== sidebarKey) {
      sidebarKey = key;
      sendState();
    }
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

  // The result of a step that ended with the page where it is now. If the step itself closed the page
  // (a button that closes the tab, window.close()), that is what is reported, not a failure.
  const finished = (contents: Electron.WebContents): ActionResult =>
    contents.isDestroyed()
      ? { ok: false, reason: 'closed' }
      : {
          ok: true,
          url: contents.getURL(),
          title: contents.getTitle(),
        };

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
      done = await inTurn(tabId, () =>
        withCdp(ready.contents, 15_000, async (cdp) => {
          // Act as if the page has the keyboard, even though the chat does.
          await cdp
            .send('Emulation.setFocusEmulationEnabled', { enabled: true })
            .catch(() => undefined);
          return work(cdp);
        }),
      );
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
    skillStore: {
      listSkills: () =>
        skills.skills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          enabled: s.enabled,
        })),
      readSkill: (id) => {
        const skill = findSkill(skills, id);
        return skill
          ? {
              name: skill.name,
              description: skill.description,
              instructions: skill.instructions,
              enabled: skill.enabled,
            }
          : null;
      },
      makeSkill: (input) => {
        const made = createSkill(skills, input, Date.now(), 'assistant');
        if (!made.ok)
          return { ok: false, problem: PROBLEM_WORDS[made.problem] };
        commitSkills(made.state);
        return { ok: true, id: made.skill.id, name: made.skill.name };
      },
      changeSkill: (id, changes) => {
        const updated = updateSkill(skills, id, changes, Date.now());
        if (!updated.ok) {
          return {
            ok: false,
            problem:
              updated.problem === 'not-found'
                ? 'That skill no longer exists.'
                : PROBLEM_WORDS[updated.problem],
          };
        }
        commitSkills(updated.state);
        return { ok: true, name: updated.skill.name };
      },
    },
    saveStore: {
      savePage: async (chatId, tabId, what, title, spaceId, signal) => {
        const ready = await prepareTab(tabId, signal);
        if (!ready.ok) return ready;
        const saved = await savePageAsArtifact(
          ready.contents,
          what,
          title,
          spaceId,
        );
        if (!saved.ok) return saved;
        // Link it to the chat, so the assistant can read it.
        commitChats(
          chatsModel.addRef(chats, chatId, {
            kind: 'artifact',
            id: saved.artifactId,
            title: saved.title,
            url: null,
          }),
        );
        return saved;
      },
      bookmarkPage: async (tabId) => {
        const tab = model.findTab(state, tabId);
        if (!tab || tab.closed) return { ok: false, reason: 'closed' };
        if (historyUrl(tab.url) === null)
          return { ok: false, reason: 'not-web' };
        const already = isBookmarked(bookmarks, tab.url);
        if (!already) {
          const next = addBookmark(bookmarks, tab.url, tab.title, Date.now());
          if (next === bookmarks) return { ok: false, reason: 'full' };
          bookmarks = next;
          bookmarksSaver.schedule();
          libraryChanged();
          sendState();
        }
        return { ok: true, already, title: tab.title };
      },
      checkPreview: async (artifactId, signal) => {
        const found = artifactsModel.findArtifact(artifacts, artifactId);
        if (!found) return { ok: false, reason: 'missing' };
        if (found.kind !== 'html') return { ok: false, reason: 'not-html' };
        // Wait for the open preview to say how it went (it runs again, so this is a
        // fresh run), or give up if it never does (the editor is on screen instead).
        let timer: ReturnType<typeof setTimeout> | undefined;
        const report = new Promise<PreviewReport | null>((resolve) => {
          const waiters = previewWaiters.get(artifactId) ?? [];
          waiters.push(resolve);
          previewWaiters.set(artifactId, waiters);
          timer = setTimeout(() => resolve(null), 8000);
          signal.addEventListener('abort', () => resolve(null), { once: true });
        });
        openArtifact(artifactId);
        // The page may already be open (and loaded): ask it to run again.
        if (!win.webContents.isDestroyed()) {
          win.webContents.send('artifact:preview-check', artifactId);
        }
        const got = await report;
        clearTimeout(timer);
        previewWaiters.delete(artifactId);
        if (got === null) return { ok: false, reason: 'not-shown' };
        return {
          ok: true,
          problems: got.messages,
          internet: artifactsModel.hasInternet(found),
        };
      },
    },
    recallStore: {
      now: () => Date.now(),
      searchHistory: (query, limit, since) =>
        searchHistoryLoose(history, query, limit, since).map((e) => ({
          title: e.title,
          url: e.url,
          at: e.visitedAt,
        })),
      searchBookmarks: (query, limit, since) =>
        searchBookmarksLoose(bookmarks, query, limit, since).map((b) => ({
          title: b.title,
          url: b.url,
          at: b.addedAt,
        })),
      searchChats: (query, limit) =>
        chatsModel
          .searchChats(chats, query)
          .slice(0, limit)
          .flatMap((match) => {
            const chat = chatsModel.findConversation(chats, match.id);
            return chat
              ? [
                  {
                    id: chat.id,
                    title: chat.title,
                    at: chat.updatedAt,
                    snippet: match.snippet,
                  },
                ]
              : [];
          }),
      readChat: (id) => {
        const chat = chatsModel.findConversation(chats, id);
        if (!chat) return null;
        return {
          title: chat.title,
          at: chat.updatedAt,
          messages: chat.messages.flatMap((m) =>
            (m.role === 'user' || m.role === 'assistant') && m.content !== ''
              ? [{ role: m.role, text: m.content }]
              : [],
          ),
        };
      },
    },
    tabStore: {
      allTabs: () =>
        state.tabs.map((t) => ({
          id: t.id,
          title: t.title,
          url: t.url,
          spaceId: t.spaceId,
          closed: t.closed,
          asleep: !t.closed && !views.has(t.id),
          active: state.active?.kind === 'tab' && state.active.id === t.id,
        })),
      allSpaces: () =>
        state.spaces.map((s) => ({
          id: s.id,
          name: s.name,
          emoji: emojiOr(s.emoji, DEFAULT_SPACE_EMOJI),
          hasNote: s.about.trim() !== '',
        })),
      moveTab: (tabId, spaceId) => {
        const tab = model.findTab(state, tabId);
        if (!tab) return { ok: false, reason: 'no-tab' };
        if (spaceId !== null && !model.findSpace(state, spaceId)) {
          return { ok: false, reason: 'no-space' };
        }
        if (model.isNewTabPage(tab.url))
          return { ok: false, reason: 'new-tab' };
        commit(model.moveTab(state, tabId, spaceId));
        return { ok: true };
      },
      closeTab: (tabId) => {
        const tab = model.findTab(state, tabId);
        if (!tab) return { ok: false, reason: 'no-tab' };
        if (tab.closed) return { ok: false, reason: 'closed' };
        closeTab(tabId);
        return { ok: true };
      },
      sleepTab: (tabId) => {
        const tab = model.findTab(state, tabId);
        if (!tab) return { ok: false, reason: 'no-tab' };
        if (tab.closed) return { ok: false, reason: 'closed' };
        if (state.active?.kind === 'tab' && state.active.id === tabId) {
          return { ok: false, reason: 'active' };
        }
        if (!views.has(tabId)) return { ok: false, reason: 'asleep' };
        putToSleep([tabId]);
        return { ok: true };
      },
      reopenTab: (tabId) => {
        const tab = model.findTab(state, tabId);
        if (!tab) return { ok: false, reason: 'no-tab' };
        if (!tab.closed) return { ok: false, reason: 'open' };
        // Opened where it is, without switching to it.
        commit({ ...model.reopenTab(state, tabId), active: state.active });
        return { ok: true };
      },
      spaceNote: (spaceId) => model.findSpace(state, spaceId)?.about ?? null,
      setSpaceNote: (spaceId, text) => {
        if (!model.findSpace(state, spaceId)) return { ok: false };
        commit(model.setSpaceAbout(state, spaceId, text));
        return { ok: true };
      },
    },
    screenshotPage: screenshotTab,
    findInPage: findInTab,
    readTables: tablesInTab,
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
      readFile: (id) => readUploadedFile(id),
      read: (id) => {
        const found = artifactsModel.findArtifact(artifacts, id);
        return found
          ? { title: found.title, kind: found.kind, content: found.content }
          : null;
      },
      create: (chatId, input) => {
        // A Space deleted while the card waited for you is not a place to put it: it goes outside every
        // Space (it would otherwise be lost from the panel).
        const place =
          input.spaceId !== null && !model.findSpace(state, input.spaceId)
            ? { ...input, spaceId: null }
            : input;
        const result = artifactsModel.createArtifact(
          artifacts,
          place,
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
    siteTrust: (host) => trustOf(siteTrustState, host),
    trustSite: (host) => {
      const result = withSiteTrust(siteTrustState, host, 'trusted');
      if (!result.ok) return;
      siteTrustState = result.state;
      siteTrustSaver.schedule();
    },
    search: search.catch(() => null),
    linkTab: (chatId, tabId) => {
      const tab = model.findTab(state, tabId);
      if (!tab || tab.closed) return false;
      commitChats(
        chatsModel.addRef(chats, chatId, {
          kind: 'tab',
          id: tabId,
          title: tab.title,
          url: tab.url,
        }),
      );
      // Linked now? (Not when the chat already has as many links as it can hold.)
      return (
        chatsModel
          .findConversation(chats, chatId)
          ?.refs.some((ref) => ref.kind === 'tab' && ref.id === tabId) ?? false
      );
    },
    // Every piece of a streaming reply lands here: save soon, but do not rebuild
    // the whole UI each time.
    setChats: (next) => {
      chats = next;
      chatsSaver.schedule();
    },
    onMeta: sendState,
    // A screenshot the assistant took: keep a small copy, in memory only, for the step row.
    onPicture: (chatId, messageId, partId, picture) => {
      if (!agentVisualSettings.showThumbnails) return;
      try {
        const image = nativeImage.createFromBuffer(
          Buffer.from(picture.data, 'base64'),
        );
        if (image.isEmpty()) return;
        const small =
          image.getSize().width > THUMBNAIL_WIDTH
            ? image.resize({ width: THUMBNAIL_WIDTH })
            : image;
        thumbnails.set(
          thumbnailKey(chatId, messageId, partId),
          'data:image/jpeg;base64,' + small.toJPEG(70).toString('base64'),
        );
      } catch {
        // A thumbnail is only a picture for the row: never a reason to stop a reply.
      }
    },
    onStepTarget: (_chatId, messageId, partId, target) => {
      stepTargets.set(stepKey(messageId, partId), target);
      // Measure it now (the element scrolls into view), so the ring is there while it
      // waits for your approval, not only once it runs.
      measureTarget(stepKey(messageId, partId), target, true);
    },
    onReplyChanged: (chatId, message) => {
      if (message.role !== 'assistant') return;
      if (!message.parts.some((part) => part.type === 'tool')) return;
      overlayReply = { chatId, message };
      sidebarRunChanged(message);
      updateOverlay();
    },
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
    commitSkills(purgeOldSkills(skills, now, librarySettings.trashDays));
    const keptSpaces = purgeOldTrashedSpaces(
      spaceTrash,
      now,
      librarySettings.trashDays,
    );
    if (keptSpaces !== spaceTrash) {
      spaceTrash = keptSpaces;
      spaceTrashSaver.schedule();
    }
  };

  // Make a Space with a name, colour, picture and note, and its pages as links
  // (closed ones stay closed; the rest are sleeping tabs). Returns its id.
  const buildSpace = (input: {
    name: string;
    color: string;
    emoji: string | null;
    about: string;
    pages: { title: string; url: string; closed: boolean }[];
  }): number | null => {
    if (state.spaces.length >= model.MAX_SPACES) return null;
    const created = model.addSpace(state, input.name);
    let next = created.state;
    const color = model.SPACE_COLORS.find((c) => c === input.color);
    if (color) next = model.setSpaceColor(next, created.id, color);
    if (input.emoji !== null) {
      next = model.setSpaceEmoji(next, created.id, input.emoji);
    }
    next = model.setSpaceAbout(next, created.id, input.about);
    for (const page of input.pages) {
      if (!model.isWebUrl(page.url)) continue;
      const added = model.addTab(next, {
        url: page.url,
        spaceId: created.id,
        activate: false,
      });
      next = model.updateTab(added.state, added.id, { title: page.title });
      if (page.closed) next = model.closeTab(next, added.id);
    }
    commit(next);
    return created.id;
  };

  // Bring a deleted Space back from Recently deleted: its pages come back as closed
  // links, and its artifacts that are still around and in no Space move back in.
  const restoreDeletedSpace = (trashId: number) => {
    const taken = takeTrashedSpace(spaceTrash, trashId);
    if (!taken) return;
    const id = buildSpace({
      ...taken.item,
      pages: taken.item.pages.map((p) => ({ ...p, closed: true })),
    });
    if (id === null) {
      // It stays in Recently deleted, and you are told why nothing happened.
      void dialog.showMessageBox(win, {
        type: 'info',
        title: 'Cannot bring it back',
        message: 'There are too many Spaces to bring this one back.',
        detail: 'Delete a Space you no longer need, then try again.',
        buttons: ['OK'],
      });
      return;
    }
    spaceTrash = taken.trash;
    spaceTrashSaver.schedule();
    // The chats that were linked to the Space are linked to it again (it has a new number now).
    if (taken.item.spaceId !== null) {
      commitChats(
        chatsModel.retargetEverywhere(chats, 'space', taken.item.spaceId, {
          id,
          title: taken.item.name,
          url: null,
        }),
      );
    }
    let kept = artifacts;
    for (const artifactId of taken.item.artifactIds) {
      const found = artifactsModel.findArtifact(kept, artifactId);
      if (!found || found.spaceId !== null) continue;
      const moved = artifactsModel.updateArtifact(
        kept,
        artifactId,
        { spaceId: id },
        Date.now(),
      );
      if (moved.ok) kept = moved.state;
    }
    commitArtifacts(kept);
    libraryChanged();
    select({ kind: 'lead', spaceId: id });
  };

  // A copy of a Space: same colour, picture and note, its pages as sleeping tabs
  // (the closed ones stay closed), and copies of its artifacts. Chats are not copied.
  const duplicateSpace = (spaceId: number) => {
    const source = model.findSpace(state, spaceId);
    if (!source) return;
    const id = buildSpace({
      name: `${source.name} copy`,
      color: source.color,
      emoji: source.emoji,
      about: source.about,
      pages: state.tabs
        .filter((t) => t.spaceId === spaceId)
        .map((t) => ({ title: t.title, url: t.url, closed: t.closed })),
    });
    if (id === null) return;
    for (const a of artifacts.artifacts.filter((x) => x.spaceId === spaceId)) {
      copyArtifact(a.id, id);
    }
    select({ kind: 'lead', spaceId: id });
  };

  // Save a Space as a Markdown file (its pages and artifact titles, not their text).
  const exportSpace = async (spaceId: number) => {
    const space = model.findSpace(state, spaceId);
    if (!space) return;
    const picked = await dialog.showSaveDialog(win, {
      title: 'Export Space',
      defaultPath: path.join(
        app.getPath('documents'),
        exportFileName(space.name),
      ),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (picked.canceled || !picked.filePath) return;
    const text = spaceMarkdown({
      name: space.name,
      about: space.about,
      pages: state.tabs
        .filter((t) => t.spaceId === spaceId)
        .map((t) => ({ title: t.title, url: t.url, closed: t.closed })),
      artifacts: artifacts.artifacts
        .filter((a) => a.spaceId === spaceId)
        .map((a) => ({ title: a.title, kind: a.kind })),
    });
    try {
      fs.writeFileSync(picked.filePath, text, 'utf8');
    } catch (error) {
      void dialog.showMessageBox(win, {
        type: 'error',
        message: 'The Space could not be saved.',
        detail: (error as Error).message,
      });
    }
  };

  // Save a chat as a Markdown file you choose the place for.
  const exportChat = async (chatId: number) => {
    const chat = chatsModel.findConversation(chats, chatId);
    if (!chat) return;
    const picked = await dialog.showSaveDialog(win, {
      title: 'Export chat',
      defaultPath: path.join(
        app.getPath('documents'),
        exportFileName(chat.title, 'Chat'),
      ),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (picked.canceled || !picked.filePath) return;
    try {
      fs.writeFileSync(picked.filePath, chatMarkdown(chat, new Date()), 'utf8');
    } catch (error) {
      void dialog.showMessageBox(win, {
        type: 'error',
        message: 'The chat could not be saved.',
        detail: (error as Error).message,
      });
    }
  };

  // "Try again" on a step: ask the assistant to try it again, with fixed words (nothing
  // from a page goes into the message). Only for a failed or cut-off step in the
  // newest reply, when nothing is being written, so it stays in the assistant's own
  // loop and goes through the usual approvals.
  const retryStep = (chatId: number, messageId: number, partId: number) => {
    if (!chatService || chatService.runningChats().includes(chatId)) return;
    const chat = chatsModel.findConversation(chats, chatId);
    const message = chat?.messages[chat.messages.length - 1];
    if (!chat || !message || message.id !== messageId) return;
    if (message.role !== 'assistant') return;
    const part = message.parts.find(
      (p) => p.type === 'tool' && p.id === partId,
    );
    if (!part || part.type !== 'tool') return;
    const state = stepState(part, message.status);
    if (state !== 'failed' && state !== 'stopped') return;
    const result = chatService.sendMessage(chatId, retryRequest(part.name), []);
    if (!result.ok) {
      void dialog.showMessageBox(win, {
        type: 'info',
        message: 'The step could not be tried again.',
        detail: result.error,
      });
    }
  };

  // "Make a skill from this chat…": go to that chat and ask the assistant to write the
  // skill with create_skill (so the whole text is on the approval card).
  const makeSkillFromChat = (chatId: number) => {
    const chat = chatsModel.findConversation(chats, chatId);
    if (!chat || chat.messages.length === 0 || !chatService) return;
    chatMenuActions.selectChat(chatId);
    if (state.settings.viewMode === 'page') {
      commitAndShow(model.setViewMode(state, 'both'));
    }
    const result = chatService.sendMessage(chatId, MAKE_SKILL_REQUEST, []);
    if (!result.ok) {
      void dialog.showMessageBox(win, {
        type: 'info',
        message: 'The skill could not be started.',
        detail: result.error,
      });
    }
  };

  // "Search chats…": show only the chat (whose list is in the sidebar) and put the
  // keyboard in the list's search box.
  const openChatSearch = () => {
    if (state.settings.viewMode !== 'chat') {
      commitAndShow(model.setViewMode(state, 'chat'));
    }
    if (!pinnedNow()) setHover(true);
    if (sidebar.isDestroyed()) return;
    sidebar.send('chats:focus-search');
    sidebar.focus(); // So the box can take keyboard input.
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
    selectChat: (id) => commitChats(chatsModel.selectConversation(chats, id)),
    newChat: () => commitChats(chatsModel.startNewChat(chats).state),
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
      // Its documents stay, just no longer in a Space (they used to be lost from the panel).
      commitArtifacts(artifactsModel.releaseSpace(artifacts, spaceId));
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
    // An uploaded file: its bytes are copied under the copy's number first.
    const newId = artifacts.nextId;
    if (original.file) {
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.copyFileSync(uploadPath(original), uploadPath(original, newId));
      } catch {
        return null;
      }
    }
    const result = artifactsModel.createArtifact(
      artifacts,
      {
        kind: original.kind,
        title: `${original.title} (copy)`,
        content: original.content,
        file: original.file ?? undefined,
        spaceId,
      },
      Date.now(),
    );
    if (!result.ok) {
      if (original.file)
        fs.rmSync(uploadPath(original, newId), { force: true });
      return null;
    }
    commitArtifacts(result.state);
    return result.artifact.id;
  };

  // ---- Uploads ---------------------------------------------------------------
  // (pickAndImport, defined below, asks which files and adds them.)
  // An uploaded image or PDF is kept as a file in uploads/, named by its artifact's
  // number. Text files are read straight into text artifacts.
  const uploadsDir = path.join(app.getPath('userData'), 'uploads');
  function uploadPath(
    artifact: { id: number; file: { ext: string } | null },
    id = artifact.id,
  ): string {
    return path.join(uploadsDir, `${id}.${artifact.file?.ext ?? 'bin'}`);
  }
  // At start: files whose artifact is gone for good are deleted.
  const sweepUploads = () => {
    // If the list of artifacts could not be read, it is empty only because of that: nothing is
    // swept, or every upload would be deleted for want of a list.
    if (isUnreadable(artifactsFile)) return;
    try {
      const keep = new Set(
        [...artifacts.artifacts, ...artifacts.trash]
          .filter((a) => a.file)
          .map((a) => path.basename(uploadPath(a))),
      );
      for (const name of fs.readdirSync(uploadsDir)) {
        if (!keep.has(name))
          fs.rmSync(path.join(uploadsDir, name), { force: true });
      }
    } catch {
      // No uploads folder yet.
    }
  };
  sweepUploads();

  // Add files you chose or dropped, as artifacts in a Space (or in none). Returns
  // how many were added. Files that cannot be added are listed in one message.
  // With a chat given (`chatId`), the files are attached to that chat (linked to it)
  // and nothing is opened.
  const importFiles = async (
    rawPaths: unknown,
    spaceId: number | null,
    chatId: number | null = null,
    // When given, the new artifacts' numbers are added here and nothing is opened.
    collect?: number[],
  ): Promise<number> => {
    if (!Array.isArray(rawPaths)) return 0;
    if (spaceId !== null && !model.findSpace(state, spaceId)) spaceId = null;
    const paths = rawPaths
      .filter((p): p is string => typeof p === 'string' && p !== '')
      .slice(0, MAX_UPLOAD_FILES);
    const refused: string[] = [];
    let first: number | null = null;
    let added = 0;
    // Link a new artifact to the chat the files are for.
    const attach = (artifactId: number, name: string) => {
      collect?.push(artifactId);
      if (chatId === null) return;
      const found = snapshotLookup(workspace())('artifact', artifactId);
      const count = () =>
        chatsModel.findConversation(chats, chatId)?.refs.length ?? 0;
      const before = count();
      if (found) {
        commitChats(
          chatsModel.addRef(chats, chatId, {
            kind: 'artifact',
            id: artifactId,
            title: found.title,
            url: found.url,
          }),
        );
      }
      if (count() === before) {
        refused.push(
          `${name}: it is in your artifacts, but this chat has as many links as it can hold.`,
        );
      }
    };
    for (const file of paths) {
      const name = path.basename(file);
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) {
          refused.push(`${name}: that is not a file.`);
          continue;
        }
        const handle = fs.openSync(file, 'r');
        const head = Buffer.alloc(16);
        try {
          fs.readSync(handle, head, 0, 16, 0);
        } finally {
          fs.closeSync(handle);
        }
        const plan = planUpload(name, stat.size, head);
        if (plan.type === 'refused') {
          refused.push(`${name}: ${plan.reason}`);
          continue;
        }
        if (plan.type === 'text') {
          const content = fs.readFileSync(file, 'utf8');
          const made = artifactsModel.createArtifact(
            artifacts,
            { kind: plan.kind, title: plan.title, content, spaceId },
            Date.now(),
          );
          if (!made.ok) {
            refused.push(
              `${name}: ${made.reason === 'too-long' ? 'it is too long.' : 'it could not be added.'}`,
            );
            continue;
          }
          commitArtifacts(made.state);
          first ??= made.artifact.id;
          added++;
          attach(made.artifact.id, name);
          continue;
        }
        const id = artifacts.nextId;
        fs.mkdirSync(uploadsDir, { recursive: true });
        const target = path.join(uploadsDir, `${id}.${plan.ext}`);
        fs.copyFileSync(file, target);
        const made = artifactsModel.createArtifact(
          artifacts,
          {
            kind: 'file',
            title: plan.title,
            spaceId,
            file: {
              name: plan.title,
              mime: plan.mime,
              ext: plan.ext,
              bytes: stat.size,
            },
          },
          Date.now(),
        );
        if (!made.ok) {
          fs.rmSync(target, { force: true });
          refused.push(`${name}: it could not be added.`);
          continue;
        }
        commitArtifacts(made.state);
        first ??= made.artifact.id;
        added++;
        attach(made.artifact.id, name);
      } catch (error) {
        refused.push(`${name}: ${(error as Error).message}`);
      }
    }
    if (rawPaths.length > MAX_UPLOAD_FILES) {
      refused.push(`Only the first ${MAX_UPLOAD_FILES} files were looked at.`);
    }
    if (first !== null && chatId === null && collect === undefined) {
      openArtifact(first);
    }
    if (refused.length > 0) {
      void dialog.showMessageBox(win, {
        type: 'info',
        message:
          added > 0
            ? 'Some files were not added.'
            : 'The files were not added.',
        detail: refused.join('\n'),
      });
    }
    return added;
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
      case 'internet':
        void askArtifactInternet(id, !artifactsModel.hasInternet(artifact));
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
        openTab(newTabUrl(), spaceId);
        break;
      case 'upload':
        void pickAndImport(spaceId);
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

    // The extensions' own items go at the end of whichever menu this is.
    const ext = extensions?.contextMenuFor(contents, params);
    const withExtensions = (own: MenuItem[]): MenuItem[] =>
      ext && ext.items.length > 0
        ? [...own, { type: 'separator' }, ...ext.items]
        : own;

    if (params.isEditable) {
      void clipboard.readText().then((copied) =>
        showMenu(
          withExtensions(
            editMenuItems({
              hasSelection: params.editFlags.canCopy || selection !== '',
              canPaste: params.editFlags.canPaste && copied.length > 0,
              pasteAndGo: false,
            }),
          ),
          x,
          y,
          (choice) => {
            if (!ext?.run(choice)) runEditChoice(contents, choice);
          },
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
      withExtensions(items),
      x,
      y,
      (choice) => {
        if (!ext?.run(choice)) runPageChoice(tabId, contents, params, choice);
      },
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
    // The menu was open while the page went away (it closed itself, or the assistant or an extension
    // closed the tab): there is nothing to go back in, reload or inspect.
    if (contents.isDestroyed()) return;
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
      case 'save-as-artifact':
        void saveFromMenu(tabId, contents, 'page', '');
        break;
      case 'save-selection-as-artifact':
        void saveFromMenu(tabId, contents, 'selection', params.selectionText);
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
        openTab(
          searchUrl(params.selectionText, activeEngine(searchEngine).template),
          here,
        );
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
        openTab(newTabUrl(), spaceId);
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
      case 'sleep':
        putToSleep(spaceSleepers(sleepTabs(), spaceId, activeTabId()));
        break;
      case 'duplicate':
        duplicateSpace(spaceId);
        break;
      case 'export':
        void exportSpace(spaceId);
        break;
      case 'reopen-all': {
        // Every closed page of the Space comes back as a tab.
        let next = state;
        for (const tab of state.tabs.filter(
          (t) => t.spaceId === spaceId && t.closed,
        )) {
          next = model.reopenTab(next, tab.id);
        }
        if (next !== state) commitAndShow(revealPage(next));
        break;
      }
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
      case 'export':
        void exportChat(choice.chatId);
        break;
      case 'make-skill':
        makeSkillFromChat(choice.chatId);
        break;
      case 'search':
        openChatSearch();
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
              url: newTabUrl(),
              spaceId: tab.spaceId,
              after: tabId,
            }).state,
          ),
        );
        break;
      case 'mute':
      case 'unmute':
        pageContents(tabId)?.setAudioMuted(choice.action === 'mute');
        sendState();
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
          const page = pageContents(tabId);
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

  // When each page was last shown (for putting unused pages to sleep).
  const lastUsed = new Map<number, number>();
  // What the sleep rules need to know about each page right now.
  const sleepTabs = (): SleepTab[] =>
    state.tabs.map((t) => ({
      id: t.id,
      spaceId: t.spaceId,
      loaded: views.has(t.id),
      closed: t.closed,
      audible: pageContents(t.id)?.isCurrentlyAudible() ?? false,
      working: working.has(t.id),
      // Downloading or saving: closing its web page would cancel that.
      busy: (() => {
        const page = pageContents(t.id);
        return page !== undefined && downloadManager.isBusy(page.id);
      })(),
    }));
  // Put pages to sleep: their live web page goes (no memory used) and they load
  // again when opened.
  const putToSleep = (ids: number[]) => {
    for (const id of ids) {
      destroyView(id);
      lastUsed.delete(id);
    }
    if (ids.length > 0) sendState();
  };
  // The page you were last on in each Space (so going to a Space lands there).
  const lastInSpace = new Map<number, number>();
  // Go to a Space: the page you were last on there, else its first open page, else
  // its overview.
  const goToSpace = (spaceId: number | null) => {
    if (spaceId === null || !model.findSpace(state, spaceId)) return;
    const tab = landingTab(state.tabs, spaceId, lastInSpace.get(spaceId));
    select(tab === null ? { kind: 'lead', spaceId } : { kind: 'tab', id: tab });
  };
  const spaceIds = () => state.spaces.map((s) => s.id);
  // The Space switcher: a menu of every Space, at a place in the window.
  const openSpaceSwitcher = (x: number, y: number) => {
    showMenu(
      spaceSwitcherItems(state, currentSpaceId()),
      x,
      y,
      (choice) => {
        const parsed = parseSwitchSpaceChoice(choice);
        if (parsed === null) return;
        if ('spaceId' in parsed) {
          goToSpace(parsed.spaceId);
        } else if (state.spaces.length < model.MAX_SPACES) {
          const created = model.addSpace(state);
          commit(created.state);
          select({ kind: 'lead', spaceId: created.id });
        }
      },
      win.webContents,
    );
  };

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
    // F11: the whole window full screen.
    if (
      input.type === 'keyDown' &&
      input.key === 'F11' &&
      !input.control &&
      !input.alt &&
      !input.meta
    ) {
      event.preventDefault();
      toggleWindowFullscreen();
      return;
    }
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
      const pageView = id === null ? undefined : pageContents(id);
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
    // F5: reload.
    if (
      input.type === 'keyDown' &&
      input.key === 'F5' &&
      !input.control &&
      !input.alt &&
      !input.meta
    ) {
      event.preventDefault();
      const id = activeTabId();
      const page = id === null ? undefined : pageContents(id);
      if (id !== null && page) reloadTab(id, page);
      return;
    }
    // Alt+D: the address bar. Alt+Left / Alt+Right: back and forward.
    if (
      input.type === 'keyDown' &&
      input.alt &&
      !input.control &&
      !input.meta &&
      !input.shift
    ) {
      if (input.key.toLowerCase() === 'd') {
        event.preventDefault();
        focusAddress();
      } else if (input.key === 'ArrowLeft') {
        event.preventDefault();
        goBackOrForward('back');
      } else if (input.key === 'ArrowRight') {
        event.preventDefault();
        goBackOrForward('forward');
      } else if (/^[1-9]$/.test(input.key)) {
        // Alt+1 to Alt+9: the Space at that place in the sidebar.
        const id = spaceIdByNumber(spaceIds(), Number(input.key));
        if (id !== null) {
          event.preventDefault();
          goToSpace(id);
        }
      } else if (input.key === 'ArrowDown' || input.key === 'ArrowUp') {
        // Alt+Down / Alt+Up: the next / previous Space.
        const id = neighborSpaceId(
          spaceIds(),
          currentSpaceId(),
          input.key === 'ArrowDown' ? 1 : -1,
        );
        if (id !== null) {
          event.preventDefault();
          goToSpace(id);
        }
      }
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
    } else if (key === 's' && input.shift) {
      // Ctrl+Shift+S: the Space switcher, at the top left of the page.
      event.preventDefault();
      const bounds = win.getContentBounds();
      openSpaceSwitcher(bounds.width / 2 - 140, TOOLBAR_HEIGHT);
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
      // With only the chat showing, a new "tab" is a new chat.
      if (state.settings.viewMode === 'chat') {
        chatMenuActions.newChat();
        win.webContents.focus();
      } else {
        openTab(newTabUrl(), currentSpaceId());
      }
    } else if (key === 'k' && !input.shift) {
      event.preventDefault();
      openQuickSearch();
    } else if (key === 'a' && input.shift) {
      event.preventDefault();
      openTabSearch();
    } else if (key === 'l') {
      event.preventDefault();
      focusAddress();
    } else if (key === 'h') {
      event.preventDefault();
      showLibraryList('history');
    } else if (key === 'delete' && input.shift) {
      event.preventDefault();
      openSettings();
      if (!win.webContents.isDestroyed()) {
        win.webContents.send('settings:section', 'privacy');
      }
    } else if ((key === 'r' && input.shift) || key === 'f5') {
      event.preventDefault();
      hardReload();
    } else if (/^[1-9]$/.test(key) && !input.shift) {
      event.preventDefault();
      goToTabNumber(Number(key));
    } else if (key === 'r') {
      event.preventDefault();
      const id = activeTabId();
      if (id !== null) {
        const page = pageContents(id);
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

  // A new tab goes somewhere: it stops being the new-tab page and becomes a web
  // tab (its page is made and loads the address). False if it is not a new tab.
  const goFromNewTab = (tabId: number, url: string): boolean => {
    const here = model.findTab(state, tabId);
    if (!here || !model.isNewTabPage(here.url)) return false;
    state = model.updateTab(state, tabId, { url });
    saver.schedule();
    commitAndShow(state);
    return true;
  };

  // "Ask" on the new-tab page: start a chat, link the Space you are in, send the
  // text, and show the chat. With no key (or no model) the text waits in the chat's
  // box instead, with the usual notice.
  const askFromNewTab = (
    text: string,
    mentions: { kind: LinkKind; id: number; tag: string }[] = [],
  ) => {
    if (!chatService) return;
    // This new tab has been used: a new tab opened after it is not "second in a row".
    const used = activeTabId();
    if (used !== null) usedNewTabs.add(used);
    const created = chatsModel.startNewChat(chats);
    commitChats(created.state);
    // Everything picked with "@" is linked to the chat, like the chat's own "@".
    const lookup = snapshotLookup(workspace());
    for (const m of mentions) {
      const found = lookup(m.kind, m.id);
      if (!found) continue;
      commitChats(
        chatsModel.addRef(chats, created.id, {
          kind: m.kind,
          id: m.id,
          title: found.title,
          url: found.url,
        }),
      );
    }
    const spaceId = currentSpaceId();
    if (spaceId !== null) {
      const found = snapshotLookup(workspace())('space', spaceId);
      if (found) {
        commitChats(
          chatsModel.addRef(chats, created.id, {
            kind: 'space',
            id: spaceId,
            title: found.title,
            url: found.url,
          }),
        );
      }
    }
    // The page has no room for the chat bar, so the chat gets the window.
    commitAndShow(model.setViewMode(state, 'chat'));
    applyLayout(true);
    const result = chatService.sendMessage(created.id, text, mentions);
    if (!result.ok && !win.webContents.isDestroyed()) {
      win.webContents.send('composer:insert', text.slice(0, 4000));
    }
  };

  // ---- Requests from the UI --------------------------------------------------
  // We only accept messages that come from our own two UI pages, and we check
  // the type of everything they send.
  // Open something the assistant made: a document, a Space (its page), or the skills panel.
  const openMade = (kind: unknown, id: unknown) => {
    if (!isId(id)) return;
    if (kind === 'artifact') openArtifact(id);
    else if (kind === 'space') select({ kind: 'lead', spaceId: id });
    else if (kind === 'skill') {
      state = model.setRightPanel(state, 'skills');
      saver.schedule();
      applyLayout(true);
      sendState();
    }
  };

  const requests: Record<string, (...args: unknown[]) => void> = {
    'made:open': (kind, id) => openMade(kind, id),
    'tab:navigate': (input) => {
      const id = activeTabId();
      if (id === null || typeof input !== 'string') return;
      const url = resolveInput(input, activeEngine(searchEngine).template);
      if (url === '') return;
      if (goFromNewTab(id, url)) return;
      void pageContents(id)?.loadURL(url);
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
    // The new-tab page: open a Pick up item (and drop the empty new tab it came from).
    'newtab:resume': (kind, id) => {
      if (
        (kind !== 'chat' && kind !== 'artifact' && kind !== 'page') ||
        !isId(id)
      ) {
        return;
      }
      const from = activeTabId();
      const wasNewTab = from !== null && onNewTabPage();
      if (kind === 'chat') {
        chatMenuActions.selectChat(id);
        commitAndShow(model.setViewMode(state, 'chat'));
        applyLayout(true);
        return; // The new tab stays under the chat.
      }
      if (kind === 'artifact') openArtifact(id);
      else if (model.findTab(state, id)?.closed) {
        commitAndShow(revealPage(model.reopenTab(state, id)));
      } else if (model.findTab(state, id)) select({ kind: 'tab', id });
      if (wasNewTab && from !== null && model.findTab(state, from))
        removeTab(from);
    },
    'newtab:hide': (key) => {
      newTabSettings = hidePickUp(newTabSettings, key);
      newTabSettingsSaver.schedule();
      sendState();
    },
    // A Space pill: this new tab moves into that Space (or a new one).
    'newtab:pill': (space) => {
      const id = activeTabId();
      if (id === null || !onNewTabPage()) return;
      if (space === 'new') {
        const created = model.addSpace(state);
        commitAndShow(model.moveTab(created.state, id, created.id));
      } else if (isId(space) && model.findSpace(state, space)) {
        commitAndShow(model.moveTab(state, id, space));
      }
    },
    'newtab:more-menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      const tabId = activeTabId();
      if (tabId === null || !onNewTabPage()) return;
      const shown = new Set(newTabInfo(tabId).spaces.map((s) => s.id));
      const rest = state.spaces
        .filter((s) => !shown.has(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          emoji: emojiOr(s.emoji, DEFAULT_SPACE_EMOJI),
        }));
      showMenu(
        newTabSpacesMenuItems(rest),
        x,
        y,
        (choice) => {
          const spaceId = parseNewTabSpaceChoice(choice);
          const id = activeTabId();
          if (spaceId === null || id === null || !onNewTabPage()) return;
          if (model.findSpace(state, spaceId)) {
            commitAndShow(model.moveTab(state, id, spaceId));
          }
        },
        requestSender ?? win.webContents,
      );
    },
    'newtab:show-all': (spaceId) => {
      if (isId(spaceId) && model.findSpace(state, spaceId)) {
        select({ kind: 'lead', spaceId });
      }
    },
    // Enter in the new-tab page's box, with what it will do.
    'newtab:run': (text, mode, mentions) => {
      if (
        typeof text !== 'string' ||
        (mode !== 'go' && mode !== 'search' && mode !== 'ask')
      ) {
        return;
      }
      const typed = text.trim().slice(0, 4000);
      const id = activeTabId();
      if (typed === '' || id === null || !onNewTabPage()) return;
      if (mode === 'ask') {
        // Only real picks (a kind, a number and a short tag) are taken.
        const picks = (Array.isArray(mentions) ? mentions : [])
          .filter(
            (m): m is { kind: LinkKind; id: number; tag: string } =>
              typeof m === 'object' &&
              m !== null &&
              isLinkKind((m as { kind?: unknown }).kind) &&
              isId((m as { id?: unknown }).id) &&
              typeof (m as { tag?: unknown }).tag === 'string' &&
              (m as { tag: string }).tag.length <= 80,
          )
          .slice(0, 20);
        askFromNewTab(typed, picks);
        return;
      }
      const template = activeEngine(searchEngine).template;
      const url =
        mode === 'search'
          ? searchUrl(typed, template)
          : resolveInput(typed, template);
      if (url !== '') goFromNewTab(id, url);
    },
    'tab:reload': () => {
      const id = activeTabId();
      if (id !== null) {
        const page = pageContents(id);
        if (page) reloadTab(id, page);
      }
    },
    'tab:stop': () => {
      const id = activeTabId();
      if (id !== null) pageContents(id)?.stop();
    },
    'tab:back': () => {
      const id = activeTabId();
      const history =
        id === null ? undefined : pageContents(id)?.navigationHistory;
      if (history?.canGoBack()) history.goBack();
    },
    'tab:forward': () => {
      const id = activeTabId();
      const history =
        id === null ? undefined : pageContents(id)?.navigationHistory;
      if (history?.canGoForward()) history.goForward();
    },
    'tab:new': (spaceId) => {
      if (isIdOrNull(spaceId)) openTab(newTabUrl(), spaceId);
    },
    'tab:mute': (id, muted) => {
      if (!isId(id) || typeof muted !== 'boolean') return;
      pageContents(id)?.setAudioMuted(muted);
      sendState();
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
    // The chip at the top of the sidebar: go to the tab the assistant is on, or open the chat.
    'chip:go': () => {
      const run = overlayReply ? runOf(overlayReply.message) : null;
      const tab = run?.tabId ?? null;
      if (tab !== null && model.findTab(state, tab)?.closed === false) {
        select({ kind: 'tab', id: tab });
      } else if (state.settings.viewMode === 'page') {
        commitAndShow(model.setViewMode(state, 'both'));
        applyLayout(true);
      }
    },
    // You have seen a tab's green or red dot (moved off its row, or clicked it).
    'tab:seen': (id) => {
      if (isId(id) && unseen.delete(id)) sendState();
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
      // Leaving a new-tab page for the chat alone: the chat starts from its own new
      // chat screen, not from whatever chat was open before.
      if (mode === 'chat' && state.settings.viewMode !== 'chat') {
        if (onNewTabPage()) chatMenuActions.newChat();
      }
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
      // A drag that was never ended must not keep holding the layout.
      drag = null;
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
      // A new drag replaces one that was never ended (its mouse release was lost), so
      // an edge can always be grabbed again.
      if (!isResizeKind(kind)) return;
      drag = null;
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
      if (kind === 'space') {
        restoreDeletedSpace(id);
        return;
      }
      if (kind === 'skill') {
        commitSkills(restoreSkill(skills, id, Date.now()));
      } else if (kind === 'chat') {
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
      if (
        !isId(id) ||
        (kind !== 'chat' &&
          kind !== 'artifact' &&
          kind !== 'space' &&
          kind !== 'skill')
      )
        return;
      const title =
        kind === 'chat'
          ? chats.trash.find((c) => c.id === id)?.title
          : kind === 'space'
            ? spaceTrash.items.find((s) => s.id === id)?.name
            : kind === 'skill'
              ? skills.trash.find((s) => s.id === id)?.name
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
        if (kind === 'skill') {
          commitSkills(purgeSkill(skills, id));
        } else if (kind === 'space') {
          spaceTrash = purgeTrashedSpace(spaceTrash, id);
          spaceTrashSaver.schedule();
        } else if (kind === 'chat') {
          commitChats(chatsModel.purgeConversation(chats, id));
        } else {
          commitArtifacts(artifactsModel.purgeArtifact(artifacts, id));
        }
        libraryChanged();
      });
    },
    'library:open': (url, background) => {
      const kept = historyUrl(url);
      if (kept === null) return;
      if (background === true) {
        openBackgroundTab(kept, currentSpaceId(), activeTabId() ?? undefined);
      } else {
        openTab(kept, currentSpaceId());
      }
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
    // "Add extension…" in the Extensions panel: from the Chrome Web Store (it opens
    // in a tab) or from a folder.
    'extensions:add-menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      showMenu(
        addExtensionMenuItems(),
        x,
        y,
        (choice) => {
          const parsed = parseAddExtensionChoice(choice);
          if (parsed?.action === 'store') {
            openTab(
              'https://chromewebstore.google.com/',
              model.findTab(state, activeTabId() ?? -1)?.spaceId ?? null,
            );
          } else if (parsed?.action === 'folder') {
            void addExtensionFromFolder();
          }
        },
        requestSender ?? win.webContents,
      );
    },
    // The puzzle button in the toolbar: the extensions that have a button. The
    // button's box (in the window) says where a popup opens from.
    'extensions:puzzle': (x, y, box) => {
      if (!isNumber(x) || !isNumber(y) || !isBox(box)) return;
      const shown = extensionList.items.filter(
        (e) => e.enabled && e.hasAction && extensions?.isLoaded(e),
      );
      showMenu(
        puzzleMenuItems(
          shown.map((e) => ({
            key: e.key,
            name: e.name,
            pinned: e.pinned,
            icon: extensions?.iconOf(e) ?? null,
          })),
        ),
        x,
        y,
        (choice) => {
          const parsed = parsePuzzleChoice(choice);
          if (!parsed) return;
          if (parsed.action === 'manage') {
            if (state.settings.rightPanel !== 'extensions') {
              state = model.setRightPanel(state, 'extensions');
              saver.schedule();
              applyLayout(true);
              sendState();
            }
            return;
          }
          const found = shown.find((e) => e.key === parsed.key);
          if (!found) return;
          if (parsed.action === 'pin') {
            extensions?.setPinned(found.key, !found.pinned);
          } else if (found.id !== null && !win.webContents.isDestroyed()) {
            // The toolbar page asks the extension system to open its popup.
            win.webContents.send('extensions:activate', found.id, box);
          }
        },
        requestSender ?? win.webContents,
      );
    },
    // An extension in the Extensions panel or on its toolbar button (right-click).
    'extensions:menu': (key, x, y) => {
      if (typeof key !== 'string' || !isNumber(x) || !isNumber(y)) return;
      const found = extensionList.items.find((e) => e.key === key);
      if (!found) return;
      showMenu(
        extensionMenuItems(found),
        x,
        y,
        (choice) => {
          const parsed = parseExtensionChoice(choice);
          if (parsed?.action === 'pin') {
            extensions?.setPinned(key, !found.pinned);
          } else if (parsed?.action === 'options') {
            // Its settings page opens in a tab, like any page.
            if (found.id !== null && found.optionsPage && found.enabled) {
              openTab(
                `chrome-extension://${found.id}/${found.optionsPage}`,
                model.findTab(state, activeTabId() ?? -1)?.spaceId ?? null,
              );
            }
          } else if (parsed?.action === 'toggle') {
            void extensions?.setEnabled(key, !found.enabled);
          } else if (parsed?.action === 'remove') {
            void removeExtensionAsk(key);
          }
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
      showLibraryList(list);
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
      if (isId(id)) reopenClosedById(id);
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
              detail:
                'These chats, artifacts and Spaces cannot be brought back.',
              button: 'Empty',
            }).then((yes) => {
              if (!yes) return;
              commitChats(chatsModel.emptyChatTrash(chats));
              commitArtifacts(artifactsModel.emptyArtifactTrash(artifacts));
              spaceTrash = emptySpaceTrash(spaceTrash);
              spaceTrashSaver.schedule();
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
          zoomable: activeFileId() !== null,
          zoomText: zoomLabel(
            activeFileId() === null
              ? (activePage()?.getZoomFactor() ?? 1)
              : (fileZooms.get(activeFileId() as number) ?? 1),
          ),
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
    // The "pop-up blocked" chip: what the page tried to open, with a button each.
    'popups:menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      const id = activeTabId();
      const contents = activePage();
      if (id === null || !contents) return;
      const blocked = blockedPopups.get(id) ?? [];
      const address = model.findTab(state, id)?.url ?? contents.getURL();
      const info = describeSite(address);
      if (blocked.length === 0 || !info) return;
      const spaceId = model.findTab(state, id)?.spaceId ?? null;
      showMenu(
        blockedPopupItems(info.host, blocked),
        x,
        y,
        (choice) => {
          const parsed = parsePopupChoice(choice);
          if (!parsed) return;
          if (parsed.action === 'open') {
            const wanted = blocked[parsed.index];
            if (wanted === undefined) return;
            blockedPopups.set(
              id,
              (blockedPopups.get(id) ?? []).filter((url) => url !== wanted),
            );
            if (model.isWebUrl(wanted)) openTab(wanted, spaceId);
          } else {
            // Always allow from this site (if it can have a saved answer), and
            // open what was blocked.
            const site = siteKey(address);
            if (site !== null) {
              permissions = setAnswer(permissions, site, 'popups', 'allow');
              permissionsChanged();
            }
            for (const wanted of blocked) {
              if (model.isWebUrl(wanted)) openTab(wanted, spaceId);
            }
            blockedPopups.delete(id);
          }
          sendState();
        },
        win.webContents,
        undefined,
        false,
        undefined,
        'prompt',
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
          // What the assistant may do on this site (only for a web address).
          assistant:
            normalizeSite(address) === null
              ? undefined
              : trustOf(siteTrustState, normalizeSite(address) ?? ''),
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
            void contents.session.closeAllConnections().then(() => {
              if (!contents.isDestroyed()) reloadTab(id ?? -1, contents);
            });
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
          if (parsed?.action === 'assistant') {
            const host = normalizeSite(address);
            const changed =
              host === null
                ? null
                : withSiteTrust(siteTrustState, host, parsed.level);
            if (changed?.ok) {
              siteTrustState = changed.state;
              siteTrustSaver.schedule();
            }
          } else {
            if (!parsed || parsed.action !== 'set' || key === null) return;
            permissions = setAnswer(
              permissions,
              key,
              parsed.kind,
              parsed.answer,
            );
            permissionsChanged();
          }
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
    // + / - / Ctrl+scroll in an image or PDF view: one step, like on a web page.
    'zoom:change': (direction) => {
      if (direction === 1 || direction === -1 || direction === 0) {
        changeZoom(direction);
      }
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
      // Dragged in from the Artifacts panel it may not be open yet: open it first.
      if (!state.artifactTabs.some((t) => t.artifactId === artifactId)) {
        openArtifact(artifactId);
      }
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
    // "New" in the Artifacts panel: pick a kind; it is made in the Space you are in
    // and its name is asked for right away.
    // ---- Skills ----
    'skill:enable': (id, enabled) => {
      if (isId(id) && typeof enabled === 'boolean') {
        commitSkills(setSkillEnabled(skills, id, enabled));
      }
    },
    'skill:delete': (id) => {
      if (isId(id)) {
        commitSkills(deleteSkill(skills, id, Date.now()));
        libraryChanged();
      }
    },
    'skill:menu': (id, x, y) => {
      if (!isId(id) || !isNumber(x) || !isNumber(y)) return;
      const skill = findSkill(skills, id);
      if (!skill) return;
      showMenu(
        skillMenuItems(skill),
        x,
        y,
        (choice) => {
          const parsed = parseSkillChoice(choice);
          if (!parsed) return;
          const now = findSkill(skills, id);
          if (!now) return;
          switch (parsed.action) {
            case 'edit':
              if (!win.webContents.isDestroyed()) {
                win.webContents.send('skill:edit', id);
              }
              break;
            case 'toggle':
              commitSkills(setSkillEnabled(skills, id, !now.enabled));
              break;
            case 'duplicate': {
              const copy = duplicateSkill(skills, id, Date.now());
              if (copy.ok) commitSkills(copy.state);
              break;
            }
            case 'export':
              void exportSkill(id);
              break;
            case 'delete':
              commitSkills(deleteSkill(skills, id, Date.now()));
              libraryChanged();
              break;
          }
        },
        requestSender ?? win.webContents,
      );
    },
    // The level pill of a tool, or of a whole group, in the Tools panel: the four
    // levels. The choice goes back to the panel (it asks first for "Always allow").
    'tool:level-menu': (target, x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      const parsed = parseToolTarget(target);
      if (!parsed) return;
      let current: ApprovalLevel | null = null;
      let fallback: ApprovalLevel | null = null;
      if (parsed.kind === 'tool') {
        fallback = defaultLevel(parsed.name) ?? null;
        if (fallback === null) return;
        current = levelFor(toolSettings, parsed.name);
      } else {
        const rows = describeTools(toolSettings).filter(
          (row) => row.group === parsed.group,
        );
        if (rows.length === 0) return;
        current = commonLevel(rows);
      }
      showMenu(
        toolLevelMenuItems(current, fallback),
        x,
        y,
        (choice) => {
          const level = parseToolLevelChoice(choice);
          if (level && !win.webContents.isDestroyed()) {
            win.webContents.send('tool:level-chosen', target, level);
          }
        },
        requestSender ?? win.webContents,
      );
    },
    // Right-click on a step of the assistant's work in the chat.
    'step:menu': (chatId, messageId, partId, x, y, hints) => {
      if (!isId(chatId) || !isId(messageId) || !isId(partId)) return;
      if (!isNumber(x) || !isNumber(y)) return;
      const h = hints as { retry?: unknown; open?: unknown } | null;
      showMenu(
        stepMenuItems({ retry: h?.retry === true, open: h?.open === true }),
        x,
        y,
        (choice) => {
          const parsed = parseStepChoice(choice);
          if (parsed?.action === 'details') {
            if (!win.webContents.isDestroyed()) {
              win.webContents.send('step:toggle', messageId, partId);
            }
          } else if (parsed?.action === 'retry') {
            retryStep(chatId, messageId, partId);
          }
        },
        requestSender ?? win.webContents,
      );
    },
    'chat:retry-step': (chatId, messageId, partId) => {
      if (isId(chatId) && isId(messageId) && isId(partId)) {
        retryStep(chatId, messageId, partId);
      }
    },
    'skill:new-menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      showMenu(
        newSkillMenuItems(),
        x,
        y,
        (choice) => {
          const parsed = parseNewSkillChoice(choice);
          if (parsed?.action === 'new') {
            if (!win.webContents.isDestroyed()) {
              win.webContents.send('skill:edit', null);
            }
          } else if (parsed?.action === 'import') {
            void importSkills();
          }
        },
        requestSender ?? win.webContents,
      );
    },
    'artifact:new-menu': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      showMenu(
        newArtifactMenuItems(),
        x,
        y,
        (choice) => {
          const parsed = parseNewArtifactChoice(choice);
          if (!parsed) return;
          if ('upload' in parsed) {
            void pickAndImport(currentSpaceId());
            return;
          }
          const result = artifactsModel.createArtifact(
            artifacts,
            { kind: parsed.kind, title: '', spaceId: currentSpaceId() },
            Date.now(),
          );
          if (!result.ok) return;
          commitArtifacts(result.state);
          if (!win.webContents.isDestroyed()) {
            win.webContents.send('artifact:begin-rename', result.artifact.id);
          }
        },
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
    // The "+" on the chat: a new chat (the empty one is reused, so pressing it again
    // and again makes nothing new). Keep the keyboard in the chat to type straight away.
    'chats:new': () => {
      chatMenuActions.newChat();
      win.webContents.focus();
    },
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
    // The "+" in the chat's message box: add a page, a Space, an artifact or a file.
    'chat:add-menu': (chatId, x, y) => {
      if (!isId(chatId) || !isNumber(x) || !isNumber(y)) return;
      showMenu(
        addToChatMenuItems(),
        x,
        y,
        (choice) => {
          const parsed = parseAddToChatChoice(choice);
          if (!parsed) return;
          if (parsed.action === 'file') {
            void pickAndImport(currentSpaceId(), chatId);
          } else if (!win.webContents.isDestroyed()) {
            // The message box opens its list for it.
            win.webContents.send('composer:add', chatId, parsed.action);
          }
        },
        requestSender ?? win.webContents,
      );
    },
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
      const page = pageContents(id);
      const items = tabMenuItems(state, id, page ? page.isAudioMuted() : null);
      if (!items) return;
      showMenu(
        items,
        x,
        y,
        (choice) => runTabChoice(id, choice),
        requestSender ?? win.webContents,
      );
    },
    // The note on a Space's overview.
    'space:about': (id, text) => {
      if (!isId(id) || typeof text !== 'string') return;
      commit(model.setSpaceAbout(state, id, text));
    },
    // The Space chip in the toolbar.
    'spaces:switcher': (x, y) => {
      if (!isNumber(x) || !isNumber(y)) return;
      openSpaceSwitcher(x, y);
    },
    'space:bulk': (id, action) => {
      if (!isId(id) || !model.findSpace(state, id)) return;
      if (
        action === 'close-all' ||
        action === 'reopen-all' ||
        action === 'sleep'
      ) {
        runSpaceChoice(id, `space.${action}`);
      }
    },
    'space:menu': (id, x, y) => {
      if (!isId(id) || !isNumber(x) || !isNumber(y)) return;
      const items = spaceMenuItems(
        state,
        id,
        spaceSleepers(sleepTabs(), id, activeTabId()).length,
      );
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
    if (event.sender !== popup || !openMenu || typeof id !== 'string') return;
    // Only an item of the menu that is open (and enabled) counts. Quick search's rows
    // change as you type, so there a row counts if it reads as one of its choices.
    if (openMenu.shown.panel === 'quick') {
      if (parseQuickChoice(id) === null) return;
    } else if (!isChoosable(openMenu.items, id)) return;
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
    const contents = pageContents(findTabId);
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
  // Extensions: added from a folder, loaded at every start (see extensionManager.ts).
  const manager = registerExtensions({
    session: session.defaultSession,
    window: win,
    getList: () => extensionList,
    getSettings: () => extensionSettings,
    onPopup: (extensionId) => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('extensions:popup', extensionId);
      }
    },
    setList: (next) => {
      extensionList = next;
      extensionsSaver.schedule();
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('extensions:changed');
      }
    },
    createTab: async (url) => {
      const from = activeTabId();
      openTab(
        url,
        (from !== null && model.findTab(state, from)?.spaceId) || null,
      );
      const id = activeTabId();
      if (id === null) return null;
      const tab = model.findTab(state, id);
      if (tab) ensureView(tab);
      return pageContents(id) ?? null;
    },
    selectTab: (contents) => {
      for (const [id, view] of views) {
        if (view.webContents === contents) select({ kind: 'tab', id });
      }
    },
    removeTab: (contents) => {
      for (const [id, view] of views) {
        if (view.webContents === contents) closeTab(id);
      }
    },
    confirm,
  });
  extensions = manager;
  // Pages that were already open when the extensions were switched on.
  for (const view of views.values()) manager.addTab(view.webContents);
  void manager.loadAll();
  ipcMain.handle('extensions:list', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return extensionList.items.map((record) => ({
      ...record,
      words: describePermissions(record),
      loaded: manager.isLoaded(record),
      icon: manager.iconOf(record),
    }));
  });
  // Removing deletes the extension's own saved data too, so ask first.
  const removeExtensionAsk = async (key: string) => {
    const record = extensionList.items.find((e) => e.key === key);
    if (!record) return;
    const yes = await confirm({
      title: 'Remove this extension?',
      message: `Remove “${record.name}”?`,
      detail:
        'It stops working and the data it saved in this browser is deleted. You can add it again later.',
      button: 'Remove',
    });
    if (yes) await manager.remove(key);
  };
  // Pick a folder and add the extension in it (the answer is shown in the panel).
  const addExtensionFromFolder = async () => {
    const picked = await dialog.showOpenDialog(win, {
      title: 'Choose the folder of an unpacked extension',
      properties: ['openDirectory'],
    });
    if (picked.canceled || picked.filePaths.length === 0) return;
    const result = await manager.installFolder(picked.filePaths[0]);
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(
        'extensions:message',
        result.ok
          ? `Added ${result.name}.`
          : result.error === 'Cancelled.'
            ? null
            : result.error,
      );
    }
  };
  ipcMain.handle('sleep-settings:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return sleepSettings;
  });
  ipcMain.handle('sleep-settings:set', (event, changes: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    sleepSettings = withSleepSettings(sleepSettings, changes);
    sleepSettingsSaver.schedule();
    return sleepSettings;
  });
  // Every minute: pages that have gone unused for the time you chose go to sleep.
  const sleepTimer = setInterval(() => {
    putToSleep(
      idleSleepers(
        sleepTabs(),
        lastUsed,
        Date.now(),
        sleepSettings.afterMinutes,
        activeTabId(),
      ),
    );
  }, 60_000);
  ipcMain.handle('extension-settings:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return extensionSettings;
  });
  ipcMain.handle('extension-settings:set', (event, changes: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    extensionSettings = withExtensionSettings(extensionSettings, changes);
    extensionSettingsSaver.schedule();
    // Switching it on checks straight away.
    if (extensionSettings.autoUpdate) void manager.checkForUpdates();
    return extensionSettings;
  });
  ipcMain.handle(
    'extensions:set-enabled',
    async (event, key: unknown, enabled: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (typeof key !== 'string' || typeof enabled !== 'boolean') return;
      await manager.setEnabled(key, enabled);
    },
  );
  ipcMain.handle('extensions:remove', async (event, key: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (typeof key === 'string') await removeExtensionAsk(key);
  });
  // For testing only (never in a packaged app): add an extension from a folder at
  // start, since a native folder picker cannot be driven by a test.
  if (!app.isPackaged && process.env.AIB_TEST_EXTENSION) {
    void manager.installFolder(process.env.AIB_TEST_EXTENSION, true);
  }
  if (!app.isPackaged && process.env.AIB_TEST_REMOVE_EXTENSION_ID) {
    // For testing only: remove an extension by its id, a while after start, with
    // no question (a test cannot click a native window).
    setTimeout(() => {
      const found = extensionList.items.find(
        (e) => e.id === process.env.AIB_TEST_REMOVE_EXTENSION_ID,
      );
      if (found) void manager.remove(found.key);
    }, 20_000);
  }
  if (!app.isPackaged && process.env.AIB_TEST_UPLOADS) {
    // For testing only: add files at start (a test cannot use the file picker).
    setTimeout(() => {
      void importFiles(process.env.AIB_TEST_UPLOADS?.split('|') ?? [], null);
    }, 8000);
  }
  if (!app.isPackaged && process.env.AIB_TEST_STORE_EXTENSION) {
    void manager.installStoreForTest(process.env.AIB_TEST_STORE_EXTENSION);
  }
  ipcMain.handle('downloads:list', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return downloads.items;
  });
  const permissionRows = () =>
    siteRows(permissions).map((row) => ({
      ...row,
      icon: faviconFor(favicons, row.host),
    }));
  ipcMain.handle('new-tab-settings:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return newTabSettings;
  });
  ipcMain.handle('new-tab-settings:set', (event, changes: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    newTabSettings = withNewTabSettings(newTabSettings, changes);
    newTabSettingsSaver.schedule();
    sendState();
    return newTabSettings;
  });
  ipcMain.handle('new-tab-settings:show-hidden', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    newTabSettings = clearHiddenPickUp(newTabSettings);
    newTabSettingsSaver.schedule();
    sendState();
    return newTabSettings;
  });
  ipcMain.handle('search-engine:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return searchEngine;
  });
  ipcMain.handle('search-engine:set', (event, changes: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    searchEngine = withSearchEngine(searchEngine, changes);
    searchEngineSaver.schedule();
    return searchEngine;
  });
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
    // The page can turn "ask where" on or off and go back to the default folder; a new folder is
    // only taken from the folder window below, never from what the page sends.
    const asked =
      typeof changes === 'object' && changes !== null
        ? (changes as Record<string, unknown>)
        : {};
    downloadSettings = withDownloadSettings(downloadSettings, {
      askWhere: asked.askWhere,
      ...(asked.folder === null ? { folder: null } : {}),
    });
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
  // Test runs only: remove the Spaces a test made (see testScope.ts).
  const scope = testScope;
  if (scope) {
    ipcMain.handle('dev:cleanup-test-spaces', (event) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      const ids = scope.spaces(state.spaces).map((space) => space.id);
      for (const id of ids) deleteSpaceQuietly(id);
      scope.created.clear();
      return ids.length;
    });
  }
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
      ...spaceTrash.items.map((s) => ({
        kind: 'space' as const,
        id: s.id,
        title: s.name,
        emoji: emojiOr(s.emoji, DEFAULT_SPACE_EMOJI),
        detail: `Space · ${s.pages.length} page${s.pages.length === 1 ? '' : 's'}`,
        deletedAt: s.deletedAt,
        daysLeft: daysLeft(s.deletedAt),
      })),
      ...skills.trash.map((s) => ({
        kind: 'skill' as const,
        id: s.id,
        title: s.name,
        emoji: '⚡',
        detail: 'Skill',
        deletedAt: s.deletedAt,
        daysLeft: daysLeft(s.deletedAt),
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
  // The sites the assistant trusts or may not touch. Only the app's own window can change them
  // (nothing a page says, and nothing the assistant does, can).
  ipcMain.handle('site-trust:list', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return siteTrustRows(siteTrustState);
  });
  ipcMain.handle(
    'site-trust:set',
    (event, site: unknown, level: unknown): SiteTrustResult => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (level !== 'trusted' && level !== 'blocked' && level !== 'unknown') {
        return { ok: false, error: 'That is not a choice.' };
      }
      const result = withSiteTrust(siteTrustState, site, level);
      if (!result.ok) return result;
      siteTrustState = result.state;
      siteTrustSaver.schedule();
      return {
        ok: true,
        host: result.host,
        rows: siteTrustRows(siteTrustState),
      };
    },
  );
  // What the assistant may do on the page on screen (for the site panel).
  ipcMain.handle('site-trust:current', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const id = activeTabId();
    const tab = id === null ? undefined : model.findTab(state, id);
    const host = tab ? normalizeSite(tab.url) : null;
    return host === null
      ? null
      : { host, level: trustOf(siteTrustState, host) };
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
  // A preset sets every tool at once; a group sets the tools of one group.
  ipcMain.handle('tools:preset', (event, preset: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const known = TOOL_PRESETS.find((p) => p === preset);
    if (known) {
      toolSettings = withLevels(defaultToolSettings(), presetLevels(known));
      toolsSaver.schedule();
    }
    return describeTools(toolSettings);
  });
  ipcMain.handle('tools:set-group', (event, group: unknown, level: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (
      typeof group === 'string' &&
      Object.hasOwn(GROUP_TITLES, group) &&
      isApprovalLevel(level)
    ) {
      toolSettings = withLevels(
        toolSettings,
        groupLevels(
          describeTools(toolSettings),
          group as keyof typeof GROUP_TITLES,
          level,
        ),
      );
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
          internet: found.kind === 'html' && artifactsModel.hasInternet(found),
        }
      : null;
  });
  // The switch in the preview's header. Allowing it asks first.
  ipcMain.handle('artifact:set-internet', (event, id: unknown, on: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (!isId(id) || typeof on !== 'boolean') return false;
    return askArtifactInternet(id, on);
  });
  ipcMain.handle(
    'artifact:write',
    (event, id: unknown, content: unknown, revision: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (!isId(id) || typeof content !== 'string' || !isNumber(revision)) {
        return { ok: false, reason: 'failed' };
      }
      const current = artifactsModel.findArtifact(artifacts, id);
      if (!current || current.kind === 'file')
        return { ok: false, reason: 'failed' };
      // The text changed since the editor loaded it (the assistant edited it):
      // saving now would overwrite that, so refuse and let the editor ask.
      if (current.revision !== revision) {
        return { ok: false, reason: 'conflict' };
      }
      const result = artifactsModel.updateArtifact(
        artifacts,
        id,
        // Your own typing keeps a permission you gave this page; the assistant's
        // edits (another route) never do.
        { content, keepInternet: true },
        Date.now(),
      );
      if (!result.ok) return { ok: false, reason: 'failed' };
      commitArtifacts(result.state);
      return { ok: true, revision: result.artifact.revision };
    },
  );
  // "Upload files…": pick files, and add them to a Space (or the one you are in).
  const pickAndImport = async (
    spaceId: number | null,
    chatId: number | null = null,
  ) => {
    const picked = await dialog.showOpenDialog(win, {
      title: 'Add files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Text, code, images and PDFs',
          extensions: [
            'md',
            'markdown',
            'txt',
            'text',
            'html',
            'htm',
            'css',
            'js',
            'ts',
            'tsx',
            'jsx',
            'json',
            'py',
            'sh',
            'csv',
            'xml',
            'yml',
            'yaml',
            'sql',
            'png',
            'jpg',
            'jpeg',
            'gif',
            'webp',
            'bmp',
            'pdf',
          ],
        },
      ],
    });
    if (picked.canceled) return 0;
    return importFiles(picked.filePaths, spaceId, chatId);
  };
  ipcMain.handle('uploads:pick', (event, spaceId: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return pickAndImport(isId(spaceId) ? spaceId : currentSpaceId());
  });
  // Files dropped on the Artifacts panel or a Space's overview.
  ipcMain.handle('uploads:drop', (event, paths: unknown, spaceId: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return importFiles(paths, isId(spaceId) ? spaceId : currentSpaceId());
  });
  // ---- Letting the assistant read uploads --------------------------------------
  // A PDF's words are read by this window (PDF.js runs there, in a worker, away from
  // the main process). A picture is shrunk if it is big, so it is cheap to send.
  const pdfRequests = new Map<number, (result: PdfTextResult) => void>();
  let nextPdfRequest = 1;
  const pdfTexts = new Map<number, PdfTextResult>();
  const askWindowForPdfText = (bytes: Uint8Array): Promise<PdfTextResult> =>
    new Promise((resolve) => {
      if (win.isDestroyed() || win.webContents.isDestroyed()) {
        resolve({ ok: false });
        return;
      }
      const requestId = nextPdfRequest++;
      const timer = setTimeout(() => {
        pdfRequests.delete(requestId);
        resolve({ ok: false });
      }, 60_000);
      pdfRequests.set(requestId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      win.webContents.send('pdf:extract', requestId, bytes);
    });
  ipcMain.on('pdf:extracted', (event, requestId: unknown, result: unknown) => {
    if (!fromWindow(event) || typeof requestId !== 'number') return;
    const done = pdfRequests.get(requestId);
    if (!done) return;
    pdfRequests.delete(requestId);
    done(parsePdfText(result));
  });
  const MAX_PICTURE_SIDE = 1568;
  const MAX_PICTURE_BYTES = 4 * 1024 * 1024;
  async function readUploadedFile(id: number): Promise<FileReading> {
    const found = artifactsModel.findArtifact(artifacts, id);
    if (!found?.file) return { ok: false, reason: 'missing' };
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(uploadPath(found));
    } catch {
      return { ok: false, reason: 'missing' };
    }
    if (found.file.mime === 'application/pdf') {
      let text = pdfTexts.get(id);
      if (!text) {
        text = await askWindowForPdfText(new Uint8Array(bytes));
        if (text.ok) pdfTexts.set(id, text);
      }
      return text.ok
        ? {
            ok: true,
            kind: 'pdf',
            pages: text.pages,
            text: text.text,
            scanned: text.scanned,
            truncated: text.truncated,
          }
        : { ok: false, reason: 'unreadable' };
    }
    // A picture: shrink a big one (and send it as a JPEG), keep a small one as it is.
    const picture = nativeImage.createFromBuffer(bytes);
    if (!picture.isEmpty()) {
      const { width, height } = picture.getSize();
      const longest = Math.max(width, height);
      if (longest > MAX_PICTURE_SIDE || bytes.length > MAX_PICTURE_BYTES) {
        const scale = Math.min(1, MAX_PICTURE_SIDE / longest);
        const smaller = picture.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: 'good',
        });
        return {
          ok: true,
          kind: 'image',
          mime: 'image/jpeg',
          data: smaller.toJPEG(85).toString('base64'),
        };
      }
    }
    if (bytes.length > MAX_PICTURE_BYTES)
      return { ok: false, reason: 'too-big' };
    return {
      ok: true,
      kind: 'image',
      mime: found.file.mime,
      data: bytes.toString('base64'),
    };
  }

  // Files dropped on the new-tab page: they become artifacts (in the tab's Space) and
  // are given back so the page can show them as chips under its box. Nothing is
  // opened or sent.
  ipcMain.handle('newtab:drop', async (event, paths: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const ids: number[] = [];
    await importFiles(paths, currentSpaceId(), null, ids);
    return ids.flatMap((id) => {
      const a = artifactsModel.findArtifact(artifacts, id);
      return a
        ? [
            {
              id,
              title: a.title,
              emoji: emojiOr(a.emoji, defaultArtifactEmoji(a.kind)),
            },
          ]
        : [];
    });
  });
  // ---- Skills: reading one to edit it, saving, importing and exporting ----
  ipcMain.handle('skills:get', (event, id: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const skill = isId(id) ? findSkill(skills, id) : undefined;
    return skill
      ? {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          enabled: skill.enabled,
          origin: skill.origin,
        }
      : null;
  });
  ipcMain.handle('skills:save', (event, input: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const raw = (typeof input === 'object' && input !== null ? input : {}) as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      instructions?: unknown;
    };
    const fields = {
      name: typeof raw.name === 'string' ? raw.name : '',
      description: typeof raw.description === 'string' ? raw.description : '',
      instructions:
        typeof raw.instructions === 'string' ? raw.instructions : '',
    };
    if (raw.id === null || raw.id === undefined) {
      const made = createSkill(skills, fields, Date.now(), 'you');
      if (!made.ok) return { ok: false, error: PROBLEM_WORDS[made.problem] };
      commitSkills(made.state);
      return { ok: true, id: made.skill.id };
    }
    if (!isId(raw.id)) return { ok: false, error: 'That skill was not found.' };
    const updated = updateSkill(skills, raw.id, fields, Date.now());
    if (!updated.ok) {
      return {
        ok: false,
        error:
          updated.problem === 'not-found'
            ? 'That skill no longer exists.'
            : PROBLEM_WORDS[updated.problem],
      };
    }
    commitSkills(updated.state);
    return { ok: true, id: raw.id };
  });
  // Add skills from files (.md): each is read, checked and added, and the ones that
  // cannot be are listed in one message.
  const importSkills = async () => {
    const picked = await dialog.showOpenDialog(win, {
      title: 'Import skills',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Skill files', extensions: ['md', 'markdown', 'txt'] }],
    });
    if (picked.canceled) return;
    let next = skills;
    let added = 0;
    const refused: string[] = [];
    for (const file of picked.filePaths.slice(0, 20)) {
      const name = path.basename(file);
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size > 100_000) {
          refused.push(`${name}: it is too big to be a skill.`);
          continue;
        }
        const parsed = parseSkillMarkdown(fs.readFileSync(file, 'utf8'));
        if (!parsed.ok) {
          refused.push(`${name}: ${PROBLEM_WORDS[parsed.problem]}`);
          continue;
        }
        const made = createSkill(next, parsed.value, Date.now(), 'imported');
        if (!made.ok) {
          refused.push(`${name}: ${PROBLEM_WORDS[made.problem]}`);
          continue;
        }
        // An imported skill starts off until you have looked at it.
        next = setSkillEnabled(made.state, made.skill.id, false);
        added++;
      } catch (error) {
        refused.push(`${name}: ${(error as Error).message}`);
      }
    }
    commitSkills(next);
    if (refused.length > 0 || added > 0) {
      void dialog.showMessageBox(win, {
        type: refused.length > 0 ? 'info' : 'none',
        message:
          added > 0
            ? `${added} skill${added === 1 ? '' : 's'} imported (turned off until you look at ${added === 1 ? 'it' : 'them'}).`
            : 'No skills were imported.',
        detail: refused.join('\n'),
      });
    }
  };
  const exportSkill = async (id: number) => {
    const skill = findSkill(skills, id);
    if (!skill) return;
    const picked = await dialog.showSaveDialog(win, {
      title: 'Export skill',
      defaultPath: path.join(
        app.getPath('documents'),
        skillFileName(skill.name),
      ),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (picked.canceled || !picked.filePath) return;
    try {
      fs.writeFileSync(picked.filePath, skillMarkdown(skill), 'utf8');
    } catch (error) {
      void dialog.showMessageBox(win, {
        type: 'error',
        message: 'The skill could not be saved.',
        detail: (error as Error).message,
      });
    }
  };
  // Search across all chats (by name and by what was said), for the chat list.
  // (The chat list is in the sidebar page, so that page may ask too.)
  ipcMain.handle('chats:search', (event, query: unknown) => {
    if (!fromWindow(event) && event.sender !== sidebar) {
      throw new Error('Not allowed.');
    }
    if (typeof query !== 'string' || query.length > 200) return [];
    return chatsModel.searchChats(chats, query);
  });
  // Files attached to a chat: picked from a dialog, dropped on the chat, or an image
  // pasted into the message box. They become artifacts (in the Space you are in) that
  // are linked to the chat, and no tab is opened.
  const chatExists = (id: unknown): id is number =>
    isId(id) && chatsModel.findConversation(chats, id) !== undefined;
  ipcMain.handle('chat:attach-pick', (event, chatId: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    if (!chatExists(chatId)) return 0;
    return pickAndImport(currentSpaceId(), chatId);
  });
  ipcMain.handle(
    'chat:attach-drop',
    (event, chatId: unknown, paths: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (!chatExists(chatId)) return 0;
      return importFiles(paths, currentSpaceId(), chatId);
    },
  );
  // A pasted picture has no file on disk: its bytes are written to a temporary file,
  // which goes through the same checks as any other upload.
  ipcMain.handle(
    'chat:attach-bytes',
    async (event, chatId: unknown, extension: unknown, data: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (!chatExists(chatId)) return 0;
      if (
        typeof extension !== 'string' ||
        !PASTED_IMAGE_EXTENSIONS.includes(extension) ||
        !(data instanceof Uint8Array) ||
        data.length === 0 ||
        data.length > MAX_UPLOAD_BYTES
      ) {
        return 0;
      }
      const folder = fs.mkdtempSync(
        path.join(app.getPath('temp'), 'aib-paste-'),
      );
      const file = path.join(folder, `pasted-image.${extension}`);
      try {
        fs.writeFileSync(file, data);
        return await importFiles([file], currentSpaceId(), chatId);
      } finally {
        fs.rmSync(folder, { recursive: true, force: true });
      }
    },
  );
  // The bytes of an uploaded image or PDF, for the viewer.
  ipcMain.handle('artifact:file', async (event, id: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    const found = isId(id)
      ? artifactsModel.findArtifact(artifacts, id)
      : undefined;
    if (!found?.file) return null;
    try {
      const data = await fs.promises.readFile(uploadPath(found));
      return { mime: found.file.mime, data: new Uint8Array(data) };
    } catch {
      return null;
    }
  });
  // Open an uploaded file with the computer's own app for it, or show where it is.
  // Only the files the app itself saved from an upload (images and PDFs) can be
  // reached this way, never an address or a path given by the page.
  ipcMain.handle(
    'artifact:open-file',
    async (event, id: unknown, how: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      const found = isId(id)
        ? artifactsModel.findArtifact(artifacts, id)
        : undefined;
      // Only an image or a PDF is ever opened with another program (see uploadTypes.ts); a saved list
      // that says a file is anything else is not believed.
      if (
        !found?.file ||
        !isViewableExtension(found.file.ext) ||
        !fs.existsSync(uploadPath(found))
      ) {
        return false;
      }
      if (how === 'folder') {
        shell.showItemInFolder(uploadPath(found));
        return true;
      }
      return (await shell.openPath(uploadPath(found))) === '';
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
  // The rows of quick search for what was typed. Only the popup page may ask.
  ipcMain.handle('quick:query', (event, text: unknown) => {
    if (event.sender !== popup || typeof text !== 'string') return [];
    return quickSearchItems(text.slice(0, 500), quickSources());
  });
  // The overlay's own page: it is listening, Stop was pressed, or its pill was dismissed.
  const fromOverlay = (event: Electron.IpcMainEvent) =>
    event.sender === overlayPage;
  const onOverlayReady = (event: Electron.IpcMainEvent) => {
    if (!fromOverlay(event)) return;
    overlayReady = true;
    updateOverlay();
  };
  // The pointer is on the pill (or the keyboard is): show or hide its list of recent steps.
  const onOverlayPeek = (event: Electron.IpcMainEvent, on: unknown) => {
    if (!fromOverlay(event) || typeof on !== 'boolean') return;
    if (overlayPeek === on) return;
    overlayPeek = on;
    updateOverlay();
  };
  const onOverlayStop = (event: Electron.IpcMainEvent) => {
    if (fromOverlay(event) && overlayReply)
      chatService?.stop(overlayReply.chatId);
  };
  // "Continue" on the pill of a stopped reply: carry on in a new reply of the same chat.
  const onOverlayContinue = (event: Electron.IpcMainEvent) => {
    if (
      fromOverlay(event) &&
      overlayReply &&
      overlayReply.message.status === 'stopped'
    ) {
      chatService?.sendMessage(overlayReply.chatId, CONTINUE_TEXT);
    }
  };
  // "Open" on the pill of a finished reply: what that reply made last (worked out here from the
  // reply itself, not taken from the pill).
  const onOverlayOpenMade = (event: Electron.IpcMainEvent) => {
    if (!fromOverlay(event) || !overlayReply) return;
    const made = madeOf(overlayReply.message);
    if (made) openMade(made.kind, made.id);
  };
  const onOverlayDismiss = (event: Electron.IpcMainEvent) => {
    if (!fromOverlay(event) || !overlayReply) return;
    dismissedReplies.add(overlayReply.message.id);
    // The chat's own copy of the status is gone with it.
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('overlay:dismissed', overlayReply.message.id);
    }
    updateOverlay();
  };
  // Minimize the popped-out card to its strip, or bring it back. Only the step that is
  // waiting right now can be minimized.
  const onOverlayMinimize = (event: Electron.IpcMainEvent, on: unknown) => {
    if (!fromOverlay(event) || !overlayReply || typeof on !== 'boolean') return;
    const waiting = popoutOf(overlayReply.message, state.tabs);
    if (!waiting) return;
    const key = stepKey(waiting.messageId, waiting.partId);
    if (on) minimizedCards.add(key);
    else minimizedCards.delete(key);
    updateOverlay();
  };
  // Show the tab the waiting step is about.
  const onOverlayGoToTab = (event: Electron.IpcMainEvent) => {
    if (!fromOverlay(event) || !overlayReply) return;
    const run = runOf(overlayReply.message);
    if (!run || run.word !== 'waiting' || run.tabId === null) return;
    if (model.findTab(state, run.tabId)?.closed !== false) return;
    select({ kind: 'tab', id: run.tabId });
  };
  // The popped-out card was answered. Only the card the app is showing can be answered, and
  // only with one of the three answers.
  const onOverlayDecide = (event: Electron.IpcMainEvent, decision: unknown) => {
    if (!fromOverlay(event) || !overlayReply) return;
    if (
      decision !== 'allow' &&
      decision !== 'allow-rest' &&
      decision !== 'deny'
    ) {
      return;
    }
    const waiting = popoutOf(overlayReply.message, state.tabs);
    if (!waiting) return;
    if (decision === 'allow-rest' && waiting.risky) return;
    chatService?.decide(
      overlayReply.chatId,
      waiting.messageId,
      waiting.partId,
      decision,
    );
  };
  // "Trust this site" on the popped-out card: the site is the one the waiting card names (read from
  // the card, never from what the overlay sent), and the step is allowed.
  const onOverlayTrust = (event: Electron.IpcMainEvent) => {
    if (!fromOverlay(event) || !overlayReply) return;
    const waiting = popoutOf(overlayReply.message, state.tabs);
    if (!waiting) return;
    chatService?.trustSiteOfCard(
      overlayReply.chatId,
      waiting.messageId,
      waiting.partId,
    );
  };
  // The overlay covers the page, so it passes the mouse wheel on to it: the page can still
  // be scrolled while the assistant works or waits.
  const onOverlayWheel = (
    event: Electron.IpcMainEvent,
    x: unknown,
    y: unknown,
    deltaX: unknown,
    deltaY: unknown,
  ) => {
    if (!fromOverlay(event) || !overlayShown) return;
    if (
      ![x, y, deltaX, deltaY].every(
        (n) => typeof n === 'number' && Number.isFinite(n),
      )
    ) {
      return;
    }
    const id = activeTabId();
    const contents = id === null ? undefined : pageContents(id);
    if (!contents || contents.isDestroyed()) return;
    const clamp = (n: number) => Math.max(-1200, Math.min(1200, Math.round(n)));
    contents.sendInputEvent({
      type: 'mouseWheel',
      x: Math.round(x as number),
      y: Math.round(y as number),
      // The page's own wheel direction is the reverse of the one the overlay saw.
      deltaX: -clamp(deltaX as number),
      deltaY: -clamp(deltaY as number),
      canScroll: true,
    });
    markerPageScrolled();
  };
  ipcMain.on('overlay:decide', onOverlayDecide);
  ipcMain.on('overlay:trust', onOverlayTrust);
  ipcMain.on('overlay:wheel', onOverlayWheel);
  ipcMain.on('overlay:ready', onOverlayReady);
  ipcMain.on('overlay:peek', onOverlayPeek);
  ipcMain.on('overlay:stop', onOverlayStop);
  ipcMain.on('overlay:continue', onOverlayContinue);
  ipcMain.on('overlay:open-made', onOverlayOpenMade);
  ipcMain.on('overlay:dismiss', onOverlayDismiss);
  // The chat asks for what the overlay shows when it opens (it may have missed the news).
  ipcMain.handle('overlay:flags-get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return lastFlags;
  });
  ipcMain.on('overlay:minimize', onOverlayMinimize);
  ipcMain.on('overlay:go-to-tab', onOverlayGoToTab);
  // How the assistant's work is shown on pages: read and changed from the Settings page.
  ipcMain.handle('agent-visuals:get', (event) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    return agentVisualSettings;
  });
  // The small picture of a screenshot, for its step row (null: none, or switched off).
  ipcMain.handle(
    'chat:thumbnail',
    (event, chatId: unknown, messageId: unknown, partId: unknown) => {
      if (!fromWindow(event)) throw new Error('Not allowed.');
      if (!agentVisualSettings.showThumbnails) return null;
      if (!isId(chatId) || !isId(messageId) || !isId(partId)) return null;
      return thumbnails.get(thumbnailKey(chatId, messageId, partId));
    },
  );
  ipcMain.handle('agent-visuals:set', (event, changes: unknown) => {
    if (!fromWindow(event)) throw new Error('Not allowed.');
    agentVisualSettings = parseAgentVisualSettings({
      ...agentVisualSettings,
      ...(typeof changes === 'object' && changes !== null ? changes : {}),
    });
    agentVisualsSaver.schedule();
    updateOverlay();
    return agentVisualSettings;
  });
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
  // The mouse's back and forward buttons.
  win.on('app-command', (_event, command) => {
    if (command === 'browser-backward') goBackOrForward('back');
    else if (command === 'browser-forward') goBackOrForward('forward');
  });
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
  recoverOnCrash(win.webContents, () => undefined);
  recoverOnCrash(sidebar, () => undefined);
  recoverOnCrash(popup, () => {
    popupReady = false;
  });
  recoverOnCrash(find, () => {
    findReady = false;
  });
  recoverOnCrash(suggestPage, () => {
    suggestReady = false;
  });
  recoverOnCrash(overlayPage, () => {
    overlayReady = false;
  });
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
  void loadUi(overlayPage, 'overlay');

  // While developing, the dev server sometimes rebuilds its bundled libraries just
  // as the app starts, and a page that loads in that moment fails to start (it
  // never asks for its state). If a page has not checked in after a few seconds,
  // load it again (a few tries at most).
  // Clear out Recently deleted (see purgeTrash) now and every few hours.
  purgeTrash();
  const trashTimer = setInterval(purgeTrash, 6 * 60 * 60_000);
  let reloadsLeft = 10;
  const watchdog = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(watchdog);
      return;
    }
    // The pages that have not started: the window and sidebar ask for the state; the
    // menu, find and suggestion pages say "ready" instead. (A menu page that never
    // started made every menu do nothing.)
    const notStarted = [
      ...[win.webContents, sidebar].filter((page) => !listening.has(page)),
      ...(popupReady ? [] : [popup]),
      ...(findReady ? [] : [find]),
      ...(suggestReady ? [] : [suggestPage]),
      ...(overlayReady ? [] : [overlayPage]),
    ];
    if (notStarted.length === 0) {
      clearInterval(watchdog);
      return;
    }
    for (const page of notStarted) {
      if (!page.isDestroyed() && !page.isLoading() && reloadsLeft > 0) {
        reloadsLeft--;
        console.warn('[ui] a page did not start; loading it again');
        page.reload();
      }
    }
  }, 3000);

  // Save for sure when the window closes (a plain write might not finish).
  // (Also run when Windows itself is shutting down or logging off: 'close' does not fire then.)
  const saveEverythingNow = () => {
    // Stop any reply still being written. (A reply cut off like this is saved as
    // it stands and marked "stopped" the next time the app starts.)
    chatService?.dispose();
    saver.flushSync();
    chatsSaver.flushSync();
    toolsSaver.flushSync();
    siteTrustSaver.flushSync();
    agentVisualsSaver.flushSync();
    artifactsSaver.flushSync();
    namingSaver.flushSync();
    librarySaver.flushSync();
    zoomSaver.flushSync();
    historySaver.flushSync();
    bookmarksSaver.flushSync();
    downloadsSaver.flushSync();
    permissionsSaver.flushSync();
    searchEngineSaver.flushSync();
    newTabSettingsSaver.flushSync();
    faviconsSaver.flushSync();
    downloadSettingsSaver.flushSync();
    closedSaver.flushSync();
    spaceTrashSaver.flushSync();
    sleepSettingsSaver.flushSync();
    extensionsSaver.flushSync();
    extensionSettingsSaver.flushSync();
    skillsSaver.flushSync();
    themeSaver.flushSync();
  };
  // Closing the window: first ask the UI page to send what it is still holding (the document
  // editor's last half second of typing), wait for its answer (at most a moment), and then close
  // and save everything. Without this the last typing reached the app after the final save.
  let closeApproved = false;
  let askingToClose = false;
  const askUiToSave = () =>
    new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        ipcMain.removeListener('app:before-close-done', onDone);
        resolve();
      };
      const onDone = (event: Electron.IpcMainEvent) => {
        if (event.sender === win.webContents) finish();
      };
      const timer = setTimeout(finish, 1500);
      ipcMain.on('app:before-close-done', onDone);
      win.webContents.send('app:before-close');
    });
  win.on('close', (event) => {
    if (!closeApproved && !windowGone() && ready.has(win.webContents)) {
      event.preventDefault();
      if (askingToClose) return;
      askingToClose = true;
      void askUiToSave().then(() => {
        closeApproved = true;
        if (!win.isDestroyed()) win.close();
      });
      return;
    }
    saveEverythingNow();
  });
  win.on('session-end', saveEverythingNow);
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
    ipcMain.removeHandler('new-tab-settings:get');
    ipcMain.removeHandler('new-tab-settings:set');
    ipcMain.removeHandler('new-tab-settings:show-hidden');
    ipcMain.removeHandler('search-engine:get');
    ipcMain.removeHandler('search-engine:set');
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
    ipcMain.removeHandler('dev:cleanup-test-spaces');
    ipcMain.removeHandler('library:history');
    ipcMain.removeHandler('library:bookmarks');
    ipcMain.removeHandler('library:deleted');
    ipcMain.removeHandler('library-settings:get');
    ipcMain.removeHandler('library-settings:set');
    ipcMain.removeHandler('library:closed');
    ipcMain.removeHandler('naming:get');
    ipcMain.removeHandler('naming:set');
    ipcMain.removeHandler('name:ai');
    ipcMain.removeHandler('site-trust:list');
    ipcMain.removeHandler('site-trust:set');
    ipcMain.removeHandler('site-trust:current');
    ipcMain.removeHandler('tools:list');
    ipcMain.removeHandler('tools:set');
    ipcMain.removeHandler('tools:reset');
    ipcMain.removeListener('overlay:ready', onOverlayReady);
    ipcMain.removeListener('overlay:decide', onOverlayDecide);
    ipcMain.removeListener('overlay:trust', onOverlayTrust);
    ipcMain.removeListener('overlay:wheel', onOverlayWheel);
    ipcMain.removeListener('overlay:peek', onOverlayPeek);
    ipcMain.removeListener('overlay:stop', onOverlayStop);
    ipcMain.removeListener('overlay:continue', onOverlayContinue);
    ipcMain.removeListener('overlay:open-made', onOverlayOpenMade);
    ipcMain.removeListener('overlay:dismiss', onOverlayDismiss);
    ipcMain.removeListener('overlay:minimize', onOverlayMinimize);
    ipcMain.removeListener('overlay:go-to-tab', onOverlayGoToTab);
    ipcMain.removeHandler('agent-visuals:get');
    ipcMain.removeHandler('chat:thumbnail');
    ipcMain.removeHandler('agent-visuals:set');
    ipcMain.removeHandler('quick:query');
    ipcMain.removeHandler('tools:preset');
    ipcMain.removeHandler('tools:set-group');
    ipcMain.removeHandler('artifact:create');
    ipcMain.removeHandler('artifact:copy');
    ipcMain.removeHandler('uploads:pick');
    ipcMain.removeHandler('uploads:drop');
    ipcMain.removeHandler('chats:search');
    ipcMain.removeHandler('skills:get');
    ipcMain.removeHandler('skills:save');
    ipcMain.removeHandler('newtab:drop');
    ipcMain.removeHandler('chat:attach-pick');
    ipcMain.removeHandler('chat:attach-drop');
    ipcMain.removeHandler('chat:attach-bytes');
    ipcMain.removeHandler('artifact:file');
    ipcMain.removeHandler('artifact:open-file');
    ipcMain.removeHandler('artifact:read');
    ipcMain.removeHandler('artifact:set-internet');
    ipcMain.removeHandler('artifact:write');
    clearInterval(watchdog);
    clearInterval(trashTimer);
    clearInterval(sleepTimer);
    for (const { channel, listener } of listeners)
      ipcMain.removeListener(channel, listener);
  });

  applyLayout(false);
  showActive();
}
