import { app, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import type { AppInfo } from './types';

// What Settings > About shows: the version, and whether this is the installed app or a copy started
// from the project folder (a development copy, which uses its own data folder). Only the app's own
// window may ask.
export function registerAppInfo(win: BrowserWindow): void {
  ipcMain.removeHandler('app:info');
  ipcMain.handle('app:info', (event): AppInfo => {
    if (event.sender !== win.webContents) throw new Error('Not allowed.');
    return {
      version: app.getVersion(),
      installed: app.isPackaged,
      dataFolder: app.getPath('userData'),
    };
  });
}
