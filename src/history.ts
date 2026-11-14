// Browsing history: the pages you have visited, newest last, saved to history.json.
// Pure data and functions with no Electron, so it is easy to test.
//
// Only ordinary web pages are kept (http and https), with any username, password
// and "#" part of the address removed. Visiting the same page again soon after
// (a reload, or a page that redirects to itself) updates its entry instead of
// adding another. The list is trimmed to the last 90 days and 10,000 entries.

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  visitedAt: number;
}

export interface HistoryState {
  version: 1;
  nextId: number;
  // Oldest first.
  entries: HistoryEntry[];
}

export const MAX_HISTORY_ENTRIES = 10_000;
export const MAX_HISTORY_DAYS = 90;
// The same page twice within this long counts as one visit.
export const SAME_VISIT_MS = 30 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const MAX_URL = 2000;
const MAX_TITLE = 200;

export const defaultHistory = (): HistoryState => ({
  version: 1,
  nextId: 1,
  entries: [],
});

// The address as it is kept, or null if it is not an ordinary web page.
export function historyUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > MAX_URL) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    const kept = parsed.toString();
    return kept.length > MAX_URL ? null : kept;
  } catch {
    return null;
  }
}

const cleanTitle = (title: unknown): string =>
  typeof title === 'string'
    ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
    : '';

// Drop what is too old, and the oldest beyond the limit.
export function pruneHistory(state: HistoryState, now: number): HistoryState {
  const oldest = now - MAX_HISTORY_DAYS * DAY_MS;
  let entries = state.entries.filter((e) => e.visitedAt >= oldest);
  if (entries.length > MAX_HISTORY_ENTRIES) {
    entries = entries.slice(entries.length - MAX_HISTORY_ENTRIES);
  }
  return entries.length === state.entries.length
    ? state
    : { ...state, entries };
}

// Turn whatever is on disk into a valid history. Never throws.
export function parseHistory(raw: unknown, now: number): HistoryState {
  const state = defaultHistory();
  if (typeof raw !== 'object' || raw === null) return state;
  const list = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(list)) return state;
  const seen = new Set<number>();
  let highest = 0;
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, url, title, visitedAt } = item as Record<string, unknown>;
    const kept = historyUrl(url);
    if (
      kept === null ||
      typeof id !== 'number' ||
      !Number.isInteger(id) ||
      id < 1 ||
      seen.has(id) ||
      typeof visitedAt !== 'number' ||
      !Number.isFinite(visitedAt) ||
      visitedAt <= 0
    ) {
      continue;
    }
    seen.add(id);
    highest = Math.max(highest, id);
    state.entries.push({ id, url: kept, title: cleanTitle(title), visitedAt });
  }
  state.entries.sort((a, b) => a.visitedAt - b.visitedAt || a.id - b.id);
  const rawNext = (raw as { nextId?: unknown }).nextId;
  state.nextId = Math.max(
    typeof rawNext === 'number' && Number.isInteger(rawNext) ? rawNext : 1,
    highest + 1,
  );
  return pruneHistory(state, now);
}

// Note a visit to a page.
export function addVisit(
  state: HistoryState,
  url: unknown,
  title: unknown,
  now: number,
): HistoryState {
  const kept = historyUrl(url);
  if (kept === null) return state;
  const name = cleanTitle(title);
  const last = state.entries[state.entries.length - 1];
  if (last && last.url === kept && now - last.visitedAt < SAME_VISIT_MS) {
    const updated = {
      ...last,
      visitedAt: Math.max(now, last.visitedAt),
      title: name || last.title,
    };
    return {
      ...state,
      entries: [...state.entries.slice(0, -1), updated],
    };
  }
  return pruneHistory(
    {
      ...state,
      nextId: state.nextId + 1,
      entries: [
        ...state.entries,
        { id: state.nextId, url: kept, title: name, visitedAt: now },
      ],
    },
    now,
  );
}

// A page found out its title after it loaded: give it to the newest visit.
export function setVisitTitle(
  state: HistoryState,
  url: unknown,
  title: unknown,
): HistoryState {
  const kept = historyUrl(url);
  const name = cleanTitle(title);
  if (kept === null || name === '') return state;
  for (let i = state.entries.length - 1; i >= 0; i--) {
    const entry = state.entries[i];
    if (entry.url !== kept) continue;
    if (entry.title === name) return state;
    const entries = state.entries.slice();
    entries[i] = { ...entry, title: name };
    return { ...state, entries };
  }
  return state;
}

// The visits that match every word you typed (in the title or the address),
// newest first, at most `limit`.
export function searchHistory(
  state: HistoryState,
  query: string,
  limit = 200,
): HistoryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found: HistoryEntry[] = [];
  for (let i = state.entries.length - 1; i >= 0 && found.length < limit; i--) {
    const entry = state.entries[i];
    const text = `${entry.title} ${entry.url}`.toLowerCase();
    if (words.every((word) => text.includes(word))) found.push(entry);
  }
  return found;
}

export function removeVisit(state: HistoryState, id: number): HistoryState {
  return state.entries.some((e) => e.id === id)
    ? { ...state, entries: state.entries.filter((e) => e.id !== id) }
    : state;
}

export type ClearRange = 'hour' | 'day' | 'all';
export const isClearRange = (value: unknown): value is ClearRange =>
  value === 'hour' || value === 'day' || value === 'all';

// Clear the last hour, the last day, or everything.
export function clearHistory(
  state: HistoryState,
  range: ClearRange,
  now: number,
): HistoryState {
  if (range === 'all') {
    return state.entries.length === 0 ? state : { ...state, entries: [] };
  }
  const since = now - (range === 'hour' ? 60 * 60_000 : DAY_MS);
  const entries = state.entries.filter((e) => e.visitedAt < since);
  return entries.length === state.entries.length
    ? state
    : { ...state, entries };
}

// Newest-first visits split by day, with a heading for each: "Today", "Yesterday",
// then "Mon, Nov 10" (with the year for another year).
export function dayGroups(
  entries: readonly HistoryEntry[],
  now: number,
): { key: string; label: string; entries: HistoryEntry[] }[] {
  const startOf = (time: number) => {
    const d = new Date(time);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const today = startOf(now);
  const yesterday = startOf(today - 12 * 60 * 60_000);
  const thisYear = new Date(now).getFullYear();
  const groups: { key: string; label: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const day = startOf(entry.visitedAt);
    let group = groups[groups.length - 1];
    if (!group || group.key !== String(day)) {
      const date = new Date(day);
      const label =
        day === today
          ? 'Today'
          : day === yesterday
            ? 'Yesterday'
            : date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                ...(date.getFullYear() === thisYear ? {} : { year: 'numeric' }),
              });
      group = { key: String(day), label, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}
