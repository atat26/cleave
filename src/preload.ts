// The preload script is the ONLY bridge between the UI page and the app.
// Expose small, specific functions here -- never whole Electron modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi, TabsState } from './types';

const browserApi: BrowserApi = {
  platform: process.platform,

  navigate: (input) => {
    ipcRenderer.send('tab:navigate', input);
  },
  goBack: () => {
    ipcRenderer.send('tab:back');
  },
  goForward: () => {
    ipcRenderer.send('tab:forward');
  },
  newTab: () => {
    ipcRenderer.send('tab:new');
  },
  closeTab: (id) => {
    ipcRenderer.send('tab:close', id);
  },
  switchTab: (id) => {
    ipcRenderer.send('tab:switch', id);
  },

  onTabsState: (callback) => {
    const listener = (_event: unknown, state: TabsState) => callback(state);
    ipcRenderer.on('tabs:state', listener);
    return () => {
      ipcRenderer.removeListener('tabs:state', listener);
    };
  },
};

contextBridge.exposeInMainWorld('browserApi', browserApi);
