// The list of downloads, saved to downloads.json, and the rules around it: what a
// download's state is, how its progress reads, which finished downloads are kept,
// and when one page is starting too many at once. Pure data and functions with no
// Electron, so it is easy to test.

export type DownloadState =
  | 'downloading'
  | 'paused'
  | 'done'
  | 'cancelled'
  // Stopped by an error, or cut off when the app closed.
  | 'failed'
  // Not started: the page tried to download too many files at once.
  | 'blocked';

export const DOWNLOAD_STATES: readonly DownloadState[] = [
  'downloading',
  'paused',
  'done',
  'cancelled',
  'failed',
  'blocked',
];

export interface DownloadItem {
  id: number;
  // Where it came from (the address, without credentials), and the file name.
  url: string;
  name: string;
  // Where it was saved (empty until the place is chosen, or if it never was).
  path: string;
  totalBytes: number;
  receivedBytes: number;
  state: DownloadState;
  startedAt: number;
  endedAt: number | null;
}

export interface DownloadsState {
  version: 1;
  nextId: number;
  // Oldest first.
  items: DownloadItem[];
}

export const MAX_DOWNLOADS = 200;
const MAX_TEXT = 2000;

export const defaultDownloads = (): DownloadsState => ({
  version: 1,
  nextId: 1,
  items: [],
});

const isActive = (state: DownloadState) =>
  state === 'downloading' || state === 'paused';

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

// Turn whatever is on disk into a valid list. A download that was still going when
// the app closed was cut off: it is marked failed. Never throws.
export function parseDownloads(raw: unknown, now: number): DownloadsState {
  const state = defaultDownloads();
  if (typeof raw !== 'object' || raw === null) return state;
  const list = (raw as { items?: unknown }).items;
  if (!Array.isArray(list)) return state;
  const ids = new Set<number>();
  let highest = 0;
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.id !== 'number' ||
      !Number.isInteger(r.id) ||
      r.id < 1 ||
      ids.has(r.id) ||
      typeof r.name !== 'string' ||
      r.name === ''
    ) {
      continue;
    }
    ids.add(r.id);
    highest = Math.max(highest, r.id);
    const saved = DOWNLOAD_STATES.find((s) => s === r.state) ?? 'failed';
    state.items.push({
      id: r.id,
      url: typeof r.url === 'string' ? r.url.slice(0, MAX_TEXT) : '',
      name: r.name.slice(0, 200),
      path: typeof r.path === 'string' ? r.path.slice(0, MAX_TEXT) : '',
      totalBytes: num(r.totalBytes),
      receivedBytes: num(r.receivedBytes),
      state: isActive(saved) ? 'failed' : saved,
      startedAt: num(r.startedAt),
      endedAt: isActive(saved)
        ? now
        : typeof r.endedAt === 'number' && Number.isFinite(r.endedAt)
          ? r.endedAt
          : null,
    });
  }
  state.items = state.items.slice(-MAX_DOWNLOADS);
  const rawNext = (raw as { nextId?: unknown }).nextId;
  state.nextId = Math.max(
    typeof rawNext === 'number' && Number.isInteger(rawNext) ? rawNext : 1,
    highest + 1,
  );
  return state;
}

// Note a new download. The oldest finished ones go if the list is full.
export function addDownload(
  state: DownloadsState,
  download: {
    url: string;
    name: string;
    path: string;
    totalBytes: number;
    state: DownloadState;
  },
  now: number,
): { state: DownloadsState; id: number } {
  const id = state.nextId;
  const item: DownloadItem = {
    id,
    url: download.url.slice(0, MAX_TEXT),
    name: download.name.slice(0, 200),
    path: download.path.slice(0, MAX_TEXT),
    totalBytes: num(download.totalBytes),
    receivedBytes: 0,
    state: download.state,
    startedAt: now,
    endedAt: isActive(download.state) ? null : now,
  };
  let items = [...state.items, item];
  while (items.length > MAX_DOWNLOADS) {
    const old = items.findIndex((i) => !isActive(i.state));
    if (old < 0) break;
    items = items.filter((_, index) => index !== old);
  }
  return { state: { ...state, nextId: id + 1, items }, id };
}

// Change a download: its progress, state, or where it was saved.
export function updateDownload(
  state: DownloadsState,
  id: number,
  changes: Partial<
    Pick<
      DownloadItem,
      'receivedBytes' | 'totalBytes' | 'state' | 'path' | 'name'
    >
  >,
  now: number,
): DownloadsState {
  const found = state.items.find((i) => i.id === id);
  if (!found) return state;
  const next: DownloadItem = {
    ...found,
    ...changes,
    receivedBytes: num(changes.receivedBytes ?? found.receivedBytes),
    totalBytes: num(changes.totalBytes ?? found.totalBytes),
  };
  if (changes.state !== undefined && !isActive(changes.state)) {
    next.endedAt = found.endedAt ?? now;
  }
  return {
    ...state,
    items: state.items.map((i) => (i.id === id ? next : i)),
  };
}

// Take one off the list (the file on disk is not touched).
export function removeDownload(
  state: DownloadsState,
  id: number,
): DownloadsState {
  return state.items.some((i) => i.id === id)
    ? { ...state, items: state.items.filter((i) => i.id !== id) }
    : state;
}

// Clear the finished ones from the list (those still going stay).
export function clearFinished(state: DownloadsState): DownloadsState {
  const items = state.items.filter((i) => isActive(i.state));
  return items.length === state.items.length ? state : { ...state, items };
}

export const activeCount = (state: DownloadsState): number =>
  state.items.filter((i) => isActive(i.state)).length;

// The share downloaded, 0 to 1, or null when the size is not known.
export function progressOf(item: DownloadItem): number | null {
  if (item.state === 'done') return 1;
  return item.totalBytes > 0
    ? Math.min(1, item.receivedBytes / item.totalBytes)
    : null;
}

// "1.5 MB", "820 KB", "12 B".
export function byteText(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const shown = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${shown} ${units[unit]}`;
}

// What a row says about a download: its size and how it stands.
export function statusText(item: DownloadItem): string {
  switch (item.state) {
    case 'done':
      return item.totalBytes > 0 ? byteText(item.totalBytes) : 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return 'Failed';
    case 'blocked':
      return 'Blocked: too many downloads at once';
    case 'paused':
    case 'downloading': {
      const got = byteText(item.receivedBytes);
      const word = item.state === 'paused' ? 'Paused · ' : '';
      return item.totalBytes > 0
        ? `${word}${got} of ${byteText(item.totalBytes)}`
        : `${word}${got}`;
    }
  }
}

// ---- A page starting too many downloads at once -----------------------------------

// A page may start this many downloads within this long; more are blocked.
export const FLOOD_LIMIT = 3;
export const FLOOD_WINDOW_MS = 3000;

// Given when this page's earlier downloads started, may another start now? Returns
// whether it may, and the list to remember (old entries dropped).
export function floodCheck(
  starts: readonly number[],
  now: number,
): { allowed: boolean; starts: number[] } {
  const recent = starts.filter((t) => now - t < FLOOD_WINDOW_MS);
  if (recent.length >= FLOOD_LIMIT) return { allowed: false, starts: recent };
  return { allowed: true, starts: [...recent, now] };
}
