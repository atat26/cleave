// The preload script is the ONLY bridge between the UI page and the app.
// Expose small, specific functions here -- never whole Electron modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi, UiState } from './types';

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
  setSidebarHover: (hovering) => ipcRenderer.send('sidebar:hover', hovering),
  setSidebarPinned: (pinned) => ipcRenderer.send('sidebar:pin', pinned),
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
