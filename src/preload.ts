// The preload script is the ONLY bridge between the UI page and the app.
// Expose small, specific functions here -- never whole Electron modules.
import { contextBridge, ipcRenderer } from 'electron';
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action';
import type {
  BrowserApi,
  ChatMessage,
  ExtensionBox,
  FrameLayout,
  UiState,
} from './types';

// The toolbar page (not the menu, find or suggestion pages that share this
// preload) gets the extension system's button API.
if (!location.hash) injectBrowserAction();

const browserApi: BrowserApi = {
  platform: process.platform,

  navigate: (input) => ipcRenderer.send('tab:navigate', input),
  goBack: () => ipcRenderer.send('tab:back'),
  goForward: () => ipcRenderer.send('tab:forward'),
  reloadPage: () => ipcRenderer.send('tab:reload'),
  toggleSidebarPin: () => ipcRenderer.send('sidebar:toggle-pin'),
  showToolsMenu: (x, y) => ipcRenderer.send('toolbar:menu', x, y),
  suggestQuery: (text) => ipcRenderer.invoke('suggest:query', text),
  suggestShow: (rows, selected, bar) =>
    ipcRenderer.send('suggest:show', rows, selected, bar),
  suggestHide: () => ipcRenderer.send('suggest:hide'),
  suggestPick: (index) => ipcRenderer.send('suggest:pick', index),
  suggestReady: () => ipcRenderer.send('suggest:ready'),
  onSuggestRows: (callback) => {
    const listener = (
      _event: unknown,
      payload: Parameters<typeof callback>[0],
    ) => callback(payload);
    ipcRenderer.on('suggest:rows', listener);
    return () => {
      ipcRenderer.removeListener('suggest:rows', listener);
    };
  },
  libraryHistory: (query) => ipcRenderer.invoke('library:history', query),
  showStarMenu: (x, y) => ipcRenderer.send('star:menu', x, y),
  showSiteMenu: (x, y) => ipcRenderer.send('site:menu', x, y),
  newTabRun: (text, mode, mentions) =>
    ipcRenderer.send('newtab:run', text, mode, mentions ?? []),
  newTabResume: (kind, id) => ipcRenderer.send('newtab:resume', kind, id),
  newTabHide: (key) => ipcRenderer.send('newtab:hide', key),
  newTabPill: (space) => ipcRenderer.send('newtab:pill', space),
  showNewTabSpacesMenu: (x, y) => ipcRenderer.send('newtab:more-menu', x, y),
  newTabShowAll: (spaceId) => ipcRenderer.send('newtab:show-all', spaceId),
  newTabSettingsGet: () => ipcRenderer.invoke('new-tab-settings:get'),
  newTabSettingsSet: (changes) =>
    ipcRenderer.invoke('new-tab-settings:set', changes),
  newTabShowHidden: () => ipcRenderer.invoke('new-tab-settings:show-hidden'),
  extensionsList: () => ipcRenderer.invoke('extensions:list'),
  showExtensionsAddMenu: (x, y) =>
    ipcRenderer.send('extensions:add-menu', x, y),
  onExtensionsMessage: (callback) => {
    const listener = (_event: unknown, message: unknown) =>
      callback(typeof message === 'string' ? message : null);
    ipcRenderer.on('extensions:message', listener);
    return () => ipcRenderer.removeListener('extensions:message', listener);
  },
  extensionSettingsGet: () => ipcRenderer.invoke('extension-settings:get'),
  extensionSettingsSet: (changes) =>
    ipcRenderer.invoke('extension-settings:set', changes),
  extensionsSetEnabled: (key, enabled) =>
    ipcRenderer.invoke('extensions:set-enabled', key, enabled),
  extensionsRemove: (key) => ipcRenderer.invoke('extensions:remove', key),
  showExtensionMenu: (key, x, y) =>
    ipcRenderer.send('extensions:menu', key, x, y),
  showExtensionsPuzzle: (x, y, box) =>
    ipcRenderer.send('extensions:puzzle', x, y, box),
  onExtensionPopup: (callback) => {
    const listener = (_event: unknown, id: unknown) =>
      callback(typeof id === 'string' ? id : null);
    ipcRenderer.on('extensions:popup', listener);
    return () => ipcRenderer.removeListener('extensions:popup', listener);
  },
  onExtensionActivate: (callback) => {
    const listener = (_event: unknown, id: unknown, box: unknown) =>
      callback(id as string, box as ExtensionBox);
    ipcRenderer.on('extensions:activate', listener);
    return () => ipcRenderer.removeListener('extensions:activate', listener);
  },
  onExtensionsChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('extensions:changed', listener);
    return () => ipcRenderer.removeListener('extensions:changed', listener);
  },
  onFocusAddress: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('toolbar:focus-address', listener);
    return () => {
      ipcRenderer.removeListener('toolbar:focus-address', listener);
    };
  },
  showPopupsMenu: (x, y) => ipcRenderer.send('popups:menu', x, y),
  libraryBookmarks: (query) => ipcRenderer.invoke('library:bookmarks', query),
  libraryRemoveBookmark: (id) =>
    ipcRenderer.send('library:remove-bookmark', id),
  downloadsList: () => ipcRenderer.invoke('downloads:list'),
  downloadsAct: (id, action) => ipcRenderer.send('downloads:act', id, action),
  showDownloadMenu: (id, x, y) => ipcRenderer.send('downloads:menu', id, x, y),
  showLibrary: (list) => ipcRenderer.send('library:show', list),
  onDownloadsChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('downloads:changed', listener);
    return () => {
      ipcRenderer.removeListener('downloads:changed', listener);
    };
  },
  onLibrarySelectList: (callback) => {
    const listener = (_event: unknown, list: Parameters<typeof callback>[0]) =>
      callback(list);
    ipcRenderer.on('library:select-list', listener);
    return () => {
      ipcRenderer.removeListener('library:select-list', listener);
    };
  },
  searchEngineGet: () => ipcRenderer.invoke('search-engine:get'),
  searchEngineSet: (changes) =>
    ipcRenderer.invoke('search-engine:set', changes),
  privacySites: () => ipcRenderer.invoke('privacy:sites'),
  privacySiteDetail: (site) => ipcRenderer.invoke('privacy:site-detail', site),
  privacySetAnswer: (site, kind, answer) =>
    ipcRenderer.invoke('privacy:set-answer', site, kind, answer),
  privacyDataSites: () => ipcRenderer.invoke('privacy:data-sites'),
  privacyClearSite: (target) =>
    ipcRenderer.invoke('privacy:clear-site', target),
  showPrivacyDataMenu: (kind, name, x, y) =>
    ipcRenderer.send('privacy:data-menu', kind, name, x, y),
  onSettingsSection: (callback) => {
    const listener = (
      _event: unknown,
      section: Parameters<typeof callback>[0],
    ) => callback(section);
    ipcRenderer.on('settings:section', listener);
    return () => {
      ipcRenderer.removeListener('settings:section', listener);
    };
  },
  privacyResetSite: (site) => ipcRenderer.invoke('privacy:reset-site', site),
  privacyClear: (what) => ipcRenderer.invoke('privacy:clear', what),
  showPrivacyMenu: (site, x, y) => ipcRenderer.send('privacy:menu', site, x, y),
  onPrivacyChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('privacy:changed', listener);
    return () => {
      ipcRenderer.removeListener('privacy:changed', listener);
    };
  },
  downloadSettingsGet: () => ipcRenderer.invoke('download-settings:get'),
  downloadSettingsSet: (changes) =>
    ipcRenderer.invoke('download-settings:set', changes),
  downloadSettingsPickFolder: () =>
    ipcRenderer.invoke('download-settings:pick-folder'),
  downloadsOpenFolder: () => ipcRenderer.invoke('downloads:open-folder'),
  libraryClosed: () => ipcRenderer.invoke('library:closed'),
  libraryDeleted: () => ipcRenderer.invoke('library:deleted'),
  libraryRestore: (kind, id) => ipcRenderer.send('library:restore', kind, id),
  libraryDeleteForever: (kind, id) =>
    ipcRenderer.send('library:delete-forever', kind, id),
  librarySettingsGet: () => ipcRenderer.invoke('library-settings:get'),
  librarySettingsSet: (changes) =>
    ipcRenderer.invoke('library-settings:set', changes),
  libraryOpen: (url, background) =>
    ipcRenderer.send('library:open', url, background === true),
  libraryRemoveVisit: (id) => ipcRenderer.send('library:remove-visit', id),
  libraryReopenClosed: (id) => ipcRenderer.send('library:reopen-closed', id),
  showLibraryMenu: (list, x, y) => ipcRenderer.send('library:menu', list, x, y),
  onLibraryChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('library:changed', listener);
    return () => {
      ipcRenderer.removeListener('library:changed', listener);
    };
  },
  showZoomMenu: (x, y) => ipcRenderer.send('zoom:menu', x, y),
  findReady: () => ipcRenderer.send('find:ready'),
  findQuery: (text, forward, again) =>
    ipcRenderer.send('find:query', text, forward, again),
  findClose: () => ipcRenderer.send('find:close'),
  onFindOpen: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('find:open', listener);
    return () => {
      ipcRenderer.removeListener('find:open', listener);
    };
  },
  onFindClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('find:closed', listener);
    return () => {
      ipcRenderer.removeListener('find:closed', listener);
    };
  },
  onFindResult: (callback) => {
    const listener = (
      _event: unknown,
      result: Parameters<typeof callback>[0],
    ) => callback(result);
    ipcRenderer.on('find:result', listener);
    return () => {
      ipcRenderer.removeListener('find:result', listener);
    };
  },
  moveTab: (tabId, spaceId, beforeTabId) =>
    ipcRenderer.send('sidebar:move-tab', tabId, spaceId, beforeTabId),
  moveArtifactTab: (artifactId, spaceId, beforeArtifactId) =>
    ipcRenderer.send(
      'sidebar:move-artifact',
      artifactId,
      spaceId,
      beforeArtifactId,
    ),
  moveSpace: (spaceId, beforeSpaceId) =>
    ipcRenderer.send('sidebar:move-space', spaceId, beforeSpaceId),
  nudgeItem: (kind, id, direction) =>
    ipcRenderer.send('sidebar:nudge', kind, id, direction),
  setChatNeed: (need) => ipcRenderer.send('chat:need', need),
  stopLoading: () => ipcRenderer.send('tab:stop'),
  newTab: (spaceId) => ipcRenderer.send('tab:new', spaceId),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  setTabMuted: (id, muted) => ipcRenderer.send('tab:mute', id, muted),
  removeTab: (id) => ipcRenderer.send('tab:remove', id),
  reopenTab: (id) => ipcRenderer.send('tab:reopen', id),
  selectTab: (id) => ipcRenderer.send('tab:select', id),
  selectLead: (spaceId) => ipcRenderer.send('lead:select', spaceId),
  newSpace: () => ipcRenderer.send('space:new'),
  setSpaceCollapsed: (id, collapsed) =>
    ipcRenderer.send('space:collapse', id, collapsed),
  renameSpace: (id, name) => ipcRenderer.send('space:rename', id, name),
  searchStatus: () => ipcRenderer.invoke('search:status'),
  searchSetProvider: (provider) =>
    ipcRenderer.invoke('search:set-provider', provider),
  searchSaveKey: (key) => ipcRenderer.invoke('search:save-key', key),
  searchRemoveKey: () => ipcRenderer.invoke('search:remove-key'),
  searchTest: () => ipcRenderer.invoke('search:test'),
  namingGet: () => ipcRenderer.invoke('naming:get'),
  namingSet: (auto) => ipcRenderer.invoke('naming:set', auto),
  nameWithAi: (kind, id) =>
    kind === 'chat'
      ? ipcRenderer.invoke('chat:name-ai', id)
      : ipcRenderer.invoke('name:ai', kind, id),
  themeGet: () => ipcRenderer.invoke('theme:get'),
  themeSet: (choice) => ipcRenderer.invoke('theme:set', choice),
  toolsList: () => ipcRenderer.invoke('tools:list'),
  toolsSetLevel: (tool, level) => ipcRenderer.invoke('tools:set', tool, level),
  toolsReset: () => ipcRenderer.invoke('tools:reset'),
  artifactCreate: (kind, title, spaceId) =>
    ipcRenderer.invoke('artifact:create', kind, title, spaceId),
  artifactOpen: (id) => ipcRenderer.send('artifact:open', id),
  artifactSelect: (id) => ipcRenderer.send('artifact:select', id),
  artifactClose: (id) => ipcRenderer.send('artifact:close', id),
  artifactRead: (id) => ipcRenderer.invoke('artifact:read', id),
  setSpaceAbout: (id, text) => ipcRenderer.send('space:about', id, text),
  spaceBulk: (id, action) => ipcRenderer.send('space:bulk', id, action),
  showNewArtifactMenu: (x, y) => ipcRenderer.send('artifact:new-menu', x, y),
  artifactSetInternet: (id, on) =>
    ipcRenderer.invoke('artifact:set-internet', id, on),
  onArtifactInternet: (callback) => {
    const listener = (_event: unknown, id: number) => callback(id);
    ipcRenderer.on('artifact:internet', listener);
    return () => {
      ipcRenderer.removeListener('artifact:internet', listener);
    };
  },
  artifactWrite: (id, content, revision) =>
    ipcRenderer.invoke('artifact:write', id, content, revision),
  artifactCopy: (id, spaceId) =>
    ipcRenderer.invoke('artifact:copy', id, spaceId),
  artifactRename: (id, title) => ipcRenderer.send('artifact:rename', id, title),
  artifactMove: (id, spaceId) => ipcRenderer.send('artifact:move', id, spaceId),
  artifactDelete: (id) => ipcRenderer.send('artifact:delete', id),
  openUrl: (url) => ipcRenderer.send('ui:open-url', url),
  uiReady: () => ipcRenderer.send('ui:ready'),
  hoverSidebar: () => ipcRenderer.send('sidebar:hover'),
  toggleChat: () => ipcRenderer.send('chat:toggle'),
  setViewMode: (mode) => ipcRenderer.send('view:set', mode),
  llmStatus: () => ipcRenderer.invoke('llm:status'),
  llmSaveKey: (key) => ipcRenderer.invoke('llm:save-key', key),
  llmRemoveKey: () => ipcRenderer.invoke('llm:remove-key'),
  llmTestConnection: () => ipcRenderer.invoke('llm:test'),
  llmListModels: (refresh) => ipcRenderer.invoke('llm:models', refresh),
  llmSetModel: (model) => ipcRenderer.invoke('llm:set-model', model),
  llmTogglePin: (model) => ipcRenderer.invoke('llm:toggle-pin', model),
  llmSetSystemPrompt: (text) =>
    ipcRenderer.invoke('llm:set-system-prompt', text),
  chatMessages: (chatId) => ipcRenderer.invoke('chat:messages', chatId),
  chatSend: (chatId, text, mentions) =>
    ipcRenderer.invoke('chat:send', chatId, text, mentions),
  chatRetry: (chatId, messageId) =>
    ipcRenderer.invoke('chat:retry', chatId, messageId),
  chatBranch: (chatId, messageId) =>
    ipcRenderer.invoke('chat:branch', chatId, messageId),
  onArtifactChanged: (callback) => {
    const listener = (_event: unknown, id: number) => callback(id);
    ipcRenderer.on('artifact:changed', listener);
    return () => {
      ipcRenderer.removeListener('artifact:changed', listener);
    };
  },
  onChatReset: (callback) => {
    const listener = (_event: unknown, chatId: number) => callback(chatId);
    ipcRenderer.on('chat:reset', listener);
    return () => {
      ipcRenderer.removeListener('chat:reset', listener);
    };
  },
  chatStop: (chatId) => ipcRenderer.send('chat:stop', chatId),
  chatDecide: (chatId, messageId, partId, decision) =>
    ipcRenderer.send('chat:decide', chatId, messageId, partId, decision),
  chatCopy: (text) => ipcRenderer.send('chat:copy', text),
  chatLink: (chatId, kind, id) =>
    ipcRenderer.send('chats:link', chatId, kind, id),
  chatUnlink: (chatId, kind, id) =>
    ipcRenderer.send('chats:unlink', chatId, kind, id),
  chatOpenLink: (kind, id) => ipcRenderer.send('chats:open-link', kind, id),
  chatReopenLink: (chatId, tabId) =>
    ipcRenderer.send('chats:reopen-link', chatId, tabId),
  showModelMenu: (chatId, x, y) =>
    ipcRenderer.send('chat:model-menu', chatId, x, y),
  openArtifacts: () => ipcRenderer.send('panel:open', 'artifacts'),
  openSettings: () => ipcRenderer.send('panel:open', 'settings'),
  onChatMessage: (callback) => {
    const listener = (
      _event: unknown,
      payload: { chatId: number; message: ChatMessage },
    ) => callback(payload);
    ipcRenderer.on('chat:message', listener);
    return () => {
      ipcRenderer.removeListener('chat:message', listener);
    };
  },
  newChat: () => ipcRenderer.send('chats:new'),
  selectChat: (id) => ipcRenderer.send('chats:select', id),
  renameChat: (id, title) => ipcRenderer.send('chats:rename', id, title),
  deleteChat: (id) => ipcRenderer.send('chats:delete', id),
  showChatMenu: (id, x, y, alignCenter) =>
    ipcRenderer.send('chats:menu', id ?? null, x, y, alignCenter),
  onChatRenameRequest: (callback) => {
    const listener = (_event: unknown, chatId: number) => callback(chatId);
    ipcRenderer.on('chats:begin-rename', listener);
    return () => {
      ipcRenderer.removeListener('chats:begin-rename', listener);
    };
  },
  togglePanel: (panel) => ipcRenderer.send('panel:toggle', panel),
  startResize: (kind) => ipcRenderer.send('resize:start', kind),
  resize: (kind, size) => ipcRenderer.send('resize:move', kind, size),
  endResize: (kind, size) => ipcRenderer.send('resize:end', kind, size),

  onLayout: (callback) => {
    const listener = (_event: unknown, layout: FrameLayout) => callback(layout);
    ipcRenderer.on('ui:layout', listener);
    return () => {
      ipcRenderer.removeListener('ui:layout', listener);
    };
  },
  showTabMenu: (id, x, y) => ipcRenderer.send('tab:menu', id, x, y),
  onPopupShow: (callback) => {
    const listener = (_event: unknown, menu: Parameters<typeof callback>[0]) =>
      callback(menu);
    ipcRenderer.on('popup:show', listener);
    return () => {
      ipcRenderer.removeListener('popup:show', listener);
    };
  },
  onPopupHide: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('popup:hide', listener);
    return () => {
      ipcRenderer.removeListener('popup:hide', listener);
    };
  },
  popupReady: () => ipcRenderer.send('popup:ready'),
  popupChoose: (id) => ipcRenderer.send('popup:choose', id),
  popupClose: () => ipcRenderer.send('popup:close'),
  showSpaceMenu: (id, x, y) => ipcRenderer.send('space:menu', id, x, y),
  showArtifactMenu: (id, x, y) => ipcRenderer.send('artifact:menu', id, x, y),
  showSpaceAddMenu: (spaceId, x, y) =>
    ipcRenderer.send('space:add-menu', spaceId, x, y),
  showLinkMenu: (chatId, kind, id, removable, x, y) =>
    ipcRenderer.send('link:menu', chatId, kind, id, removable, x, y),
  showEditMenu: (kind, x, y, hasSelection, selected) =>
    ipcRenderer.send('edit:menu', kind, x, y, hasSelection, selected),
  showMessageMenu: (chatId, messageId, x, y, selection) =>
    ipcRenderer.send('chat:message-menu', chatId, messageId, x, y, selection),
  onMessageAction: (callback) => {
    const listener = (
      _event: unknown,
      action: Parameters<typeof callback>[0],
    ) => callback(action);
    ipcRenderer.on('chat:message-action', listener);
    return () => {
      ipcRenderer.removeListener('chat:message-action', listener);
    };
  },
  onComposerInsert: (callback) => {
    const listener = (_event: unknown, text: string) => callback(text);
    ipcRenderer.on('composer:insert', listener);
    return () => {
      ipcRenderer.removeListener('composer:insert', listener);
    };
  },
  onArtifactRenameRequest: (callback) => {
    const listener = (_event: unknown, id: number) => callback(id);
    ipcRenderer.on('artifact:begin-rename', listener);
    return () => {
      ipcRenderer.removeListener('artifact:begin-rename', listener);
    };
  },

  onRenameRequest: (callback) => {
    const listener = (_event: unknown, spaceId: number) => callback(spaceId);
    ipcRenderer.on('space:begin-rename', listener);
    return () => {
      ipcRenderer.removeListener('space:begin-rename', listener);
    };
  },

  onState: (callback) => {
    const listener = (_event: unknown, state: UiState) => callback(state);
    ipcRenderer.on('ui:state', listener);
    return () => {
      ipcRenderer.removeListener('ui:state', listener);
    };
  },
};

contextBridge.exposeInMainWorld('browserApi', browserApi);
