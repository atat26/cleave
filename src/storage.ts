// Reading and writing the app's save files (spaces.json, chats.json). Uses only
// Node's file system (no Electron), so it can be tested on its own. The file
// location is passed in. Every file is loaded the same careful way: whatever is
// on disk is untrusted data and goes through a `parse` function first.
import {
  mkdirSync,
  promises as fs,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
//
// Every save takes a number when it starts. If a newer save has already landed by the time an older
// one is ready to rename, the older one is dropped, so a slow write can never put old data back over
// newer data (the window closing writes at once, while an earlier write may still be going). Each
// save has its own temporary name, so two never write the same file. A rename that fails for a
// passing reason (an antivirus scan has the file open) is tried again a few times.
let saveCounter = 0;
const landed = new Map<string, number>();
const tempName = (file: string, seq: number) =>
  `${file}.${process.pid}.${seq}.tmp`;
const landedNow = (file: string, seq: number) => {
  const k = key(file);
  if ((landed.get(k) ?? 0) > seq) return false; // a newer save already landed
  landed.set(k, seq);
  return true;
};
const RENAME_TRIES = 4;
const isTransient = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  return code !== undefined && TRANSIENT.has(code);
};

export async function saveJson(file: string, data: unknown): Promise<void> {
  if (unreadable.has(key(file))) return;
  const seq = ++saveCounter;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = tempName(file, seq);
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
    for (let attempt = 1; ; attempt++) {
      if ((landed.get(key(file)) ?? 0) > seq) {
        await fs.rm(temp, { force: true });
        return;
      }
      try {
        // Checked and renamed in the same breath (nothing else can land in between).
        renameSync(temp, file);
        landedNow(file, seq);
        return;
      } catch (error) {
        if (!isTransient(error) || attempt >= RENAME_TRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
      }
    }
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

// Same as saveJson, but blocking.
export function saveJsonSync(file: string, data: unknown): void {
  if (unreadable.has(key(file))) return;
  const seq = ++saveCounter;
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = tempName(file, seq);
  try {
    writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
    for (let attempt = 1; ; attempt++) {
      try {
        renameSync(temp, file);
        landedNow(file, seq);
        return;
      } catch (error) {
        if (!isTransient(error) || attempt >= RENAME_TRIES) throw error;
        // Wait a moment without leaving the thread (this runs while the window closes).
        Atomics.wait(
          new Int32Array(new SharedArrayBuffer(4)),
          0,
          0,
          40 * attempt,
        );
      }
    }
  } catch (error) {
    try {
      rmSync(temp, { force: true });
    } catch {
      // Nothing more to do.
    }
    throw error;
  }
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
//
// A change stays "waiting to be saved" until a write has really worked: a write that fails (a program
// holding the file) is tried again, a little later each time, and the close-time flush writes it.
// flushSync() never throws, so one file that cannot be written does not stop the others from being
// written when the window closes.
const MAX_RETRIES = 8;
export function createSaver<T>(
  file: string,
  getData: () => T,
  delayMs = 500,
  onError: (error: unknown) => void = (error) =>
    console.error(
      `Could not save ${path.basename(file)}: ${(error as Error).message}`,
    ),
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let inFlight = 0;
  let failures = 0;
  let writing: Promise<void> = Promise.resolve();

  const write = () => {
    timer = null;
    if (!dirty) return writing;
    dirty = false;
    const data = getData();
    inFlight++;
    // Chain writes so two never overlap.
    writing = writing
      .then(() => saveJson(file, data))
      .then(
        () => {
          failures = 0;
        },
        (error) => {
          // Still not saved: keep it waiting, and try again soon.
          dirty = true;
          failures++;
          onError(error);
          if (failures <= MAX_RETRIES && timer === null) {
            timer = setTimeout(
              write,
              Math.min(delayMs * 2 ** failures, 10_000),
            );
          }
        },
      )
      .finally(() => {
        inFlight--;
      });
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
    // closing, when an asynchronous write might never get to finish. (If one is
    // still going, the data is written again here, since that write may be cut off.)
    flushSync() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (!dirty && inFlight === 0) return;
      try {
        saveJsonSync(file, getData());
        dirty = false;
      } catch (error) {
        dirty = true;
        onError(error);
      }
    },
  };
}
