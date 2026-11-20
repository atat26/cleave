// Which folder holds the app's data (chats, Spaces, history, the saved key...).
//
// The installed app (Cleave) and a copy started from the project folder while developing or testing
// must never share one, or a test run could change your real data. So the installed app uses
// "Cleave" and everything else keeps the folder the test copy has always used ("ai-browser"). The
// two folders also make the two copies independent of each other: both can be open at once.
import path from 'node:path';

export const INSTALLED_DATA_FOLDER = 'Cleave';
export const DEV_DATA_FOLDER = 'ai-browser';

export const dataFolderName = (packaged: boolean): string =>
  packaged ? INSTALLED_DATA_FOLDER : DEV_DATA_FOLDER;

// The full path, inside the folder Windows keeps app data in (AppData\Roaming).
export const dataFolderPath = (appDataDir: string, packaged: boolean): string =>
  path.join(appDataDir, dataFolderName(packaged));
