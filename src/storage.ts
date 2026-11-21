// Reading and writing the app's save files (spaces.json, chats.json). Uses only
// Node's file system (no Electron), so it can be tested on its own. The file
// location is passed in. Every file is loaded the same careful way: whatever is
// on disk is untrusted data and goes through a `parse` function first.
import { mkdirSync, promises as fs, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultArtifacts, parseArtifacts } from './artifacts.ts';
import type { ArtifactsState } from './artifacts.ts';
import { parseChats } from './chats.ts';
import type { ChatsState } from './chats.ts';
import { defaultState, parseState } from './model.ts';
import type { SavedState } from './model.ts';

// Files that are there but could not be read (a program holding them, a permission problem), or that
// could not be moved aside when they were broken. The app starts with empty data for them, and must
// not then save that empty data over the real file, which is still whole on disk: so a file in this
// list is never written during this run. The next start reads it normally.
const unreadable = new Set<string>();
const key = (file: string) => path.resolve(file);

export const isUnreadable = (file: string): boolean =>
  unreadable.has(key(file));
// (For tests.)
export const forgetUnreadable = (): void => unreadable.clear();

// Errors that usually pass in a moment (an antivirus scan or a backup program has the file open).
const TRANSIENT = new Set([
  'EBUSY',
  'EPERM',
  'EACCES',
  'EAGAIN',
  'EMFILE',
  'ENFILE',
  'ETXTBSY',
]);

interface LoadOptions {
  // How the text is read (a test replaces it), how many more times to try after a passing error, and
  // how long to wait between tries.
  read?: (file: string) => Promise<string>;
  retries?: number;
  delayMs?: number;
}

// Load a save file. A missing file gives `fresh()`. A file that is not valid
// JSON is moved aside (to "<file>.corrupt") so it is not lost, and we start
// fresh. Valid JSON goes through `parse`, which repairs anything wrong. A file
// that cannot be read for any other reason is tried a few more times and then
// left alone: `fresh()` is used for this run and the file is never overwritten
// (see `unreadable`). This never throws.
export async function loadJson<T>(
  file: string,
  parse: (raw: unknown) => T,
  fresh: () => T,
  options: LoadOptions = {},
): Promise<T> {
  const read = options.read ?? ((f: string) => fs.readFile(f, 'utf8'));
  const retries = options.retries ?? 5;
  const delayMs = options.delayMs ?? 200;
  let text: string | null = null;
  for (let attempt = 0; text === null; attempt++) {
    try {
      text = await read(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Not there yet: a new start, nothing to protect.
      if (code === 'ENOENT') return fresh();
      if (code !== undefined && TRANSIENT.has(code) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      unreadable.add(key(file));
      console.error(
        `Could not read ${path.basename(file)} (${code ?? 'unknown error'}): starting without it and leaving the file as it is.`,
      );
      return fresh();
    }
  }
  try {
    return parse(JSON.parse(text));
  } catch {
    try {
      await fs.rename(file, `${file}.corrupt`);
    } catch {
      // It could not be moved aside, so it must not be written over either.
      unreadable.add(key(file));
    }
    return fresh();
  }
}

// Save atomically: write a temporary file, then rename it over the real one,
// so a crash in the middle can never leave a half-written file. (Not for a
// file that could not be read at start: see `unreadable`.)
export async function saveJson(file: string, data: unknown): Promise<void> {
  if (unreadable.has(key(file))) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temp, file);
}

// Same as saveJson, but blocking.
export function saveJsonSync(file: string, data: unknown): void {
  if (unreadable.has(key(file))) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(temp, file);
}

// The two save files:
export const loadState = (file: string): Promise<SavedState> =>
  loadJson(file, parseState, defaultState);
export const saveState = saveJson;
export const saveStateSync = saveJsonSync;
export const loadChats = (file: string): Promise<ChatsState> =>
  loadJson(
    file,
    (raw) => parseChats(raw),
    () => parseChats(null),
  );

export const loadArtifacts = (file: string): Promise<ArtifactsState> =>
  loadJson(file, parseArtifacts, defaultArtifacts);

// Saves a little after the last change, so a burst of changes is one write.
// flush() writes right away (use it when the app is quitting).
export function createSaver<T>(file: string, getData: () => T, delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let writing: Promise<void> = Promise.resolve();

  const write = () => {
    timer = null;
    if (!dirty) return writing;
    dirty = false;
    const data = getData();
    // Chain writes so two never overlap.
    writing = writing.then(() => saveJson(file, data)).catch(() => undefined);
    return writing;
  };

  return {
    schedule() {
      dirty = true;
      if (timer === null) timer = setTimeout(write, delayMs);
    },
    async flush() {
      if (timer !== null) clearTimeout(timer);
      await write();
      await writing;
    },
    // Write right now and wait for nothing: for the moment the window is
    // closing, when an asynchronous write might never get to finish.
    flushSync() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (!dirty) return;
      dirty = false;
      saveJsonSync(file, getData());
    },
  };
}
