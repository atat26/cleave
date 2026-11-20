// The update button's engine (Settings > About > Updates). The installer (Squirrel for Windows) comes
// with its own updater, Update.exe; Electron's autoUpdater drives it. Nothing here runs by itself: an
// update is only looked for when you press "Check for updates" (the logic and the words are in
// updateState.ts, which has the tests).
import { app, autoUpdater, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  UPDATE_FEED,
  nextUpdateState,
  plainError,
  versionFrom,
} from './updateState';
import type { UpdateEvent, UpdateState } from './updateState';

// Squirrel puts Update.exe one folder above the running app (...\Cleave\Update.exe).
const updateExePath = () =>
  path.resolve(path.dirname(process.execPath), '..', 'Update.exe');

const startingState = (): UpdateState => {
  if (!app.isPackaged) return { kind: 'unavailable', why: 'development' };
  if (process.platform !== 'win32' || !fs.existsSync(updateExePath())) {
    return { kind: 'unavailable', why: 'not-installed' };
  }
  return { kind: 'idle' };
};

// A check that has not finished after this long is given up (a stuck connection must not leave the
// button spinning forever). Generous, because the download is about 150 MB.
const GIVE_UP_AFTER_MS = 15 * 60 * 1000;

export function registerUpdates(win: BrowserWindow): void {
  let state = startingState();
  let giveUp: NodeJS.Timeout | null = null;

  const publish = () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('update:changed', state);
    }
  };
  const dispatch = (event: UpdateEvent) => {
    const next = nextUpdateState(state, event);
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    if (state.kind !== 'checking' && state.kind !== 'downloading') {
      if (giveUp !== null) clearTimeout(giveUp);
      giveUp = null;
    }
    publish();
  };

  if (state.kind === 'idle') {
    try {
      autoUpdater.setFeedURL({ url: UPDATE_FEED });
    } catch (error) {
      state = { kind: 'error', message: plainError(error) };
    }
    autoUpdater.on('update-available', () => dispatch({ type: 'found' }));
    autoUpdater.on('update-not-available', () => dispatch({ type: 'none' }));
    autoUpdater.on('update-downloaded', (_event, _notes, name) =>
      dispatch({ type: 'downloaded', version: versionFrom(name) }),
    );
    autoUpdater.on('error', (error) =>
      dispatch({ type: 'failed', message: plainError(error) }),
    );
  }

  const check = () => {
    if (state.kind === 'unavailable' || state.kind === 'ready') return;
    if (state.kind === 'checking' || state.kind === 'downloading') return;
    dispatch({ type: 'check-started' });
    giveUp = setTimeout(
      () => dispatch({ type: 'failed', message: 'it took too long' }),
      GIVE_UP_AFTER_MS,
    );
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      dispatch({ type: 'failed', message: plainError(error) });
    }
  };

  for (const channel of ['update:get', 'update:check', 'update:install']) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.handle('update:get', () => state);
  ipcMain.handle('update:check', () => {
    check();
    return state;
  });
  ipcMain.handle('update:install', () => {
    // Restarts Cleave into the version that was prepared.
    if (state.kind === 'ready') autoUpdater.quitAndInstall();
    return state;
  });
}
