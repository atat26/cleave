// The preload script is the ONLY bridge between the UI page and the app.
// Expose small, specific functions here -- never whole Electron modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi, FrameLayout, UiState } from './types';

const browserApi: BrowserApi = {
  platform: process.platform,

  navigate: (input) => ipcRenderer.send('tab:navigate', input),
  goBack: () => ipcRenderer.send('tab:back'),
  goForward: () => ipcRenderer.send('tab:forward'),
  newTab: (spaceId) => ipcRenderer.send('tab:new', spaceId),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  selectTab: (id) => ipcRenderer.send('tab:select', id),
  selectLead: (spaceId) => ipcRenderer.send('lead:select', spaceId),
  newSpace: () => ipcRenderer.send('space:new'),
  setSpaceCollapsed: (id, collapsed) =>
    ipcRenderer.send('space:collapse', id, collapsed),
  renameSpace: (id, name) => ipcRenderer.send('space:rename', id, name),
  hoverSidebar: () => ipcRenderer.send('sidebar:hover'),
  toggleChat: () => ipcRenderer.send('chat:toggle'),
  setViewMode: (mode) => ipcRenderer.send('view:set', mode),
  llmStatus: () => ipcRenderer.invoke('llm:status'),
  llmSaveKey: (key) => ipcRenderer.invoke('llm:save-key', key),
  llmRemoveKey: () => ipcRenderer.invoke('llm:remove-key'),
  llmTestConnection: () => ipcRenderer.invoke('llm:test'),
  llmListModels: (refresh) => ipcRenderer.invoke('llm:models', refresh),
  llmSetModel: (model) => ipcRenderer.invoke('llm:set-model', model),
  newChat: () => ipcRenderer.send('chats:new'),
  selectChat: (id) => ipcRenderer.send('chats:select', id),
  renameChat: (id, title) => ipcRenderer.send('chats:rename', id, title),
  deleteChat: (id) => ipcRenderer.send('chats:delete', id),
  showChatMenu: (id) => ipcRenderer.send('chats:menu', id),
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
  showTabMenu: (id) => ipcRenderer.send('tab:menu', id),
  showSpaceMenu: (id) => ipcRenderer.send('space:menu', id),

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
