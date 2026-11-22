// Writes unexpected errors of the main process to errors.log in the data folder (see errorLog.ts) in
// the installed app, instead of showing Electron's error dialog. A development copy keeps the dialog:
// there, an error should be loud.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isInstalledApp } from './devEnv';
import {
  describeError,
  isDestroyedError,
  MAX_LOG_CHARS,
  trimLog,
} from './errorLog';

export function installErrorGuard(): void {
  if (!isInstalledApp()) return;
  const write = (kind: string, error: unknown) => {
    try {
      const file = path.join(app.getPath('userData'), 'errors.log');
      let old = '';
      try {
        old = fs.readFileSync(file, 'utf8');
      } catch {
        // No log yet.
      }
      fs.writeFileSync(
        file,
        trimLog(old + describeError(kind, error, Date.now()), MAX_LOG_CHARS),
        'utf8',
      );
    } catch {
      // Writing the log must never be a new error.
    }
  };
  process.on('uncaughtException', (error) =>
    write(
      isDestroyedError(error)
        ? 'a window or page was already gone (harmless)'
        : 'uncaught error',
      error,
    ),
  );
  process.on('unhandledRejection', (reason) =>
    write('unhandled promise rejection', reason),
  );
}
