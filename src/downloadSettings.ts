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

// A folder path is only taken if it is a plain absolute path.
const isFolder = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length < 1000 &&
  !value.includes('\u0000') &&
  path.isAbsolute(value);

// Turn whatever is on disk into valid settings. Never throws.
export function parseDownloadSettings(raw: unknown): DownloadSettings {
  const settings = defaultDownloadSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const { folder, askWhere } = raw as Record<string, unknown>;
  if (isFolder(folder)) settings.folder = path.normalize(folder);
  if (typeof askWhere === 'boolean') settings.askWhere = askWhere;
  return settings;
}

// Change settings; a folder that is not an absolute path (or null to go back to the
// default) and anything else unexpected is ignored.
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
        : isFolder(folder)
          ? path.normalize(folder)
          : settings.folder,
    askWhere: typeof askWhere === 'boolean' ? askWhere : settings.askWhere,
  };
}
