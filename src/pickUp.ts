// "Pick up" on the new-tab page: up to three unfinished things from the Space you
// are in (chats about it, its artifacts, its pages), newest first, built only from
// what is already on this computer. Also which Spaces were used most recently, for
// the Space pills. Pure code with no Electron, so it is easy to test.
import type { Artifact } from './artifacts.ts';
import type { Conversation } from './chats.ts';
import { historyUrl } from './history.ts';
import type { HistoryEntry } from './history.ts';
import { isNewTabPage } from './model.ts';
import type { SavedTab } from './model.ts';

export const MAX_PICK = 3;

export interface PickRow {
  // "chat:4", "artifact:2" or "page:9": what Hide remembers.
  key: string;
  kind: 'chat' | 'artifact' | 'page';
  id: number;
  title: string;
  // When it was last touched.
  at: number;
}

export interface PickSources {
  tabs: readonly SavedTab[];
  artifacts: readonly Artifact[];
  chats: readonly Conversation[];
  history: readonly HistoryEntry[];
}

// Every candidate for a Space, newest first (hidden ones not removed yet).
function candidates(spaceId: number, from: PickSources): PickRow[] {
  const rows: PickRow[] = [];
  for (const chat of from.chats) {
    // A chat counts for a Space when the Space is linked to it, and only once
    // something has been said.
    if (chat.messages.length === 0) continue;
    if (!chat.refs.some((r) => r.kind === 'space' && r.id === spaceId))
      continue;
    rows.push({
      key: `chat:${chat.id}`,
      kind: 'chat',
      id: chat.id,
      title: chat.title.trim() || 'Chat',
      at: chat.updatedAt,
    });
  }
  for (const artifact of from.artifacts) {
    if (artifact.spaceId !== spaceId) continue;
    rows.push({
      key: `artifact:${artifact.id}`,
      kind: 'artifact',
      id: artifact.id,
      title: artifact.title.trim() || 'Untitled',
      at: artifact.updatedAt,
    });
  }
  // A page counts by when it was last visited.
  const lastVisit = new Map<string, number>();
  for (const entry of from.history) {
    const url = historyUrl(entry.url);
    if (url !== null) lastVisit.set(url, entry.visitedAt);
  }
  // Two tabs on the same page are one item.
  const seenPages = new Set<string>();
  for (const tab of from.tabs) {
    if (tab.spaceId !== spaceId || isNewTabPage(tab.url)) continue;
    const url = historyUrl(tab.url);
    const at = url === null ? undefined : lastVisit.get(url);
    if (url === null || at === undefined || seenPages.has(url)) continue;
    seenPages.add(url);
    rows.push({
      key: `page:${tab.id}`,
      kind: 'page',
      id: tab.id,
      title: tab.title.trim() || url || 'Page',
      at,
    });
  }
  return rows.sort((a, b) => b.at - a.at || b.id - a.id);
}

// The rows to show (at most three, hidden ones left out) and how many there are in
// all (for "Show all N in this Space").
export function pickUpRows(
  spaceId: number | null,
  from: PickSources,
  hidden: readonly string[],
): { rows: PickRow[]; total: number } {
  if (spaceId === null) return { rows: [], total: 0 };
  const hide = new Set(hidden);
  const all = candidates(spaceId, from).filter((r) => !hide.has(r.key));
  return { rows: all.slice(0, MAX_PICK), total: all.length };
}

// The Spaces, most recently used first (a Space with nothing yet keeps its place
// after the ones that have).
export function recentSpaceIds(
  spaceIds: readonly number[],
  from: PickSources,
): number[] {
  const activity = new Map<number, number>();
  for (const id of spaceIds) {
    activity.set(id, candidates(id, from)[0]?.at ?? 0);
  }
  return [...spaceIds]
    .map((id, index) => ({ id, index }))
    .sort(
      (a, b) =>
        (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0) ||
        a.index - b.index,
    )
    .map((s) => s.id);
}

// "12 min ago", "Yesterday"...
export function timeAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks < 9 ? `${weeks} weeks ago` : 'Earlier';
}
