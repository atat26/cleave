import type { PdfTextResult } from './pdfTextFormat';
import type { SkillInfo } from './skills';

// A skill with its steps, for the editor.
export interface SkillDetail {
  id: number;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  origin: 'you' | 'starter' | 'assistant' | 'imported';
}
export interface SkillSaveInput {
  // null makes a new skill.
  id: number | null;
  name: string;
  description: string;
  instructions: string;
}
import type {
  ChatMatch,
  ChatMessage,
  ChatRef,
  LinkKind,
  MessagePart,
} from './chats';
import type { ApprovalLevel, ToolGroup } from './toolPolicy';
import type { PendingChange } from './pendingChanges';
import type { RunChip, TabStatus } from './sidebarStatus';
import type {
  AgentVisualSettings,
  OverlayFlags,
  OverlayState,
} from './agentVisuals';
import type { Bookmark } from './bookmarks';
import type { DownloadItem, DownloadSummary } from './downloadList';
import type { Answer, AskKind, SiteDetail, SiteRow } from './permissions';
import type { SiteDataRow, SiteGroup } from './siteData';
import type { SearchEngineSettings } from './searchEngine';
import type { NewTabSettings } from './newTabSettings';
import type { ExtensionRecord } from './extensionList';
import type { ExtensionSettings } from './extensionSettings';
import type { SleepSettings } from './sleep';
import type { UpdateState } from './updateState';
import type { BackupSummary } from './backupFormat';
import type { SiteTrust, SiteTrustRow } from './siteTrust';

// What Settings > About shows about this copy of the app.
export type AppInfo = {
  version: string;
  // The installed app, or a copy started from the project folder.
  installed: boolean;
  // The folder this copy keeps its data in.
  dataFolder: string;
};

// The sites the assistant trusts or may not touch (see siteTrust.ts).
export type SiteTrustResult =
  | { ok: true; host: string; rows: SiteTrustRow[] }
  | { ok: false; error: string };

// Settings > Backup and restore.
export type BackupInfo = {
  dataFolder: string;
  // Where Cleave keeps the copies it makes by itself before an update, and their names (newest first).
  autoCopiesFolder: string;
  autoCopies: string[];
  // What the last restore did, if there was one.
  lastRestore:
    | {
        ok: true;
        at: string;
        madeAt: string;
        safetyFolder: string;
        files: number;
      }
    | { ok: false; at: string; error: string }
    | null;
};
export type BackupMade =
  | { kind: 'cancelled' }
  | { kind: 'ok'; folder: string; summary: BackupSummary }
  | { kind: 'error'; message: string };
export type RestoreChoice =
  | { kind: 'cancelled' }
  | { kind: 'ok'; folder: string; summary: BackupSummary }
  | { kind: 'error'; message: string };

// A button's box on the window.
export interface ExtensionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// What the extension system's toolbar API (injected by its own preload) tells us
// about an extension's button.
export interface ExtensionAction {
  id: string;
  title?: string;
  text?: string;
  color?: string;
  iconModified?: number;
  tabs: Record<string, { title?: string; text?: string; color?: string }>;
}
export interface BrowserActionApi {
  addEventListener(
    name: 'update',
    listener: (state: {
      activeTabId?: number;
      actions: ExtensionAction[];
    }) => void,
  ): void;
  removeEventListener(name: 'update', listener: unknown): void;
  getState(partition: string): Promise<{
    activeTabId?: number;
    actions: ExtensionAction[];
  }>;
  activate(
    partition: string,
    details: {
      eventType: 'click' | 'contextmenu';
      extensionId: string;
      tabId: number;
      alignment: string;
      anchorRect: ExtensionBox;
    },
  ): Promise<void>;
  addObserver(partition: string): void;
  removeObserver(partition: string): void;
}

// An extension as the Extensions panel shows it.
export interface ExtensionRow extends ExtensionRecord {
  // What it asks for, in plain words.
  words: string[];
  // Is it running now?
  loaded: boolean;
  // Its own picture (a data address), if it has one.
  icon: string | null;
}

// A main site with its cookies, for Settings (icons are remembered from pages).
export interface SiteDataGroup extends Omit<SiteGroup, 'hosts'> {
  icon: string | null;
  hosts: (SiteDataRow & { icon: string | null })[];
}
import type { SettingsSection } from './settingsNav';
import type { DownloadSettings } from './downloadSettings';
import type { Suggestion } from './suggest';
import type { HistoryEntry } from './history';
import type { LibrarySettings } from './librarySettings';
import type { ThemeChoice } from './themeSettings';
import type { ToolPreset, ToolRow } from './toolSettings';
import type { ActiveRef, RightPanel, SpaceColor, ViewMode } from './model';
import type { ModelInfo } from './openrouter';
import type { ArtifactKind } from './artifacts';
import type { ChatNeed } from './layout';
import type { MenuItem } from './menuTypes';

export type { ChatMessage, ChatRef, LinkKind, MessagePart, ModelInfo };

// A tab as the UI sees it.
export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  // The Space it belongs to, or null if ungrouped.
  spaceId: number | null;
  // False for a "sleeping" tab that has not been opened yet this session.
  loaded: boolean;
  // True while the assistant is working in this tab.
  working: boolean;
  // The dot the sidebar shows on it: working, waiting for you, stuck, or finished (until you
  // open it); null for none.
  status: TabStatus | null;
  // The page is loading right now.
  loading: boolean;
  // It was asleep and the assistant woke it for the step it is running (until that is over).
  wokeForAssistant: boolean;
  // What a request waiting for your answer would do to this tab (move or close), or null.
  pending: PendingChange | null;
  // Closed but kept as a link in its Space (no tab, shown on the overview).
  closed: boolean;
  // Playing sound right now, and muted (the speaker shows only while one is true).
  audible: boolean;
  muted: boolean;
}

// What the new-tab page needs, worked out by the app from what is on this computer.
export interface NewTabInfo {
  // No Spaces yet: the page is plain, with a line about what a Space is.
  firstRun: boolean;
  // The tab the app opened itself at launch, with nothing else to open.
  welcomeBack: boolean;
  // Opened straight after another untouched new tab: just the box and the pills.
  secondInRow: boolean;
  autoMode: boolean;
  suggestions: boolean;
  // Up to three unfinished things from the Space, and how many there are in all.
  pick: {
    key: string;
    kind: 'chat' | 'artifact' | 'page';
    id: number;
    title: string;
    at: number;
    // A chat with a reply waiting to be read.
    unread: boolean;
  }[];
  pickTotal: number;
  // The Spaces for the pills: the current one first, then the most recently used,
  // three in all; and how many more there are.
  spaces: SpaceInfo[];
  moreSpaces: number;
  // The time this was worked out (for "12 min ago").
  now: number;
}

// An artifact as the UI lists it (its text stays in the app until it is opened).
export interface ArtifactInfo {
  id: number;
  title: string;
  // What it shows as its picture (its own emoji, or the default for its kind).
  emoji: string;
  kind: ArtifactKind;
  // The Space it belongs to, or null for one outside every Space.
  spaceId: number | null;
  updatedAt: number;
  // How many characters it holds (for an uploaded file: how many bytes).
  size: number;
  // "Image" or "PDF" for an uploaded file, null for a text artifact.
  fileLabel: string | null;
}

// An artifact with its text, for the editor.
export interface ArtifactDocument {
  id: number;
  title: string;
  kind: ArtifactKind;
  content: string;
  // Which version of the text this is (see artifacts.ts).
  revision: number;
  // An HTML page you allowed to use the internet in its preview (for this text).
  internet: boolean;
}

// How saving the editor's text went. A conflict means the text was changed (by
// the assistant) since the editor loaded it, so nothing was saved.
export type ArtifactWriteResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict' | 'failed' };

// An artifact that is open as a tab.
export interface ArtifactTabInfo {
  id: number;
  title: string;
  emoji: string;
  kind: ArtifactKind;
  spaceId: number | null;
}

export interface SpaceInfo {
  id: number;
  name: string;
  // What it shows as its picture (its own emoji, or the default).
  emoji: string;
  color: SpaceColor;
  collapsed: boolean;
  // The note you wrote about it.
  about: string;
}

// ---- The AI provider (OpenRouter) -------------------------------------------
// The UI can save and remove an API key but never read it back: all it ever
// learns is whether one is saved.

export interface LlmStatus {
  // Can a key be stored safely on this computer?
  encryptionAvailable: boolean;
  hasKey: boolean;
  // The default model for new chats, or null if none has been chosen.
  model: string | null;
  // Models you use often, in pin order (quick choices in the chat).
  pinned: string[];
  // Your own system prompt, or null if you are using the default.
  systemPrompt: string | null;
  // The built-in default, to show in Settings.
  defaultSystemPrompt: string;
}

// What the chat needs to know about the AI connection. (Never the key itself.)
// What the Settings screen knows about web search. The key itself never leaves
// the main process; only whether one is saved.
export interface SearchStatus {
  encryptionAvailable: boolean;
  providers: { id: string; name: string; site: string }[];
  provider: string;
  hasKey: boolean;
}
export type SearchSaveResult =
  | { ok: true; status: SearchStatus }
  | { ok: false; error: string; status: SearchStatus };
export type SearchTestResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export interface LlmInfo {
  hasKey: boolean;
  // The default model for new chats.
  model: string | null;
  pinned: string[];
  // Can the model of the chat you are looking at use tools (read pages)? null
  // when that is not known.
  activeModelSupportsTools: boolean | null;
}

// The answer to "send this message" (or "retry"). On success the reply streams in
// separately; on failure `kind` says why, so the chat can offer the right help.
export type ChatSendResult =
  | { ok: true }
  | {
      ok: false;
      kind:
        | 'no-key'
        | 'no-model'
        | 'busy'
        | 'empty'
        | 'too-long'
        | 'unknown-chat'
        | 'nothing-to-retry'
        | 'invalid';
      error: string;
    };

export type LlmResult =
  | { ok: true; status: LlmStatus }
  | { ok: false; error: string; status: LlmStatus };

export type LlmTestResult =
  | {
      ok: true;
      // The key's name on openrouter.ai, and its credit (US dollars; null = no limit).
      label: string;
      usage: number | null;
      limit: number | null;
      limitRemaining: number | null;
    }
  | { ok: false; error: string };

export type LlmModelsResult =
  | { ok: true; models: ModelInfo[] }
  | { ok: false; error: string };

// A conversation as the UI sees it (the messages themselves come later).
// The lists in the Library panel.
export type LibraryList =
  | 'bookmarks'
  | 'history'
  | 'downloads'
  | 'closed'
  | 'deleted';

// A deleted chat or artifact, as the Library lists it.
export interface DeletedItemInfo {
  kind: 'chat' | 'artifact' | 'space' | 'skill';
  id: number;
  title: string;
  emoji: string;
  detail: string;
  deletedAt: number;
  // How many days until it is removed for good.
  daysLeft: number;
}

// A recently closed tab, as the Library lists it.
export interface ClosedTabInfo {
  id: number;
  url: string;
  title: string;
  closedAt: number;
  // The Space it was in (if it still exists).
  spaceName: string | null;
  spaceEmoji: string | null;
}

export interface ChatInfo {
  id: number;
  title: string;
  emoji: string;
  // When it was last used (a message was sent or a reply written).
  updatedAt: number;
  messageCount: number;
  // The model this chat uses instead of the default, or null for the default.
  model: string | null;
  // A reply is being written in this chat right now.
  generating: boolean;
  // A reply finished while you were not looking at this chat, and is still unread.
  unread: boolean;
  // The Spaces this chat is linked to (so a Space's overview can list its chats).
  spaceIds: number[];
}

export interface ChatsInfo {
  // In the order they were created.
  conversations: ChatInfo[];
  activeId: number;
  // The Spaces and tabs linked to the chat you are looking at.
  refs: ChatRef[];
}

// Everything the UI needs to draw itself.
export interface UiState {
  chats: ChatsInfo;
  llm: LlmInfo;
  spaces: SpaceInfo[];
  artifacts: ArtifactInfo[];
  // The skills (names and descriptions; the steps are fetched when one is edited).
  skills: SkillInfo[];
  // The artifacts that are open as tabs, in the order they were opened.
  artifactTabs: ArtifactTabInfo[];
  tabs: TabInfo[];
  // The line at the top of the sidebar while the assistant is at work (null: none).
  assistantChip: RunChip | null;
  // What is selected: a web tab or a Space's Lead (overview) tab.
  active: ActiveRef | null;
  // How far the selected page is zoomed (1 = 100%).
  zoom: number;
  // Whether there is something on screen to zoom (a web page, an image or a PDF).
  zoomable: boolean;
  // The selected page is bookmarked (the star is filled).
  bookmarked: boolean;
  // What the toolbar's download indicator shows (it is only there when something is
  // going, or one just finished).
  downloads: DownloadSummary;
  // The page is on a site you went on to despite its certificate (not secure).
  certBypassed: boolean;
  // How many pop-ups the page you are on tried to open and were blocked.
  blockedPopups: number;
  // What the new-tab page shows (null when you are not on one).
  newTab: NewTabInfo | null;
  // The ACTIVE web tab is still loading (its reload button becomes Stop).
  loading: boolean;
  // Whether the ACTIVE web tab can go back / forward.
  canGoBack: boolean;
  canGoForward: boolean;
  // Pinned: always open, and the page makes room for it.
  sidebarPinned: boolean;
  // Currently showing its full width (pinned, or opened by hovering).
  sidebarExpanded: boolean;
  // What the middle shows: the page and chat together, the page alone, or the
  // chat alone.
  viewMode: ViewMode;
  // The bottom chat is expanded (taller than the compact bar).
  chatExpanded: boolean;
  // Which panel is open on the right, if any.
  rightPanel: RightPanel | null;
}

// The parts of the frame that can be dragged to a new size.
export type ResizeKind = 'sidebar' | 'chat' | 'panel';

// How much room the parts of the frame take right now, in pixels. The app
// sends these many times a second while the frame slides, so the UI can follow.
export interface FrameLayout {
  // Where the toolbar, page and chat start (the sidebar's reserved width).
  left: number;
  // How far right the sidebar view reaches right now (wider than `left` while it
  // floats open over the page).
  sidebar: number;
  // Width of the right panel (0 when closed), not counting the rail.
  panel: number;
  // Height of the chat at the bottom.
  chat: number;
}

// Shape of the API the preload script exposes to the UI as window.browserApi.
export interface BrowserApi {
  platform: string;
  // Load whatever the user typed (a URL or search text) in the active tab.
  navigate: (input: string) => void;
  goBack: () => void;
  goForward: () => void;
  // Reload the active page, or stop it while it is still loading.
  reloadPage: () => void;
  // Pin the sidebar open, or unpin it (back to the strip).
  toggleSidebarPin: () => void;
  // The toolbar "…" menu (the browser's tools), opened at a place in the window.
  showToolsMenu: (x: number, y: number) => void;
  // Address-bar suggestions: ask for rows; show them under the address bar (with
  // which one is highlighted, -1 for none); pick one; hide them. The dropdown's own
  // page listens for the rows and reports a click.
  suggestQuery: (text: string) => Promise<Suggestion[]>;
  suggestShow: (
    rows: Suggestion[],
    selected: number,
    bar: { x: number; y: number; width: number; height: number },
  ) => void;
  suggestHide: () => void;
  suggestPick: (index: number) => void;
  suggestReady: () => void;
  onSuggestRows: (
    callback: (payload: { rows: Suggestion[]; selected: number }) => void,
  ) => () => void;
  // The Library panel: browsing history and recently closed tabs.
  libraryHistory: (query: string) => Promise<HistoryEntry[]>;
  // The star in the address bar (bookmark, or save into a Space).
  showStarMenu: (x: number, y: number) => void;
  // The lock chip's menu: what this site may do.
  showSiteMenu: (x: number, y: number) => void;
  // The new-tab page's box: do what Enter was going to do.
  // With Ask, the items picked with "@" go along (they are linked to the new chat).
  newTabRun: (
    text: string,
    mode: 'go' | 'search' | 'ask',
    mentions?: {
      kind: 'tab' | 'space' | 'artifact';
      id: number;
      tag: string;
    }[],
  ) => void;
  // The new-tab page: open a Pick up item, hide one, click a Space pill (a Space id,
  // or 'new' for a new Space), or show all of the Space's items.
  newTabResume: (kind: 'chat' | 'artifact' | 'page', id: number) => void;
  newTabHide: (key: string) => void;
  newTabPill: (space: number | 'new') => void;
  // "+ N more": a menu of the Spaces that are not pills.
  showNewTabSpacesMenu: (x: number, y: number) => void;
  newTabShowAll: (spaceId: number) => void;
  // Settings > New tab.
  newTabSettingsGet: () => Promise<NewTabSettings>;
  newTabSettingsSet: (changes: unknown) => Promise<NewTabSettings>;
  newTabShowHidden: () => Promise<NewTabSettings>;
  // Extensions (the list; the Extensions panel comes in the next step).
  extensionsList: () => Promise<ExtensionRow[]>;
  // The Add extension menu: from the Chrome Web Store or from a folder. What came
  // of a folder (a line to show, or null to clear it) arrives as a message.
  showExtensionsAddMenu: (x: number, y: number) => void;
  onExtensionsMessage: (
    callback: (message: string | null) => void,
  ) => () => void;
  // Settings > Extensions.
  extensionSettingsGet: () => Promise<ExtensionSettings>;
  extensionSettingsSet: (changes: {
    autoUpdate?: boolean;
  }) => Promise<ExtensionSettings>;
  extensionsSetEnabled: (key: string, enabled: boolean) => Promise<void>;
  // Asks first (a native question), then removes.
  extensionsRemove: (key: string) => Promise<void>;
  // Right-click menu of one extension.
  showExtensionMenu: (key: string, x: number, y: number) => void;
  // The puzzle button's menu (x, y: where it opens; box: the button).
  showExtensionsPuzzle: (x: number, y: number, box: ExtensionBox) => void;
  // Which extension's popup is open now (null: none).
  onExtensionPopup: (
    callback: (extensionId: string | null) => void,
  ) => () => void;
  // The app asks the toolbar to open an extension's popup from this button.
  onExtensionActivate: (
    callback: (extensionId: string, box: ExtensionBox) => void,
  ) => () => void;
  onExtensionsChanged: (callback: () => void) => () => void;
  // Ctrl+L: the app asks the toolbar to put the keyboard in the address bar.
  onFocusAddress: (callback: () => void) => () => void;
  // The "pop-up blocked" chip's card.
  showPopupsMenu: (x: number, y: number) => void;
  libraryBookmarks: (query: string) => Promise<Bookmark[]>;
  libraryRemoveBookmark: (id: number) => void;
  // Downloads: the list, and Settings > Downloads.
  downloadsList: () => Promise<DownloadItem[]>;
  downloadsAct: (
    id: number,
    action: 'open' | 'show' | 'pause' | 'resume' | 'cancel' | 'remove',
  ) => void;
  showDownloadMenu: (id: number, x: number, y: number) => void;
  // Open the Library panel on one of its lists.
  showLibrary: (list: LibraryList) => void;
  onDownloadsChanged: (callback: () => void) => () => void;
  onLibrarySelectList: (callback: (list: LibraryList) => void) => () => void;
  // Settings > Search engine: the one the address bar uses.
  searchEngineGet: () => Promise<SearchEngineSettings>;
  searchEngineSet: (changes: unknown) => Promise<SearchEngineSettings>;
  // Settings > Privacy: the sites with saved permissions, and clearing data.
  privacySites: () => Promise<SiteRow[]>;
  // One site's page in Settings, and changing one of its permissions (null: ask).
  privacySiteDetail: (site: string) => Promise<SiteDetail | null>;
  privacySetAnswer: (
    site: string,
    kind: AskKind,
    answer: Answer | null,
  ) => Promise<SiteDetail | null>;
  // The sites that have cookies saved, and clearing one site's data (asks first;
  // true if it was cleared).
  privacyDataSites: () => Promise<SiteDataGroup[]>;
  // A main site (and everything under it) or one name.
  privacyClearSite: (
    target: { site: string } | { host: string },
  ) => Promise<boolean>;
  showPrivacyDataMenu: (
    kind: 'site' | 'host',
    name: string,
    x: number,
    y: number,
  ) => void;
  // The app asks Settings to open on a part (the lock card's "Site settings").
  onSettingsSection: (
    callback: (section: SettingsSection) => void,
  ) => () => void;
  privacyResetSite: (site: string) => Promise<SiteRow[]>;
  // Resolves true if it was cleared (it asks first).
  privacyClear: (what: {
    siteData: boolean;
    cache: boolean;
  }) => Promise<boolean>;
  showPrivacyMenu: (site: string, x: number, y: number) => void;
  onPrivacyChanged: (callback: () => void) => () => void;
  downloadSettingsGet: () => Promise<DownloadSettings>;
  downloadSettingsSet: (
    changes: Partial<Omit<DownloadSettings, 'version'>>,
  ) => Promise<DownloadSettings>;
  downloadSettingsPickFolder: () => Promise<DownloadSettings>;
  downloadsOpenFolder: () => Promise<void>;
  libraryClosed: () => Promise<ClosedTabInfo[]>;
  // Chats and artifacts deleted lately, newest first, and what to do with them.
  libraryDeleted: () => Promise<DeletedItemInfo[]>;
  libraryRestore: (
    kind: 'chat' | 'artifact' | 'space' | 'skill',
    id: number,
  ) => void;
  libraryDeleteForever: (
    kind: 'chat' | 'artifact' | 'space' | 'skill',
    id: number,
  ) => void;
  // Settings > Library (history and Recently deleted).
  librarySettingsGet: () => Promise<LibrarySettings>;
  librarySettingsSet: (
    changes: Partial<Omit<LibrarySettings, 'version'>>,
  ) => Promise<LibrarySettings>;
  // Open a page from the Library; in the background, behind the page you are on.
  libraryOpen: (url: string, background?: boolean) => void;
  libraryRemoveVisit: (id: number) => void;
  libraryReopenClosed: (id: number) => void;
  showLibraryMenu: (
    list: 'history' | 'closed' | 'deleted' | 'downloads',
    x: number,
    y: number,
  ) => void;
  onLibraryChanged: (callback: () => void) => () => void;
  // The small menu behind the zoom chip in the address bar.
  showZoomMenu: (x: number, y: number) => void;
  // One zoom step in (1) or out (-1), or back to 100% (0), for what is on screen.
  changeZoom: (direction: 1 | -1 | 0) => void;
  // Find in page. Only the find bar's own page uses these.
  findReady: () => void;
  findQuery: (text: string, forward: boolean, again: boolean) => void;
  findClose: () => void;
  onFindOpen: (callback: () => void) => () => void;
  onFindClosed: (callback: () => void) => () => void;
  onFindResult: (
    callback: (result: { active: number; total: number }) => void,
  ) => () => void;
  // Drag and drop in the sidebar: put a tab in a Space (null: outside every Space)
  // before another tab (null: at the end); the same for an open artifact and a Space.
  moveTab: (
    tabId: number,
    spaceId: number | null,
    beforeTabId: number | null,
  ) => void;
  moveArtifactTab: (
    artifactId: number,
    spaceId: number | null,
    beforeArtifactId: number | null,
  ) => void;
  moveSpace: (spaceId: number, beforeSpaceId: number | null) => void;
  // Alt+Up / Alt+Down: one place up (-1) or down (1).
  nudgeItem: (
    kind: 'tab' | 'artifact' | 'space',
    id: number,
    direction: -1 | 1,
  ) => void;
  // What the chat needs on screen right now (see layout.ts).
  setChatNeed: (need: ChatNeed) => void;
  stopLoading: () => void;
  // New tab inside a Space, or ungrouped when spaceId is null.
  newTab: (spaceId: number | null) => void;
  // Close a tab. In a Space the page is kept as a closed link on the overview.
  closeTab: (id: number) => void;
  // Mute or unmute one tab (it stays as set until the app closes).
  setTabMuted: (id: number, muted: boolean) => void;
  // Delete a tab for good, including a closed link.
  removeTab: (id: number) => void;
  // Open a closed link again.
  reopenTab: (id: number) => void;
  selectTab: (id: number) => void;
  // The chip at the top of the sidebar was clicked: go to what the assistant is on.
  assistantChipGo: () => void;
  // You have seen this tab's green or red dot (moved off its row, or clicked it): clear it.
  markTabSeen: (id: number) => void;
  selectLead: (spaceId: number) => void;
  newSpace: () => void;
  setSpaceCollapsed: (id: number, collapsed: boolean) => void;
  renameSpace: (id: number, name: string) => void;
  // The mouse rested on the sidebar's icon strip: please open it. (Closing is
  // decided by the app, by watching how far the mouse has moved away.)
  // Web search settings (the provider, and its key, which is never shown).
  searchStatus: () => Promise<SearchStatus>;
  searchSetProvider: (provider: string) => Promise<SearchStatus>;
  searchSaveKey: (key: string) => Promise<SearchSaveResult>;
  searchRemoveKey: () => Promise<SearchStatus>;
  searchTest: () => Promise<SearchTestResult>;
  // The Tools panel: every tool with its level, change one level, or put them all
  // back to the defaults. Each answers with the updated list.
  // The look of the app: light, dark, or follow the computer.
  // Automatic naming of new chats (on or off).
  namingGet: () => Promise<boolean>;
  namingSet: (auto: boolean) => Promise<boolean>;
  // "Name it with AI": the model picks a name and emoji for a chat, Space or
  // artifact and the app applies them. The result says how it went.
  nameWithAi: (
    kind: 'chat' | 'space' | 'artifact',
    id: number,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  themeGet: () => Promise<ThemeChoice>;
  themeSet: (choice: ThemeChoice) => Promise<ThemeChoice>;
  toolsList: () => Promise<ToolRow[]>;
  toolsSetLevel: (tool: string, level: ApprovalLevel) => Promise<ToolRow[]>;
  toolsReset: () => Promise<ToolRow[]>;
  toolsPreset: (preset: ToolPreset) => Promise<ToolRow[]>;
  toolsSetGroup: (group: ToolGroup, level: ApprovalLevel) => Promise<ToolRow[]>;
  // The level menu of a tool ("tool:name") or a group ("group:name"), and its choice.
  showToolLevelMenu: (target: string, x: number, y: number) => void;
  onToolLevelChosen: (
    callback: (target: string, level: ApprovalLevel) => void,
  ) => () => void;
  // The Artifacts panel: make one (outside every Space when spaceId is null),
  // rename it, move it into a Space (or null for none), or delete it (the app asks
  // first). The list itself arrives with the rest of the state.
  artifactCreate: (
    kind: ArtifactKind,
    title: string,
    spaceId: number | null,
  ) => Promise<number | null>;
  // Open an artifact as a tab (or switch to it), switch to an open one, or close
  // its tab (the artifact is kept).
  artifactOpen: (id: number) => void;
  artifactSelect: (id: number) => void;
  artifactClose: (id: number) => void;
  // The editor: load an artifact's text, and save changes to it.
  artifactRead: (id: number) => Promise<ArtifactDocument | null>;
  // Allow (or stop allowing) the internet in an HTML page's preview. Allowing asks
  // first; the answer is whether it is allowed afterwards.
  artifactSetInternet: (id: number, on: boolean) => Promise<boolean>;
  // "Upload files…": pick files and add them to a Space (null: to none). The answer
  // is how many were added.
  uploadPick: (spaceId: number | null) => Promise<number>;
  // Add files dropped on the Artifacts panel or a Space's overview.
  uploadDrop: (files: File[], spaceId: number | null) => Promise<number>;
  // The bytes of an uploaded image or PDF (null if it is gone).
  // Files dropped on the new-tab page: they are added as artifacts, and these are
  // returned to show as chips under the box.
  newTabDropFiles: (
    files: File[],
  ) => Promise<{ id: number; title: string; emoji: string }[]>;
  // The "+" in the message box: a menu to add a page, a Space, an artifact or a file.
  showAddToChatMenu: (chatId: number, x: number, y: number) => void;
  // A page, Space or artifact was chosen from that menu: the message box lists them.
  onComposerAdd: (
    callback: (chatId: number, kind: 'page' | 'space' | 'artifact') => void,
  ) => () => void;
  // Skills: the full text of one (to edit it), save one (a new one with id null),
  // import files, and the app asking the panel to open its editor (id null = new).
  skillGet: (id: number) => Promise<SkillDetail | null>;
  skillSave: (
    input: SkillSaveInput,
  ) => Promise<{ ok: true; id: number } | { ok: false; error: string }>;
  skillEnable: (id: number, enabled: boolean) => void;
  skillDelete: (id: number) => void;
  showSkillMenu: (id: number, x: number, y: number) => void;
  showNewSkillMenu: (x: number, y: number) => void;
  onSkillEdit: (callback: (id: number | null) => void) => () => void;
  // What the HTML preview of an artifact reported (errors, blocked loads).
  reportPreview: (
    id: number,
    messages: { kind: 'blocked' | 'error'; text: string }[],
  ) => void;
  // The app asks the open preview of an artifact to run again and report.
  onPreviewCheck: (callback: (id: number) => void) => () => void;
  // Find chats by name or by what was said in them.
  searchChats: (query: string) => Promise<ChatMatch[]>;
  // "Search chats…" was chosen: put the keyboard in the chat list's search box.
  onFocusChatSearch: (callback: () => void) => () => void;
  // Change one of your messages and send it again. The newest is changed where it
  // is; an older one is changed in a new chat (this chat stays as it was).
  chatEdit: (
    chatId: number,
    messageId: number,
    text: string,
  ) => Promise<ChatSendResult>;
  // Attach files to a chat (they become artifacts linked to it): choose them in a
  // dialog, drop them, or paste a picture. Each gives how many were added.
  chatAttachPick: (chatId: number) => Promise<number>;
  chatAttachFiles: (chatId: number, files: File[]) => Promise<number>;
  // Answer the app's requests to read a PDF's text (see pdfText.ts).
  onPdfExtract: (
    handler: (data: Uint8Array) => Promise<PdfTextResult>,
  ) => () => void;
  artifactFile: (
    id: number,
  ) => Promise<{ mime: string; data: Uint8Array } | null>;
  // Open an uploaded file with the computer's own app, or show it in its folder.
  artifactOpenFile: (id: number, how: 'open' | 'folder') => Promise<boolean>;
  // "New" in the Artifacts panel: a menu of kinds (made in the Space you are in).
  showNewArtifactMenu: (x: number, y: number) => void;
  // Close all of a Space's open pages, or reopen all its closed ones.
  spaceBulk: (id: number, action: 'close-all' | 'reopen-all' | 'sleep') => void;
  // Settings > About.
  appInfo: () => Promise<AppInfo>;
  // Sites the assistant trusts or may not touch: the list, a change (a site name or address, and
  // "trusted", "blocked" or "unknown" to remove it), and the site on screen with its level.
  siteTrustList: () => Promise<SiteTrustRow[]>;
  siteTrustSet: (site: string, level: SiteTrust) => Promise<SiteTrustResult>;
  siteTrustCurrent: () => Promise<{ host: string; level: SiteTrust } | null>;
  // "Trust this site" on a card in the chat or over the page: trusts the site the card names, and
  // allows the step.
  chatTrustSite: (chatId: number, messageId: number, partId: number) => void;
  overlayTrust: () => void;
  backupInfo: () => Promise<BackupInfo>;
  // Asks where to save, then saves a backup there (the keys only if asked for).
  backupCreate: (includeKeys: boolean) => Promise<BackupMade>;
  // Asks which backup folder, and checks it.
  backupChooseRestore: () => Promise<RestoreChoice>;
  // Restores the folder that was chosen: Cleave restarts to do it.
  backupRestore: () => Promise<{ ok: boolean; message: string }>;
  // Settings > About > Updates: the state, looking for an update (only when asked), restarting into
  // a prepared one, and being told when the state changes.
  updateGet: () => Promise<UpdateState>;
  updateCheck: () => Promise<UpdateState>;
  updateInstall: () => Promise<UpdateState>;
  onUpdateChanged: (callback: (state: UpdateState) => void) => () => void;
  // Settings > Pages and memory.
  sleepSettingsGet: () => Promise<SleepSettings>;
  sleepSettingsSet: (changes: {
    afterMinutes?: number;
  }) => Promise<SleepSettings>;
  // The Space switcher menu, at a place in the window.
  showSpaceSwitcher: (x: number, y: number) => void;
  // Save the note on a Space's overview.
  setSpaceAbout: (id: number, text: string) => void;
  // The setting changed (from the menu): its artifact's id.
  onArtifactInternet: (callback: (id: number) => void) => () => void;
  // `revision` is the version the text was based on.
  artifactWrite: (
    id: number,
    content: string,
    revision: number,
  ) => Promise<ArtifactWriteResult>;
  // The overlay on the page (the glow and the pill): the app tells it what to show (null:
  // nothing), and it says when it is listening, when Stop is pressed, or when its pill
  // is dismissed. Only the overlay's own page uses these.
  onOverlayState: (
    callback: (state: OverlayState | null) => void,
  ) => () => void;
  overlayReady: () => void;
  // Answer the approval card that popped out over the page, and scroll the page under it
  // (the overlay covers the page, so it passes the wheel on).
  overlayDecide: (decision: 'allow' | 'allow-rest' | 'deny') => void;
  overlayWheel: (x: number, y: number, deltaX: number, deltaY: number) => void;
  // The main window is told what the overlay shows on the page: the status pill, and an
  // approval card popped out or minimized (so the chat does not show them a second time, or
  // grow to make room for the card).
  onOverlayFlags: (callback: (flags: OverlayFlags) => void) => () => void;
  // The pill of this reply was dismissed on the page.
  onOverlayDismissed: (callback: (messageId: number) => void) => () => void;
  // The pill's hover list is open (true) or closed: the strip grows to hold it.
  overlayPeek: (on: boolean) => void;
  chatThumbnail: (
    chatId: number,
    messageId: number,
    partId: number,
  ) => Promise<string | null>;
  overlayStop: () => void;
  overlayContinue: () => void;
  overlayOpenMade: () => void;
  openMade: (kind: string, id: number) => void;
  overlayDismiss: () => void;
  // Shrink the popped-out card to its strip (true) or bring it back (false), and show the
  // tab its step is about.
  overlayMinimize: (on: boolean) => void;
  // What the overlay shows right now (asked when the chat opens).
  overlayFlagsGet: () => Promise<OverlayFlags>;
  overlayGoToTab: () => void;
  // How the assistant's work is shown on pages (kept for the Settings page to use).
  agentVisualsGet: () => Promise<AgentVisualSettings>;
  agentVisualsSet: (
    changes: Partial<AgentVisualSettings>,
  ) => Promise<AgentVisualSettings>;
  // A step of the assistant's work in the chat: its right-click menu (what it can do
  // depends on the hints), "Show details" chosen from it, and "Try again".
  showStepMenu: (
    chatId: number,
    messageId: number,
    partId: number,
    x: number,
    y: number,
    hints: { retry: boolean; open: boolean },
  ) => void;
  onStepToggle: (
    callback: (messageId: number, partId: number) => void,
  ) => () => void;
  chatRetryStep: (chatId: number, messageId: number, partId: number) => void;
  // The popup layer (see PopupApp.tsx): the page asks for it to show a menu at a
  // place in the window, and reports what was chosen. Only that page uses these.
  onPopupShow: (
    callback: (menu: {
      items: MenuItem[];
      x: number;
      y: number;
      alignCenter?: number;
      // Draw a card for a site instead of a menu.
      panel?: 'prompt' | 'site' | 'search' | 'quick';
      // Draw the emoji picker instead of a menu.
      picker?: boolean;
    }) => void,
  ) => () => void;
  onPopupHide: (callback: () => void) => () => void;
  popupReady: () => void;
  popupChoose: (id: string) => void;
  // Quick search (Ctrl+K): the rows for what was typed. Only the popup page asks.
  quickQuery: (text: string) => Promise<MenuItem[]>;
  popupClose: () => void;
  // Called when the assistant changed an artifact's text (so an open editor can
  // show it). Returns an unsubscribe function.
  onArtifactChanged: (callback: (id: number) => void) => () => void;
  artifactRename: (id: number, title: string) => void;
  // Make another artifact with the same text, in a Space (or none).
  artifactCopy: (id: number, spaceId: number | null) => Promise<number | null>;
  artifactMove: (id: number, spaceId: number | null) => void;
  artifactDelete: (id: number) => void;
  // A link in a reply was clicked: open it as a new tab (web addresses only).
  openUrl: (url: string) => void;
  // Ask the app to send the current state (call once listening for it).
  uiReady: () => void;
  hoverSidebar: () => void;
  // Expand the bottom chat, or shrink it back to the compact bar. (If the chat
  // is closed, or fills the window, this brings back the page with the chat.)
  toggleChat: () => void;
  // Show the page alone (chat closed), both, or the chat alone (page hidden).
  setViewMode: (mode: ViewMode) => void;
  // The AI provider (OpenRouter). The key goes in but never comes back out.
  // Test runs only: removes the Spaces a test made, without the confirmation (see testScope.ts).
  devCleanupTestSpaces: () => Promise<number>;
  llmStatus: () => Promise<LlmStatus>;
  llmSaveKey: (key: string) => Promise<LlmResult>;
  llmRemoveKey: () => Promise<LlmStatus>;
  llmTestConnection: () => Promise<LlmTestResult>;
  llmListModels: (refresh?: boolean) => Promise<LlmModelsResult>;
  llmSetModel: (model: string | null) => Promise<LlmResult>;
  llmTogglePin: (model: string) => Promise<LlmResult>;
  llmSetSystemPrompt: (text: string | null) => Promise<LlmResult>;
  // Talking to the model. The messages live in the app; the UI asks for a chat's
  // messages when it opens one, then follows changes as they stream in.
  chatMessages: (chatId: number) => Promise<ChatMessage[]>;
  chatSend: (
    chatId: number,
    text: string,
    mentions: { kind: LinkKind; id: number; tag: string }[],
  ) => Promise<ChatSendResult>;
  // Try again: the last reply (after a failure or a stop), or, with a message id,
  // from that earlier message of yours (even if it went fine).
  chatRetry: (chatId: number, messageId?: number) => Promise<ChatSendResult>;
  // Start a new chat from an earlier message of yours (it and its reply are
  // copied; the chat it came from is left as it was).
  chatBranch: (chatId: number, messageId: number) => Promise<ChatSendResult>;
  // The messages of a chat changed in a way the screen cannot patch (some were
  // removed): load them again.
  onChatReset: (callback: (chatId: number) => void) => () => void;
  chatStop: (chatId: number) => void;
  // Answer an approval card in a reply.
  chatDecide: (
    chatId: number,
    messageId: number,
    partId: number,
    decision: 'allow' | 'allow-rest' | 'deny',
  ) => void;
  // Put text on the clipboard (the app does it, so it works the same everywhere).
  chatCopy: (text: string) => void;
  // Linking Spaces and tabs to a chat (so the model knows what the chat is about).
  chatLink: (chatId: number, kind: LinkKind, id: number) => void;
  chatUnlink: (chatId: number, kind: LinkKind, id: number) => void;
  // Jump to a linked tab, or to a linked Space's overview.
  chatOpenLink: (kind: LinkKind, id: number) => void;
  // Bring back a linked tab that was closed.
  chatReopenLink: (chatId: number, tabId: number) => void;
  // Shows a menu of your pinned models to switch this chat to.
  showModelMenu: (chatId: number, x: number, y: number) => void;
  // Open the Settings panel.
  openSettings: () => void;
  // Open the Artifacts panel (it stays open if it already is).
  openArtifacts: () => void;
  // Called with a chat's message whenever it is added or changes (many times a
  // second while a reply streams in). Returns an unsubscribe function.
  onChatMessage: (
    callback: (event: { chatId: number; message: ChatMessage }) => void,
  ) => () => void;
  // Managing conversations. They are independent of Spaces and tabs.
  newChat: () => void;
  selectChat: (id: number) => void;
  renameChat: (id: number, title: string) => void;
  // Asks before deleting a chat that has messages.
  deleteChat: (id: number) => void;
  // Shows a native menu. Without an id it is the chat title's menu (switch
  // chats, new chat, rename or delete the current one); with an id it is the
  // right-click menu for that one chat (rename, delete).
  // alignCenter: the vertical middle of the control that opened the menu. The
  // menu lines its current choice up with it, and runs down from there.
  showChatMenu: (
    id: number | undefined,
    x: number,
    y: number,
    alignCenter?: number,
  ) => void;
  // Called when "Rename chat" is chosen from a menu: show that chat's rename box.
  onChatRenameRequest: (callback: (chatId: number) => void) => () => void;
  // Open one of the right panels, or close it if it is already the open one.
  togglePanel: (panel: RightPanel) => void;
  // Dragging an edge of the frame. `size` is where the edge is now, in pixels
  // (the sidebar's width, the chat's height, or the panel's width).
  startResize: (kind: ResizeKind) => void;
  resize: (kind: ResizeKind, size: number) => void;
  endResize: (kind: ResizeKind, size: number) => void;
  // Called with the frame's current layout, including while it slides.
  // Returns an unsubscribe function.
  onLayout: (callback: (layout: FrameLayout) => void) => () => void;
  // Right-click menus. The app shows a native menu and performs the choice.
  // x and y are where you clicked, in the window (the pointer's client position).
  showTabMenu: (id: number, x: number, y: number) => void;
  showSpaceMenu: (id: number, x: number, y: number) => void;
  // The menu of an artifact (a row, a card, or a row in the Artifacts panel).
  showArtifactMenu: (id: number, x: number, y: number) => void;
  // The menu behind a Space overview's Add button.
  showSpaceAddMenu: (spaceId: number, x: number, y: number) => void;
  // The menu of a link in a chat. "removable" is true for a chip above the message
  // box (it can be taken off the chat), false for an @name in a sent message.
  showLinkMenu: (
    chatId: number,
    kind: LinkKind,
    id: number,
    removable: boolean,
    x: number,
    y: number,
  ) => void;
  // Cut, copy, paste and select all for the address bar or the message box.
  showEditMenu: (
    kind: 'address' | 'composer' | 'editor',
    x: number,
    y: number,
    hasSelection: boolean,
    // The selected text, for the artifact editor's "Add selection to chat".
    selected?: string,
  ) => void;
  // The menu of a chat message (selection: the text selected in it, if any).
  showMessageMenu: (
    chatId: number,
    messageId: number,
    x: number,
    y: number,
    selection: string,
  ) => void;
  // Retry or Branch was chosen from a message's menu: the chat does it.
  onMessageAction: (
    callback: (action: {
      chatId: number;
      messageId: number;
      action: 'retry' | 'branch' | 'edit';
    }) => void,
  ) => () => void;
  // Text to put in the message box (for example a selection from a web page).
  onComposerInsert: (callback: (text: string) => void) => () => void;
  // Rename was chosen from an artifact's menu: show its name as a text box.
  onArtifactRenameRequest: (callback: (id: number) => void) => () => void;
  // Called when "Rename Space" is chosen from a menu: show the rename box.
  onRenameRequest: (callback: (spaceId: number) => void) => () => void;
  // Called whenever anything the UI shows changes. Returns an unsubscribe function.
  onState: (callback: (state: UiState) => void) => () => void;
}

declare global {
  interface Window {
    browserApi: BrowserApi;
    // Put there by the extension system's own preload, only in the main window.
    browserAction?: BrowserActionApi;
  }
}
