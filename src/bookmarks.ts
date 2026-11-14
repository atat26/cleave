// Bookmarks: the pages you marked as important, a flat list saved to
// bookmarks.json. Pure data and functions with no Electron, so it is easy to test.
//
// Only ordinary web pages can be bookmarked (the same rule as history), with any
// username, password and "#" part of the address removed. A page is bookmarked
// once: bookmarking it again does nothing.
import { historyUrl } from './history.ts';

export interface Bookmark {
  id: number;
  url: string;
  title: string;
  addedAt: number;
}

export interface BookmarksState {
  version: 1;
  nextId: number;
  // Oldest first.
  items: Bookmark[];
}

export const MAX_BOOKMARKS = 5000;
const MAX_TITLE = 200;

export const defaultBookmarks = (): BookmarksState => ({
  version: 1,
  nextId: 1,
  items: [],
});

const cleanTitle = (title: unknown): string =>
  typeof title === 'string'
    ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
    : '';

// Turn whatever is on disk into valid bookmarks. Never throws.
export function parseBookmarks(raw: unknown): BookmarksState {
  const state = defaultBookmarks();
  if (typeof raw !== 'object' || raw === null) return state;
  const list = (raw as { items?: unknown }).items;
  if (!Array.isArray(list)) return state;
  const ids = new Set<number>();
  const urls = new Set<string>();
  let highest = 0;
  for (const item of list) {
    if (state.items.length >= MAX_BOOKMARKS) break;
    if (typeof item !== 'object' || item === null) continue;
    const { id, url, title, addedAt } = item as Record<string, unknown>;
    const kept = historyUrl(url);
    if (
      kept === null ||
      typeof id !== 'number' ||
      !Number.isInteger(id) ||
      id < 1 ||
      ids.has(id) ||
      urls.has(kept)
    ) {
      continue;
    }
    ids.add(id);
    urls.add(kept);
    highest = Math.max(highest, id);
    state.items.push({
      id,
      url: kept,
      title: cleanTitle(title),
      addedAt:
        typeof addedAt === 'number' && Number.isFinite(addedAt) ? addedAt : 0,
    });
  }
  const rawNext = (raw as { nextId?: unknown }).nextId;
  state.nextId = Math.max(
    typeof rawNext === 'number' && Number.isInteger(rawNext) ? rawNext : 1,
    highest + 1,
  );
  return state;
}

export function isBookmarked(state: BookmarksState, url: unknown): boolean {
  const kept = historyUrl(url);
  return kept !== null && state.items.some((b) => b.url === kept);
}

// Bookmark a page. Nothing changes if it is not a web page, is already bookmarked,
// or the list is full.
export function addBookmark(
  state: BookmarksState,
  url: unknown,
  title: unknown,
  now: number,
): BookmarksState {
  const kept = historyUrl(url);
  if (kept === null || state.items.length >= MAX_BOOKMARKS) return state;
  if (state.items.some((b) => b.url === kept)) return state;
  return {
    ...state,
    nextId: state.nextId + 1,
    items: [
      ...state.items,
      { id: state.nextId, url: kept, title: cleanTitle(title), addedAt: now },
    ],
  };
}

export function removeBookmarkByUrl(
  state: BookmarksState,
  url: unknown,
): BookmarksState {
  const kept = historyUrl(url);
  if (kept === null || !state.items.some((b) => b.url === kept)) return state;
  return { ...state, items: state.items.filter((b) => b.url !== kept) };
}

export function removeBookmark(
  state: BookmarksState,
  id: number,
): BookmarksState {
  return state.items.some((b) => b.id === id)
    ? { ...state, items: state.items.filter((b) => b.id !== id) }
    : state;
}

// The bookmarks that match every word you typed (in the title or the address),
// newest first, at most `limit`.
export function searchBookmarks(
  state: BookmarksState,
  query: string,
  limit = 300,
): Bookmark[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found: Bookmark[] = [];
  for (let i = state.items.length - 1; i >= 0 && found.length < limit; i--) {
    const item = state.items[i];
    const text = `${item.title} ${item.url}`.toLowerCase();
    if (words.every((word) => text.includes(word))) found.push(item);
  }
  return found;
}
