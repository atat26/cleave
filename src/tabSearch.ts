// Tab search (Ctrl+Shift+A): a box over the page that lists your open tabs, from
// every Space, then the tabs you closed lately, filtered as you type. Pure code with
// no Electron, so it is easy to test.
import type { MenuItem } from './menuTypes.ts';
import type { SavedState } from './model.ts';
import type { ClosedTab } from './recentlyClosed.ts';

// How many recently closed tabs are offered.
export const MAX_CLOSED_SHOWN = 10;

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

// The rows: open tabs (loose ones first, then each Space's, as the sidebar lists
// them), then recently closed ones, newest first.
export function tabSearchItems(
  state: SavedState,
  closed: readonly ClosedTab[],
): MenuItem[] {
  const spaceName = (spaceId: number | null) =>
    spaceId === null
      ? null
      : (state.spaces.find((s) => s.id === spaceId)?.name ?? null);
  const activeId = state.active?.kind === 'tab' ? state.active.id : null;
  const open: MenuItem[] = [];
  const groups: (number | null)[] = [null, ...state.spaces.map((s) => s.id)];
  for (const spaceId of groups) {
    for (const tab of state.tabs) {
      if (tab.spaceId !== spaceId || tab.closed) continue;
      const host = hostOf(tab.url);
      const space = spaceName(tab.spaceId);
      open.push({
        type: 'item',
        id: `tabsearch.open:${tab.id}`,
        label: tab.title.trim() || host || 'New tab',
        detail: space ? `${host} · ${space}` : host,
        image: tab.favicon ?? undefined,
        checked: tab.id === activeId,
      });
    }
  }
  const recent: MenuItem[] = [...closed]
    .reverse()
    .slice(0, MAX_CLOSED_SHOWN)
    .map((tab): MenuItem => {
      const host = hostOf(tab.url);
      const space = spaceName(tab.spaceId);
      return {
        type: 'item',
        id: `tabsearch.closed:${tab.id}`,
        label: tab.title.trim() || host,
        detail: space ? `${host} · ${space}` : host,
      };
    });
  return [
    ...(open.length > 0
      ? [{ type: 'header', label: 'Open tabs' } as MenuItem, ...open]
      : []),
    ...(recent.length > 0
      ? [{ type: 'header', label: 'Recently closed' } as MenuItem, ...recent]
      : []),
  ];
}

// The rows that match what was typed: every word has to appear in the name or the
// site. Headings stay only over rows that remain. An empty search keeps everything.
export function filterTabSearch(
  items: readonly MenuItem[],
  query: string,
): MenuItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  const out: MenuItem[] = [];
  let heading: MenuItem | null = null;
  for (const item of items) {
    if (item.type === 'header') {
      heading = item;
      continue;
    }
    if (item.type !== 'item') continue;
    const text = `${item.label} ${item.detail ?? ''}`.toLowerCase();
    if (!words.every((w) => text.includes(w))) continue;
    if (heading !== null) {
      out.push(heading);
      heading = null;
    }
    out.push(item);
  }
  return out;
}

export type TabSearchChoice =
  | { kind: 'open'; id: number }
  | { kind: 'closed'; id: number };

export function parseTabSearchChoice(id: string): TabSearchChoice | null {
  const m = /^tabsearch\.(open|closed):(\d+)$/.exec(id);
  return m ? { kind: m[1] as 'open' | 'closed', id: Number(m[2]) } : null;
}
