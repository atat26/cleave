// The suggestions under the address bar while you type: what you typed (as a search
// or an address), then matches from your open tabs and Space pages, bookmarks and
// history, best first. Pure code with no Electron, so it is easy to test.
import { historyUrl } from './history.ts';
import { looksLikeAddress, resolveInput } from './url.ts';

export type SuggestionKind = 'search' | 'go' | 'bookmark' | 'history' | 'tab';

export interface Suggestion {
  kind: SuggestionKind;
  title: string;
  // The site (and, for a tab, what choosing it does).
  detail: string;
  // Where it goes (a search address for "search").
  url: string;
  // For a tab: which one, and whether it is a kept page in a Space with no tab open.
  tabId?: number;
  closed?: boolean;
}

export interface SuggestSources {
  bookmarks: { url: string; title: string }[];
  history: { url: string; title: string; visitedAt: number }[];
  tabs: { id: number; url: string; title: string; closed: boolean }[];
}

// At most this many rows, counting the first (what you typed).
export const MAX_SUGGESTIONS = 8;
const DAY = 24 * 60 * 60_000;

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

// What you typed, as the first row: an address to go to, or a web search.
export function typedRow(text: string): Suggestion | null {
  const typed = text.trim();
  if (typed === '') return null;
  const url = resolveInput(typed);
  return looksLikeAddress(typed)
    ? { kind: 'go', title: typed, detail: 'Go to this address', url }
    : {
        kind: 'search',
        title: typed,
        detail: 'Search the web',
        url,
      };
}

interface Candidate {
  key: string;
  url: string;
  title: string;
  kind: 'tab' | 'bookmark' | 'history';
  tabId?: number;
  closed?: boolean;
  score: number;
}

const PRIORITY: Record<Candidate['kind'], number> = {
  tab: 3,
  bookmark: 2,
  history: 1,
};

// How well a page matches the words you typed (0: not at all).
function matchScore(words: string[], url: string, title: string): number {
  const host = hostOf(url).toLowerCase();
  const path = url.toLowerCase();
  const name = title.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (host.includes(word)) score += 4;
    else if (name.includes(word)) score += 2;
    else if (path.includes(word)) score += 1;
    else return 0;
  }
  if (host.startsWith(words[0])) score += 30;
  else if (name.startsWith(words[0])) score += 15;
  if (words.length === 1 && host === words[0]) score += 20;
  return score;
}

// The rows to show for what is typed so far. Nothing for an empty box.
export function suggest(
  text: string,
  sources: SuggestSources,
  now: number,
): Suggestion[] {
  const first = typedRow(text);
  if (first === null) return [];
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const typedKey = first.kind === 'go' ? historyUrl(first.url) : null;
  const found = new Map<string, Candidate>();

  const consider = (
    kind: Candidate['kind'],
    url: string,
    title: string,
    bonus: number,
    extra: Pick<Candidate, 'tabId' | 'closed'> = {},
  ) => {
    const key = historyUrl(url);
    if (key === null || key === typedKey) return;
    const matched = matchScore(words, key, title);
    if (matched === 0) return;
    const score = matched + bonus;
    const existing = found.get(key);
    if (!existing) {
      found.set(key, { key, url: key, title, kind, score, ...extra });
      return;
    }
    // The same page from another source: keep the best, and add the strengths.
    existing.score += bonus;
    if (PRIORITY[kind] > PRIORITY[existing.kind]) {
      existing.kind = kind;
      existing.tabId = extra.tabId;
      existing.closed = extra.closed;
    }
    if (
      title !== '' &&
      (existing.title === '' || PRIORITY[kind] >= PRIORITY[existing.kind])
    ) {
      existing.title = title;
    }
  };

  for (const tab of sources.tabs) {
    consider('tab', tab.url, tab.title, tab.closed ? 20 : 30, {
      tabId: tab.id,
      closed: tab.closed,
    });
  }
  for (const bookmark of sources.bookmarks) {
    consider('bookmark', bookmark.url, bookmark.title, 35);
  }
  // History: how often and how recently, per page.
  const visits = new Map<
    string,
    { count: number; last: number; title: string }
  >();
  for (const entry of sources.history) {
    const key = historyUrl(entry.url);
    if (key === null) continue;
    const seen = visits.get(key);
    if (seen) {
      seen.count += 1;
      if (entry.visitedAt >= seen.last) {
        seen.last = entry.visitedAt;
        if (entry.title !== '') seen.title = entry.title;
      }
    } else {
      visits.set(key, { count: 1, last: entry.visitedAt, title: entry.title });
    }
  }
  for (const [key, seen] of visits) {
    const age = now - seen.last;
    const recent = age < DAY ? 12 : age < 7 * DAY ? 6 : age < 30 * DAY ? 2 : 0;
    consider('history', key, seen.title, Math.min(15, seen.count * 3) + recent);
  }

  const rows = [...found.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS - 1)
    .map(
      (c): Suggestion => ({
        kind: c.kind,
        title: c.title || hostOf(c.url),
        detail:
          c.kind === 'tab'
            ? c.closed
              ? `Open from a Space · ${hostOf(c.url)}`
              : `Switch to tab · ${hostOf(c.url)}`
            : hostOf(c.url),
        url: c.url,
        ...(c.kind === 'tab' ? { tabId: c.tabId, closed: c.closed } : {}),
      }),
    );
  return [first, ...rows];
}

// ---- Where the dropdown goes -----------------------------------------------------

export const SUGGEST_ROW_HEIGHT = 44;
const SUGGEST_PAD = 6;
const SUGGEST_GAP = 4;
const SUGGEST_MIN_WIDTH = 240;

// The dropdown's place: just under the address bar, as wide as it, tall enough for
// its rows (and never past the bottom of the window).
export function suggestRect(
  bar: { x: number; y: number; width: number; height: number },
  rows: number,
  windowHeight: number,
): { x: number; y: number; width: number; height: number } {
  const y = Math.round(bar.y + bar.height + SUGGEST_GAP);
  const wanted = rows * SUGGEST_ROW_HEIGHT + 2 * SUGGEST_PAD;
  return {
    x: Math.round(bar.x),
    y,
    width: Math.round(Math.max(SUGGEST_MIN_WIDTH, bar.width)),
    height: Math.max(0, Math.min(wanted, windowHeight - y - SUGGEST_PAD)),
  };
}
