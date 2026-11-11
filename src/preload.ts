// The preload script is the ONLY bridge between the UI page and the app.
// Expose small, specific functions here -- never whole Electron modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi } from './types';

const browserApi: BrowserApi = {
  platform: process.platform,

  navigate: (input) => {
    ipcRenderer.send('tab:navigate', input);
  },

  onUrlChange: (callback) => {
    const listener = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on('tab:url', listener);
    return () => {
      ipcRenderer.removeListener('tab:url', listener);
    };
  },
};

contextBridge.exposeInMainWorld('browserApi', browserApi);
