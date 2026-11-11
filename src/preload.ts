// The preload script is the ONLY bridge between the UI page and the app.
// Expose small, specific functions here -- never whole Electron modules.
import { contextBridge } from 'electron';
import type { BrowserApi } from './types';

const browserApi: BrowserApi = {
  platform: process.platform,
};

contextBridge.exposeInMainWorld('browserApi', browserApi);
