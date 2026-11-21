// Where downloads are saved and whether to ask each time. Saved to
// download-settings.json. Pure data and functions, so it is easy to test.
import path from 'node:path';

export interface DownloadSettings {
  version: 1;
  // The folder downloads go into, or null for the computer's Downloads folder.
  folder: string | null;
  // Show a save window for every download (off: save straight into the folder).
  askWhere: boolean;
}

export const defaultDownloadSettings = (): DownloadSettings => ({
  version: 1,
  folder: null,
  askWhere: false,
});

// Where files must never be saved on their own: the folders Windows runs programs from at sign-in or
// keeps its own programs in. (A file put in the Startup folder runs the next time you sign in.)
const SYSTEM_FOLDER =
  /^[a-z]:\\(windows|program files|program files \(x86\)|programdata)(\\|$)/;
const STARTUP_FOLDER = /\\start menu\\programs\\startup(\\|$)/;

// Why a folder may not be used for downloads, or null if it may. A plain absolute path on this
// computer, not a system folder and not a Startup folder. A network folder (\\server\share) is only
// taken when you chose it yourself in the folder window (`network`): opening one can make Windows
// send your sign-in details to that server, so a path that arrived any other way (a saved file, a
// backup) is never one. Device paths (\\?\ and \\.\) are never taken.
export function folderProblem(value: unknown, network: boolean): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length >= 1000) {
    return 'not a folder path';
  }
  if (value.includes('\u0000') || !path.isAbsolute(value)) {
    return 'not a plain absolute path';
  }
  const slashes = value.replace(/\//g, '\\');
  if (/^\\\\[?.]\\/.test(slashes)) return 'a device path';
  if (slashes.startsWith('\\\\') && !network) return 'a network folder';
  const lower = path.normalize(value).replace(/\//g, '\\').toLowerCase();
  if (SYSTEM_FOLDER.test(lower) || STARTUP_FOLDER.test(lower)) {
    return 'a system or Startup folder';
  }
  return null;
}

const isFolder = (value: unknown): value is string =>
  folderProblem(value, false) === null;

// A path to a file on this computer that a saved list may name: absolute, with no network or device
// path. (A downloads list read back from disk can say anything; nothing but a local path is opened.)
export function isLocalFilePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length >= 1000) {
    return false;
  }
  if (value.includes('\u0000') || !path.isAbsolute(value)) return false;
  return !/^[\\/]{2}/.test(value);
}

// Turn whatever is on disk into valid settings. Never throws.
export function parseDownloadSettings(raw: unknown): DownloadSettings {
  const settings = defaultDownloadSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const { folder, askWhere } = raw as Record<string, unknown>;
  if (isFolder(folder)) settings.folder = path.normalize(folder);
  if (typeof askWhere === 'boolean') settings.askWhere = askWhere;
  return settings;
}

// Change settings. A new folder is only taken from the folder window (a network folder is allowed
// there, because you chose it); null goes back to the default. Anything else unexpected is ignored.
export function withDownloadSettings(
  settings: DownloadSettings,
  changes: unknown,
): DownloadSettings {
  if (typeof changes !== 'object' || changes === null) return settings;
  const { folder, askWhere } = changes as Record<string, unknown>;
  return {
    ...settings,
    folder:
      folder === null
        ? null
        : folderProblem(folder, true) === null
          ? path.normalize(folder as string)
          : settings.folder,
    askWhere: typeof askWhere === 'boolean' ? askWhere : settings.askWhere,
  };
}
