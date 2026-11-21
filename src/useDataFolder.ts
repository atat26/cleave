// Imported first by main.ts, so the data folder is chosen before anything reads it.
import { app } from 'electron';
import { dataFolderPath } from './dataFolder';
import { refusesDebugging } from './debugSwitch';

// The installed app does not open Chromium's remote debugging port for the folder it keeps your data in:
// whatever connects to that port could drive every page and Cleave's own interface. (Testing an
// installed build on a separate folder, with --user-data-dir, is still possible.)
if (
  refusesDebugging({
    installed: app.isPackaged,
    debugPort: app.commandLine.hasSwitch('remote-debugging-port'),
    debugPipe: app.commandLine.hasSwitch('remote-debugging-pipe'),
    ownFolder: app.commandLine.hasSwitch('user-data-dir'),
  })
) {
  app.exit(1);
}

// Starting with --user-data-dir=<folder> uses that folder instead (a test run can use a throwaway
// folder, and never touch the data of the installed app).
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath(
    'userData',
    dataFolderPath(app.getPath('appData'), app.isPackaged),
  );
}
