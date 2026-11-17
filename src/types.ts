import type { ChatMessage, ChatRef, LinkKind, MessagePart } from './chats';
import type { ApprovalLevel } from './toolPolicy';
import type { Bookmark } from './bookmarks';
import type { DownloadItem, DownloadSummary } from './downloadList';
import type { Answer, AskKind, SiteDetail, SiteRow } from './permissions';
import type { SiteDataRow, SiteGroup } from './siteData';
import type { SearchEngineSettings } from './searchEngine';

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
import type { ToolRow } from './toolSettings';
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
  // Closed but kept as a link in its Space (no tab, shown on the overview).
  closed: boolean;
  // Playing sound right now, and muted (the speaker shows only while one is true).
  audible: boolean;
  muted: boolean;
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
  // How many characters it holds.
  size: number;
}

// An artifact with its text, for the editor.
export interface ArtifactDocument {
  id: number;
  title: string;
  kind: ArtifactKind;
  content: string;
  // Which version of the text this is (see artifacts.ts).
  revision: number;
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
  kind: 'chat' | 'artifact';
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
  // The artifacts that are open as tabs, in the order they were opened.
  artifactTabs: ArtifactTabInfo[];
  tabs: TabInfo[];
  // What is selected: a web tab or a Space's Lead (overview) tab.
  active: ActiveRef | null;
  // How far the selected page is zoomed (1 = 100%).
  zoom: number;
  // The selected page is bookmarked (the star is filled).
  bookmarked: boolean;
  // What the toolbar's download indicator shows (it is only there when something is
  // going, or one just finished).
  downloads: DownloadSummary;
  // The page is on a site you went on to despite its certificate (not secure).
  certBypassed: boolean;
  // How many pop-ups the page you are on tried to open and were blocked.
  blockedPopups: number;
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
  libraryRestore: (kind: 'chat' | 'artifact', id: number) => void;
  libraryDeleteForever: (kind: 'chat' | 'artifact', id: number) => void;
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
  // `revision` is the version the text was based on.
  artifactWrite: (
    id: number,
    content: string,
    revision: number,
  ) => Promise<ArtifactWriteResult>;
  // The popup layer (see PopupApp.tsx): the page asks for it to show a menu at a
  // place in the window, and reports what was chosen. Only that page uses these.
  onPopupShow: (
    callback: (menu: {
      items: MenuItem[];
      x: number;
      y: number;
      alignCenter?: number;
      // Draw a card for a site instead of a menu.
      panel?: 'prompt' | 'site' | 'search';
      // Draw the emoji picker instead of a menu.
      picker?: boolean;
    }) => void,
  ) => () => void;
  onPopupHide: (callback: () => void) => () => void;
  popupReady: () => void;
  popupChoose: (id: string) => void;
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
      action: 'retry' | 'branch';
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
  }
}
