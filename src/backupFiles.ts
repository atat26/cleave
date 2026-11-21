// The file work of backup and restore (no Electron, so it is tested with real folders). The rules
// (which files, what backup.json looks like) are in backupFormat.ts.
//
// Everything here is synchronous on purpose: the data is a few megabytes, and a restore runs at
// startup before anything else uses the files. Files are read whole and then written, so a file the
// app is saving at that moment is only held open for an instant.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_FILES,
  KEYS_FILE,
  MANIFEST_FILE,
  UPLOADS_DIR,
  autoFolderName,
  autoNamesToDelete,
  beforeRestoreFolderName,
  isUploadName,
  parseManifest,
  snapshotIsDue,
  sortAutoNames,
} from './backupFormat.ts';
import type { BackupEntry, BackupManifest } from './backupFormat.ts';

export const PENDING_RESTORE_DIR = 'restore-pending';
export const AUTO_BACKUPS_DIR = 'backups';
export const RESTORE_RESULT_FILE = 'restore-result.json';
const MAX_MANIFEST_BYTES = 2_000_000;

const sha256 = (buffer: Buffer): string =>
  crypto.createHash('sha256').update(buffer).digest('hex');

// A file that exists and is a plain file (not a folder, not a link).
const isPlainFile = (file: string): boolean => {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
};

// The uploaded files in a data folder: only names an upload can have.
const listUploads = (dataDir: string): string[] => {
  const dir = path.join(dataDir, UPLOADS_DIR);
  try {
    return fs
      .readdirSync(dir)
      .filter(
        (name) => isUploadName(name) && isPlainFile(path.join(dir, name)),
      );
  } catch {
    return [];
  }
};

// A folder name that is not taken yet: "name", then "name (2)", "name (3)"...
function freeFolder(parent: string, name: string): string {
  let candidate = path.join(parent, name);
  for (let n = 2; fs.existsSync(candidate); n++) {
    candidate = path.join(parent, `${name} (${n})`);
  }
  return candidate;
}

// A path inside `root` for a backup name such as "chats.json" or "uploads/12.png".
const inside = (root: string, name: string): string =>
  path.join(root, ...name.split('/'));

// ---- Making a backup ------------------------------------------------------------------------

export function createBackup(options: {
  dataDir: string;
  // The folder the backup folder is made in.
  parentDir: string;
  folderName: string;
  appVersion: string;
  includeKeys: boolean;
  now: Date;
}): { folder: string; manifest: BackupManifest } {
  const folder = freeFolder(options.parentDir, options.folderName);
  fs.mkdirSync(folder, { recursive: true });
  const files: BackupEntry[] = [];

  const add = (name: string, source: string) => {
    if (!isPlainFile(source)) return;
    const data = fs.readFileSync(source);
    const target = inside(folder, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    files.push({ name, size: data.length, sha256: sha256(data) });
  };

  const names = options.includeKeys ? [...DATA_FILES, KEYS_FILE] : DATA_FILES;
  for (const name of names) add(name, path.join(options.dataDir, name));
  for (const name of listUploads(options.dataDir)) {
    add(
      `${UPLOADS_DIR}/${name}`,
      path.join(options.dataDir, UPLOADS_DIR, name),
    );
  }

  // The list of contents is written last: a backup that was cut short has none, so it is refused.
  const manifest: BackupManifest = {
    app: 'Cleave',
    format: 1,
    appVersion: options.appVersion,
    createdAt: options.now.toISOString(),
    includesKeys: options.includeKeys,
    files,
  };
  fs.writeFileSync(
    path.join(folder, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  return { folder, manifest };
}

// ---- Checking a backup ----------------------------------------------------------------------

// One file of a backup, read and checked against its size and checksum. Throws if anything is off.
function readChecked(folder: string, entry: BackupEntry): Buffer {
  const file = inside(folder, entry.name);
  if (!isPlainFile(file)) {
    throw new Error(`The backup is incomplete: ${entry.name} is missing.`);
  }
  // The size on disk is checked before anything is read, so a huge file is never loaded.
  if (fs.lstatSync(file).size !== entry.size) {
    throw new Error(
      `The backup is damaged: ${entry.name} does not match its checksum.`,
    );
  }
  const data = fs.readFileSync(file);
  if (data.length !== entry.size || sha256(data) !== entry.sha256) {
    throw new Error(
      `The backup is damaged: ${entry.name} does not match its checksum.`,
    );
  }
  return data;
}

export type VerifyResult =
  | { ok: true; manifest: BackupManifest }
  | { ok: false; error: string };

// Is this folder a whole, undamaged Cleave backup?
export function verifyBackup(folder: string): VerifyResult {
  const manifestFile = path.join(folder, MANIFEST_FILE);
  let text: string;
  try {
    if (!isPlainFile(manifestFile)) {
      return {
        ok: false,
        error: 'This folder is not a Cleave backup (it has no backup.json).',
      };
    }
    if (fs.statSync(manifestFile).size > MAX_MANIFEST_BYTES) {
      return { ok: false, error: 'This backup’s list of files is damaged.' };
    }
    text = fs.readFileSync(manifestFile, 'utf8');
  } catch {
    return { ok: false, error: 'This backup could not be read.' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This backup’s list of files is damaged.' };
  }
  const parsed = parseManifest(raw);
  if (!parsed.ok) return parsed;
  try {
    for (const entry of parsed.manifest.files) readChecked(folder, entry);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  return { ok: true, manifest: parsed.manifest };
}

// ---- Restoring ------------------------------------------------------------------------------
// A restore is two steps. Staging (while Cleave runs): the backup is checked and copied into the data
// folder, so it no longer matters if the drive it was on is unplugged. Applying (the next time Cleave
// starts, before anything reads the files): your current data is copied to a "before-restore" folder,
// then the files are swapped. Cleave cannot swap them while it runs, because it would save over them.

export function stageRestore(
  backupFolder: string,
  dataDir: string,
): VerifyResult {
  const checked = verifyBackup(backupFolder);
  if (!checked.ok) return checked;
  const pending = path.join(dataDir, PENDING_RESTORE_DIR);
  try {
    fs.rmSync(pending, { recursive: true, force: true });
    fs.mkdirSync(pending, { recursive: true });
    for (const entry of checked.manifest.files) {
      const data = readChecked(backupFolder, entry);
      const target = inside(pending, entry.name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }
    fs.writeFileSync(
      path.join(pending, MANIFEST_FILE),
      JSON.stringify(checked.manifest, null, 2),
      'utf8',
    );
  } catch (error) {
    fs.rmSync(pending, { recursive: true, force: true });
    return { ok: false, error: (error as Error).message };
  }
  return checked;
}

export type RestoreResult =
  | { applied: true; safetyFolder: string; files: number; madeAt: string }
  | { applied: false; error: string };

type SavedRestoreResult =
  | {
      ok: true;
      at: string;
      madeAt: string;
      safetyFolder: string;
      files: number;
    }
  | { ok: false; at: string; error: string };

const writeRestoreResult = (dataDir: string, result: SavedRestoreResult) => {
  try {
    fs.writeFileSync(
      path.join(dataDir, RESTORE_RESULT_FILE),
      JSON.stringify(result, null, 2),
      'utf8',
    );
  } catch {
    // Only a note for the Settings page.
  }
};

// What the last restore did, for Settings (null if there never was one).
export function readRestoreResult(dataDir: string): SavedRestoreResult | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(dataDir, RESTORE_RESULT_FILE), 'utf8'),
    ) as Record<string, unknown>;
    if (typeof raw.at !== 'string') return null;
    if (raw.ok === true && typeof raw.safetyFolder === 'string') {
      return {
        ok: true,
        at: raw.at,
        madeAt: typeof raw.madeAt === 'string' ? raw.madeAt : '',
        safetyFolder: raw.safetyFolder,
        files: typeof raw.files === 'number' ? raw.files : 0,
      };
    }
    if (raw.ok === false && typeof raw.error === 'string') {
      return { ok: false, at: raw.at, error: raw.error };
    }
  } catch {
    // No note, or not readable.
  }
  return null;
}

// Run at startup, before any file is read. Returns null if no restore is waiting.
export function applyPendingRestore(
  dataDir: string,
  now: Date,
): RestoreResult | null {
  const pending = path.join(dataDir, PENDING_RESTORE_DIR);
  if (!fs.existsSync(pending)) return null;

  const fail = (error: string): RestoreResult => {
    fs.rmSync(pending, { recursive: true, force: true });
    writeRestoreResult(dataDir, { ok: false, at: now.toISOString(), error });
    return { applied: false, error };
  };

  const checked = verifyBackup(pending);
  if (!checked.ok) return fail(checked.error);
  const manifest = checked.manifest;
  const byName = new Map(manifest.files.map((e) => [e.name, e]));
  const scope = manifest.includesKeys ? [...DATA_FILES, KEYS_FILE] : DATA_FILES;

  // 1. Keep a copy of what is there now.
  const safety = freeFolder(dataDir, beforeRestoreFolderName(now));
  const safetyUploads = path.join(safety, UPLOADS_DIR);
  try {
    fs.mkdirSync(safetyUploads, { recursive: true });
    for (const name of scope) {
      const source = path.join(dataDir, name);
      if (isPlainFile(source)) fs.copyFileSync(source, path.join(safety, name));
    }
    for (const name of listUploads(dataDir)) {
      fs.copyFileSync(
        path.join(dataDir, UPLOADS_DIR, name),
        path.join(safetyUploads, name),
      );
    }
  } catch (error) {
    return fail(
      `Could not keep a copy of your current data, so nothing was changed. (${(error as Error).message})`,
    );
  }

  const removeUploads = () => {
    for (const name of listUploads(dataDir)) {
      fs.rmSync(path.join(dataDir, UPLOADS_DIR, name), { force: true });
    }
  };

  // 2. Swap the files in.
  try {
    for (const name of scope) {
      const target = path.join(dataDir, name);
      const entry = byName.get(name);
      if (entry) {
        const data = readChecked(pending, entry);
        const temp = `${target}.restoring`;
        fs.writeFileSync(temp, data);
        fs.renameSync(temp, target);
      } else {
        fs.rmSync(target, { force: true });
      }
    }
    removeUploads();
    fs.mkdirSync(path.join(dataDir, UPLOADS_DIR), { recursive: true });
    for (const entry of manifest.files) {
      if (!entry.name.startsWith(`${UPLOADS_DIR}/`)) continue;
      fs.writeFileSync(
        inside(dataDir, entry.name),
        readChecked(pending, entry),
      );
    }
  } catch (error) {
    // Put everything back the way it was.
    try {
      for (const name of scope) {
        const target = path.join(dataDir, name);
        const kept = path.join(safety, name);
        if (isPlainFile(kept)) fs.copyFileSync(kept, target);
        else fs.rmSync(target, { force: true });
      }
      removeUploads();
      fs.mkdirSync(path.join(dataDir, UPLOADS_DIR), { recursive: true });
      for (const name of fs.readdirSync(safetyUploads)) {
        fs.copyFileSync(
          path.join(safetyUploads, name),
          path.join(dataDir, UPLOADS_DIR, name),
        );
      }
    } catch {
      // The copy in the before-restore folder is still whole.
    }
    return fail(
      `The restore stopped and your data was put back. (${(error as Error).message})`,
    );
  }

  fs.rmSync(pending, { recursive: true, force: true });
  const files = manifest.files.length;
  writeRestoreResult(dataDir, {
    ok: true,
    at: now.toISOString(),
    madeAt: manifest.createdAt,
    safetyFolder: path.basename(safety),
    files,
  });
  return {
    applied: true,
    safetyFolder: path.basename(safety),
    files,
    madeAt: manifest.createdAt,
  };
}

// ---- Copies made by Cleave itself -----------------------------------------------------------

export const KEEP_AUTO_COPIES = 3;

export function listAutoSnapshots(dataDir: string): string[] {
  try {
    return sortAutoNames(fs.readdirSync(path.join(dataDir, AUTO_BACKUPS_DIR)));
  } catch {
    return [];
  }
}

// A copy of the data (no keys) in <data folder>\backups, keeping only the newest few.
export function autoSnapshot(options: {
  dataDir: string;
  appVersion: string;
  now: Date;
  keep?: number;
}): string {
  const parent = path.join(options.dataDir, AUTO_BACKUPS_DIR);
  fs.mkdirSync(parent, { recursive: true });
  const name = autoFolderName(options.now);
  // Two in the same second would be the same copy.
  if (!fs.existsSync(path.join(parent, name))) {
    createBackup({
      dataDir: options.dataDir,
      parentDir: parent,
      folderName: name,
      appVersion: options.appVersion,
      includeKeys: false,
      now: options.now,
    });
  }
  for (const old of autoNamesToDelete(
    fs.readdirSync(parent),
    options.keep ?? KEEP_AUTO_COPIES,
  )) {
    fs.rmSync(path.join(parent, old), { recursive: true, force: true });
  }
  return path.join(parent, name);
}

// Make an automatic copy unless one was made very recently. Returns the folder, or null if skipped.
export function snapshotIfDue(options: {
  dataDir: string;
  appVersion: string;
  now: Date;
  minGapMs: number;
}): string | null {
  const names = listAutoSnapshots(options.dataDir);
  if (!snapshotIsDue(names, options.now, options.minGapMs)) return null;
  return autoSnapshot(options);
}
