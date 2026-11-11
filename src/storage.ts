// Reading and writing spaces.json. Uses only Node's file system (no Electron),
// so it can be tested on its own. The file location is passed in.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defaultState, parseState } from './model.ts';
import type { SavedState } from './model.ts';

// Load the saved state. A missing file gives a fresh default state. A file that
// is not valid JSON is moved aside (to "<file>.corrupt") so it is not lost, and
// we start fresh. This never throws.
export async function loadState(file: string): Promise<SavedState> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return defaultState();
  }
  try {
    return parseState(JSON.parse(text));
  } catch {
    try {
      await fs.rename(file, `${file}.corrupt`);
    } catch {
      // Best effort only.
    }
    return defaultState();
  }
}

// Save atomically: write a temporary file, then rename it over the real one,
// so a crash in the middle can never leave a half-written spaces.json.
export async function saveState(
  file: string,
  state: SavedState,
): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(temp, file);
}

// Saves a little after the last change, so a burst of changes is one write.
// flush() writes right away (use it when the app is quitting).
export function createSaver(
  file: string,
  getState: () => SavedState,
  delayMs = 500,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let writing: Promise<void> = Promise.resolve();

  const write = () => {
    timer = null;
    if (!dirty) return writing;
    dirty = false;
    const state = getState();
    // Chain writes so two never overlap.
    writing = writing.then(() => saveState(file, state)).catch(() => undefined);
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
  };
}
