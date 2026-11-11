import type { ChatMessage, ChatRef } from './chats';
import type { ActiveRef, RightPanel, SpaceColor, ViewMode } from './model';
import type { ModelInfo } from './openrouter';

export type { ChatMessage, ChatRef, ModelInfo };

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
}

export interface SpaceInfo {
  id: number;
  name: string;
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
export interface LlmInfo {
  hasKey: boolean;
  // The default model for new chats.
  model: string | null;
  pinned: string[];
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
export interface ChatInfo {
  id: number;
  title: string;
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
  tabs: TabInfo[];
  // What is selected: a web tab or a Space's Lead (overview) tab.
  active: ActiveRef | null;
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
  // New tab inside a Space, or ungrouped when spaceId is null.
  newTab: (spaceId: number | null) => void;
  closeTab: (id: number) => void;
  selectTab: (id: number) => void;
  selectLead: (spaceId: number) => void;
  newSpace: () => void;
  setSpaceCollapsed: (id: number, collapsed: boolean) => void;
  renameSpace: (id: number, name: string) => void;
  // The mouse rested on the sidebar's icon strip: please open it. (Closing is
  // decided by the app, by watching how far the mouse has moved away.)
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
    mentions: { kind: 'space' | 'tab'; id: number; tag: string }[],
  ) => Promise<ChatSendResult>;
  chatRetry: (chatId: number) => Promise<ChatSendResult>;
  chatStop: (chatId: number) => void;
  // Put text on the clipboard (the app does it, so it works the same everywhere).
  chatCopy: (text: string) => void;
  // Linking Spaces and tabs to a chat (so the model knows what the chat is about).
  chatLink: (chatId: number, kind: 'tab' | 'space', id: number) => void;
  chatUnlink: (chatId: number, kind: 'tab' | 'space', id: number) => void;
  // Jump to a linked tab, or to a linked Space's overview.
  chatOpenLink: (kind: 'tab' | 'space', id: number) => void;
  // Bring back a linked tab that was closed.
  chatReopenLink: (chatId: number, tabId: number) => void;
  // Shows a menu of your pinned models to switch this chat to.
  showModelMenu: (chatId: number) => void;
  // Open the Settings panel.
  openSettings: () => void;
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
  showChatMenu: (id?: number) => void;
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
  showTabMenu: (id: number) => void;
  showSpaceMenu: (id: number) => void;
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
