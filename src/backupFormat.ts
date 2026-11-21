// The rules of backup and restore, kept apart from the file work so they can be tested: which files a
// backup holds, what its list of contents (backup.json) must look like, and how its folder is named.
//
// A backup is a plain folder: the data files, an "uploads" folder, and backup.json, which lists every
// file with its size and a checksum (SHA-256). A restore only accepts files named on the lists below,
// whatever the folder holds, so a folder with odd names or paths in it cannot write anywhere else.

export const BACKUP_APP = 'Cleave';
export const BACKUP_FORMAT = 1;
export const MANIFEST_FILE = 'backup.json';
export const UPLOADS_DIR = 'uploads';

// The data files: Spaces, chats, artifacts, bookmarks, history, settings. (Left out on purpose:
// extensions.json, because extensions are not part of a backup; pipeline-trace.jsonl, a developer log.)
export const DATA_FILES: readonly string[] = [
  'agent-visuals.json',
  'artifacts.json',
  'bookmarks.json',
  'chats.json',
  'closed-tabs.json',
  'deleted-spaces.json',
  'download-settings.json',
  'downloads.json',
  'extension-settings.json',
  'favicons.json',
  'history.json',
  'library.json',
  'llm.json',
  'naming.json',
  'new-tab.json',
  'permissions.json',
  'search-engine.json',
  'search.json',
  'skills.json',
  'sleep-settings.json',
  'spaces.json',
  'theme.json',
  'tools.json',
  'zoom.json',
];

// The saved API keys: encrypted for this Windows account. Only in a backup when asked for.
export const KEYS_FILE = 'secrets.json';

// An uploaded file is saved as "<artifact number>.<extension>".
export const isUploadName = (name: string): boolean =>
  /^\d{1,12}\.[A-Za-z0-9]{1,12}$/.test(name);

export type BackupEntry = { name: string; size: number; sha256: string };

export type BackupManifest = {
  app: typeof BACKUP_APP;
  format: number;
  appVersion: string;
  // When it was made (ISO time).
  createdAt: string;
  includesKeys: boolean;
  files: BackupEntry[];
};

// May a backup with this setting hold a file of this name? (Names use "/": "uploads/12.png".)
export function isBackupName(name: string, includesKeys: boolean): boolean {
  if (DATA_FILES.includes(name)) return true;
  if (includesKeys && name === KEYS_FILE) return true;
  if (name.startsWith(`${UPLOADS_DIR}/`)) {
    return isUploadName(name.slice(UPLOADS_DIR.length + 1));
  }
  return false;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type ManifestResult =
  | { ok: true; manifest: BackupManifest }
  | { ok: false; error: string };

// Reads backup.json, refusing anything that is not exactly what Cleave writes.
export function parseManifest(raw: unknown): ManifestResult {
  const bad = (error: string): ManifestResult => ({ ok: false, error });
  if (!isObject(raw) || raw.app !== BACKUP_APP) {
    return bad('This folder is not a Cleave backup.');
  }
  if (typeof raw.format !== 'number' || !Number.isInteger(raw.format)) {
    return bad('This backup’s list of files is damaged.');
  }
  if (raw.format > BACKUP_FORMAT) {
    return bad(
      'This backup was made by a newer version of Cleave. Update Cleave first, then try again.',
    );
  }
  if (raw.format < 1) return bad('This backup’s list of files is damaged.');
  if (
    typeof raw.appVersion !== 'string' ||
    typeof raw.createdAt !== 'string' ||
    Number.isNaN(Date.parse(raw.createdAt)) ||
    typeof raw.includesKeys !== 'boolean' ||
    !Array.isArray(raw.files)
  ) {
    return bad('This backup’s list of files is damaged.');
  }
  const seen = new Set<string>();
  const files: BackupEntry[] = [];
  for (const entry of raw.files) {
    if (
      !isObject(entry) ||
      typeof entry.name !== 'string' ||
      typeof entry.size !== 'number' ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      typeof entry.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) {
      return bad('This backup’s list of files is damaged.');
    }
    if (!isBackupName(entry.name, raw.includesKeys)) {
      return bad(
        `This backup holds a file Cleave does not recognise (${shorten(entry.name)}), so it was not used.`,
      );
    }
    if (seen.has(entry.name)) {
      return bad('This backup’s list of files is damaged.');
    }
    seen.add(entry.name);
    files.push({ name: entry.name, size: entry.size, sha256: entry.sha256 });
  }
  return {
    ok: true,
    manifest: {
      app: BACKUP_APP,
      format: raw.format,
      appVersion: raw.appVersion.slice(0, 40),
      createdAt: new Date(raw.createdAt).toISOString(),
      includesKeys: raw.includesKeys,
      files,
    },
  };
}

const shorten = (text: string): string =>
  text.length > 40 ? `${text.slice(0, 39)}…` : text;

export type BackupSummary = {
  createdAt: string;
  appVersion: string;
  files: number;
  uploads: number;
  bytes: number;
  includesKeys: boolean;
};

export function summarizeBackup(manifest: BackupManifest): BackupSummary {
  const uploads = manifest.files.filter((f) =>
    f.name.startsWith(`${UPLOADS_DIR}/`),
  ).length;
  return {
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    files: manifest.files.length - uploads,
    uploads,
    bytes: manifest.files.reduce((sum, f) => sum + f.size, 0),
    includesKeys: manifest.includesKeys,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const two = (n: number) => String(n).padStart(2, '0');
const datePart = (d: Date) =>
  `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

// "Cleave backup 2026-11-20 16-30" (local time; no characters Windows does not allow in a name).
export const backupFolderName = (now: Date): string =>
  `Cleave backup ${datePart(now)} ${two(now.getHours())}-${two(now.getMinutes())}`;

// The copies Cleave makes by itself before an update: "auto 2026-11-20 16-30-05".
export const autoFolderName = (now: Date): string =>
  `auto ${datePart(now)} ${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`;

// The copy of your data made just before a restore replaces it.
export const beforeRestoreFolderName = (now: Date): string =>
  `before-restore ${datePart(now)} ${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`;

const AUTO_NAME = /^auto (\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})$/;

// The time an automatic copy was made, from its name (null if the name is not one of ours).
export function autoFolderTime(name: string): Date | null {
  const m = AUTO_NAME.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

// Newest first; names that are not automatic copies are ignored.
export const sortAutoNames = (names: string[]): string[] =>
  names
    .filter((n) => AUTO_NAME.test(n))
    .sort()
    .reverse();

// Which automatic copies to delete so only the newest `keep` remain.
export const autoNamesToDelete = (names: string[], keep: number): string[] =>
  sortAutoNames(names).slice(Math.max(0, keep));

// Is the newest automatic copy older than `minGapMs` (or is there none)? Used so an update does not
// push out the older copies by making several in a row.
export function snapshotIsDue(
  names: string[],
  now: Date,
  minGapMs: number,
): boolean {
  const newest = sortAutoNames(names)[0];
  if (newest === undefined) return true;
  const at = autoFolderTime(newest);
  if (at === null) return true;
  return now.getTime() - at.getTime() >= minGapMs;
}
