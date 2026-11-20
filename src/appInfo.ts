import { app, ipcMain } from 'electron';
import type { AppInfo } from './types';

// What Settings > About shows: the version, and whether this is the installed app or a copy started
// from the project folder (a development copy, which uses its own data folder).
export function registerAppInfo(): void {
  ipcMain.handle(
    'app:info',
    (): AppInfo => ({
      version: app.getVersion(),
      installed: app.isPackaged,
      dataFolder: app.getPath('userData'),
    }),
  );
}
