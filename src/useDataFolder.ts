// Imported first by main.ts, so the data folder is chosen before anything reads it.
import { app } from 'electron';
import { dataFolderPath } from './dataFolder';

// Starting with --user-data-dir=<folder> uses that folder instead (a test run can use a throwaway
// folder, and never touch the data of the installed app).
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath(
    'userData',
    dataFolderPath(app.getPath('appData'), app.isPackaged),
  );
}
