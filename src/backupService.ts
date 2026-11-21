// The Electron side of backup and restore (Settings > Backup and restore): the folder pickers, and
// the restart that makes a restore happen. The rules are in backupFormat.ts and the file work in
// backupFiles.ts (both tested). The page never passes a path in: it can only ask Cleave to open a
// picker, so it cannot make Cleave read or write anywhere on its own.
import { app, dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { backupFolderName, summarizeBackup } from './backupFormat';
import {
  AUTO_BACKUPS_DIR,
  createBackup,
  listAutoSnapshots,
  readRestoreResult,
  stageRestore,
  verifyBackup,
} from './backupFiles';
import type { BackupInfo, BackupMade, RestoreChoice } from './types';

export function registerBackup(win: BrowserWindow): void {
  const dataDir = () => app.getPath('userData');
  // The folder the person picked to restore from; only this can be restored.
  let chosen: string | null = null;

  for (const channel of [
    'backup:info',
    'backup:create',
    'backup:choose-restore',
    'backup:restore',
  ]) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle('backup:info', (event): BackupInfo => {
    if (event.sender !== win.webContents) throw new Error('Not allowed.');
    const last = readRestoreResult(dataDir());
    return {
      dataFolder: dataDir(),
      autoCopiesFolder: path.join(dataDir(), AUTO_BACKUPS_DIR),
      autoCopies: listAutoSnapshots(dataDir()),
      lastRestore: last,
    };
  });

  ipcMain.handle(
    'backup:create',
    async (event, includeKeys: unknown): Promise<BackupMade> => {
      if (event.sender !== win.webContents) throw new Error('Not allowed.');
      const picked = await dialog.showOpenDialog(win, {
        title: 'Choose where to save the backup',
        buttonLabel: 'Save backup here',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { kind: 'cancelled' };
      }
      try {
        const { folder, manifest } = createBackup({
          dataDir: dataDir(),
          parentDir: picked.filePaths[0],
          folderName: backupFolderName(new Date()),
          appVersion: app.getVersion(),
          includeKeys: includeKeys === true,
          now: new Date(),
        });
        // Check what was just written, so "done" means the copy can be restored.
        const checked = verifyBackup(folder);
        if (!checked.ok) return { kind: 'error', message: checked.error };
        return { kind: 'ok', folder, summary: summarizeBackup(manifest) };
      } catch (error) {
        return {
          kind: 'error',
          message: `The backup could not be saved: ${(error as Error).message}`,
        };
      }
    },
  );

  ipcMain.handle(
    'backup:choose-restore',
    async (event): Promise<RestoreChoice> => {
      if (event.sender !== win.webContents) throw new Error('Not allowed.');
      chosen = null;
      const autoFolder = path.join(dataDir(), AUTO_BACKUPS_DIR);
      const picked = await dialog.showOpenDialog(win, {
        title: 'Choose the backup folder to restore',
        buttonLabel: 'Use this backup',
        defaultPath: fs.existsSync(autoFolder) ? autoFolder : undefined,
        properties: ['openDirectory'],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { kind: 'cancelled' };
      }
      const checked = verifyBackup(picked.filePaths[0]);
      if (!checked.ok) return { kind: 'error', message: checked.error };
      chosen = picked.filePaths[0];
      return {
        kind: 'ok',
        folder: picked.filePaths[0],
        summary: summarizeBackup(checked.manifest),
      };
    },
  );

  ipcMain.handle(
    'backup:restore',
    (event): { ok: boolean; message: string } => {
      if (event.sender !== win.webContents) throw new Error('Not allowed.');
      if (chosen === null) {
        return { ok: false, message: 'Choose a backup first.' };
      }
      // Check it again and copy it into the data folder; it is swapped in when Cleave starts again.
      const staged = stageRestore(chosen, dataDir());
      chosen = null;
      if (!staged.ok) return { ok: false, message: staged.error };
      // Let the new copy of Cleave start (it would otherwise find this one still holding the lock).
      app.releaseSingleInstanceLock();
      app.relaunch();
      setTimeout(() => app.quit(), 300);
      return { ok: true, message: 'Restarting Cleave to restore your backup…' };
    },
  );
}
