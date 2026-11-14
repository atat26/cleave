// Recently closed tabs: the last 25 you closed, so Ctrl+Shift+T can bring the
// newest back (and a list can offer the others). Saved to closed-tabs.json. Pure
// data and functions, so it is easy to test.
import { historyUrl } from './history.ts';

export interface ClosedTab {
  id: number;
  url: string;
  title: string;
  // The Space it was in, or null.
  spaceId: number | null;
  closedAt: number;
}

export interface ClosedState {
  version: 1;
  nextId: number;
  // Oldest first.
  tabs: ClosedTab[];
}

export const MAX_CLOSED_TABS = 25;
const MAX_TITLE = 200;

export const defaultClosed = (): ClosedState => ({
  version: 1,
  nextId: 1,
  tabs: [],
});

const cleanTitle = (title: unknown): string =>
  typeof title === 'string'
    ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
    : '';

// Turn whatever is on disk into a valid list. Never throws.
export function parseClosed(raw: unknown): ClosedState {
  const state = defaultClosed();
  if (typeof raw !== 'object' || raw === null) return state;
  const list = (raw as { tabs?: unknown }).tabs;
  if (!Array.isArray(list)) return state;
  const seen = new Set<number>();
  let highest = 0;
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, url, title, spaceId, closedAt } = item as Record<
      string,
      unknown
    >;
    const kept = historyUrl(url);
    if (
      kept === null ||
      typeof id !== 'number' ||
      !Number.isInteger(id) ||
      id < 1 ||
      seen.has(id)
    ) {
      continue;
    }
    seen.add(id);
    highest = Math.max(highest, id);
    state.tabs.push({
      id,
      url: kept,
      title: cleanTitle(title),
      spaceId:
        typeof spaceId === 'number' && Number.isInteger(spaceId)
          ? spaceId
          : null,
      closedAt:
        typeof closedAt === 'number' && Number.isFinite(closedAt)
          ? closedAt
          : 0,
    });
  }
  state.tabs = state.tabs.slice(-MAX_CLOSED_TABS);
  const rawNext = (raw as { nextId?: unknown }).nextId;
  state.nextId = Math.max(
    typeof rawNext === 'number' && Number.isInteger(rawNext) ? rawNext : 1,
    highest + 1,
  );
  return state;
}

// Note a tab that was closed. Only ordinary web pages are kept. Closing the same
// page again moves it to the front of the list instead of repeating it.
export function recordClosed(
  state: ClosedState,
  tab: { url: unknown; title: unknown; spaceId: number | null },
  now: number,
): ClosedState {
  const kept = historyUrl(tab.url);
  if (kept === null) return state;
  const others = state.tabs.filter(
    (t) => !(t.url === kept && t.spaceId === tab.spaceId),
  );
  const tabs = [
    ...others,
    {
      id: state.nextId,
      url: kept,
      title: cleanTitle(tab.title),
      spaceId: tab.spaceId,
      closedAt: now,
    },
  ].slice(-MAX_CLOSED_TABS);
  return { ...state, nextId: state.nextId + 1, tabs };
}

// Take the newest closed tab off the list (to reopen it), or null if none.
export function takeLastClosed(
  state: ClosedState,
): { state: ClosedState; tab: ClosedTab } | null {
  const tab = state.tabs[state.tabs.length - 1];
  return tab
    ? { state: { ...state, tabs: state.tabs.slice(0, -1) }, tab }
    : null;
}

// Take a particular one off the list.
export function takeClosedById(
  state: ClosedState,
  id: number,
): { state: ClosedState; tab: ClosedTab } | null {
  const tab = state.tabs.find((t) => t.id === id);
  return tab
    ? { state: { ...state, tabs: state.tabs.filter((t) => t.id !== id) }, tab }
    : null;
}

export function clearClosed(state: ClosedState): ClosedState {
  return state.tabs.length === 0 ? state : { ...state, tabs: [] };
}
