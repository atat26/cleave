// The preload script is the ONLY bridge between the UI page and the app.
// Expose small, specific functions here -- never whole Electron modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi, TabState } from './types';

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

  onTabState: (callback) => {
    const listener = (_event: unknown, state: TabState) => callback(state);
    ipcRenderer.on('tab:state', listener);
    return () => {
      ipcRenderer.removeListener('tab:state', listener);
    };
  },
};

contextBridge.exposeInMainWorld('browserApi', browserApi);
