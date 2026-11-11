// The data model for Spaces and tabs: plain data plus pure functions that
// return a NEW state instead of changing the old one. No Electron in here, so
// it is easy to test. This is also exactly what gets saved to spaces.json.

export const SPACE_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;
export type SpaceColor = (typeof SPACE_COLORS)[number];

export interface SavedTab {
  id: number;
  url: string;
  title: string;
  favicon: string | null;
  // The Space this tab belongs to, or null for an ungrouped tab.
  spaceId: number | null;
}

export interface SavedSpace {
  id: number;
  name: string;
  color: SpaceColor;
  // Collapsed in the sidebar (its tabs are hidden, like a Chrome tab group).
  collapsed: boolean;
  // Reserved for the Space's whiteboard (milestone M3b). Unused for now.
  leadData: null;
}

// What is currently showing: a web tab, or a Space's Lead (summary) tab.
export type ActiveRef =
  | { kind: 'tab'; id: number }
  | { kind: 'lead'; spaceId: number };

export interface SavedState {
  version: 1;
  spaces: SavedSpace[];
  // Order in this list is the order within a group in the sidebar.
  tabs: SavedTab[];
  active: ActiveRef | null;
  settings: { sidebarPinned: boolean };
  // Source of new ids for both tabs and Spaces.
  nextId: number;
}

const MAX_TABS = 1000;
const MAX_SPACES = 200;
const MAX_NAME = 60;
const MAX_TITLE = 200;
const MAX_URL = 4096;

// Only normal web addresses are ever loaded or saved. This keeps a tampered
// save file from making the app open file: or javascript: addresses.
export const isWebUrl = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_URL &&
  /^https?:\/\//i.test(value);

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function defaultState(): SavedState {
  return {
    version: 1,
    spaces: [],
    tabs: [],
    active: null,
    settings: { sidebarPinned: false },
    nextId: 1,
  };
}

// ---------------------------------------------------------------------------
// Loading: turn untrusted data (the file on disk) into a valid state.
// Anything invalid is dropped or repaired; this never throws.
// ---------------------------------------------------------------------------

export function parseState(raw: unknown): SavedState {
  const state = defaultState();
  if (!isRecord(raw)) return state;

  const spaceIds = new Set<number>();
  if (Array.isArray(raw.spaces)) {
    for (const item of raw.spaces) {
      if (state.spaces.length >= MAX_SPACES) break;
      if (!isRecord(item) || !isId(item.id) || spaceIds.has(item.id)) continue;
      spaceIds.add(item.id);
      state.spaces.push({
        id: item.id,
        name: cleanName(item.name, `Space ${state.spaces.length + 1}`),
        color: SPACE_COLORS.find((c) => c === item.color) ?? 'grey',
        collapsed: item.collapsed === true,
        leadData: null,
      });
    }
  }

  const tabIds = new Set<number>();
  if (Array.isArray(raw.tabs)) {
    for (const item of raw.tabs) {
      if (state.tabs.length >= MAX_TABS) break;
      if (
        !isRecord(item) ||
        !isId(item.id) ||
        tabIds.has(item.id) ||
        !isWebUrl(item.url)
      ) {
        continue;
      }
      tabIds.add(item.id);
      state.tabs.push({
        id: item.id,
        url: item.url,
        title:
          typeof item.title === 'string' ? item.title.slice(0, MAX_TITLE) : '',
        favicon: isWebUrl(item.favicon) ? item.favicon : null,
        // A tab pointing at a Space that does not exist becomes ungrouped.
        spaceId:
          isId(item.spaceId) && spaceIds.has(item.spaceId)
            ? item.spaceId
            : null,
      });
    }
  }

  const maxId = Math.max(0, ...spaceIds, ...tabIds);
  state.nextId = Math.max(isId(raw.nextId) ? raw.nextId : 1, maxId + 1);

  if (isRecord(raw.settings)) {
    state.settings.sidebarPinned = raw.settings.sidebarPinned === true;
  }

  const active = isRecord(raw.active) ? raw.active : null;
  if (active?.kind === 'tab' && isId(active.id) && tabIds.has(active.id)) {
    state.active = { kind: 'tab', id: active.id };
  } else if (
    active?.kind === 'lead' &&
    isId(active.spaceId) &&
    spaceIds.has(active.spaceId)
  ) {
    state.active = { kind: 'lead', spaceId: active.spaceId };
  } else {
    state.active = navOrder(state)[0] ?? null;
  }

  return state;
}

function cleanName(value: unknown, fallback: string): string {
  const name = typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '';
  return name === '' ? fallback : name;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// Everything you can select, in the order the sidebar shows it: ungrouped
// tabs first, then each Space (its Lead tab, then its tabs).
export function navOrder(state: SavedState): ActiveRef[] {
  const order: ActiveRef[] = [];
  for (const tab of state.tabs) {
    if (tab.spaceId === null) order.push({ kind: 'tab', id: tab.id });
  }
  for (const space of state.spaces) {
    order.push({ kind: 'lead', spaceId: space.id });
    for (const tab of state.tabs) {
      if (tab.spaceId === space.id) order.push({ kind: 'tab', id: tab.id });
    }
  }
  return order;
}

export const sameRef = (a: ActiveRef | null, b: ActiveRef | null): boolean =>
  a !== null &&
  b !== null &&
  a.kind === b.kind &&
  (a.kind === 'tab'
    ? a.id === (b as typeof a).id
    : a.spaceId === (b as typeof a).spaceId);

export const findTab = (state: SavedState, id: number) =>
  state.tabs.find((t) => t.id === id);
export const findSpace = (state: SavedState, id: number) =>
  state.spaces.find((s) => s.id === id);

// After removing things, pick what to select: the item now at the same spot in
// the sidebar, or the last one.
function pickNeighbor(
  before: ActiveRef[],
  oldActive: ActiveRef | null,
  after: ActiveRef[],
): ActiveRef | null {
  if (after.length === 0) return null;
  const index = before.findIndex((ref) => sameRef(ref, oldActive));
  return after[Math.min(Math.max(index, 0), after.length - 1)];
}

// ---------------------------------------------------------------------------
// Changing (each returns a new state)
// ---------------------------------------------------------------------------

export function addTab(
  state: SavedState,
  options: { url: string; spaceId?: number | null; activate?: boolean },
): { state: SavedState; id: number } {
  const id = state.nextId;
  const spaceId =
    options.spaceId !== undefined &&
    options.spaceId !== null &&
    findSpace(state, options.spaceId)
      ? options.spaceId
      : null;
  const tab: SavedTab = {
    id,
    url: options.url,
    title: '',
    favicon: null,
    spaceId,
  };
  return {
    id,
    state: {
      ...state,
      tabs: [...state.tabs, tab],
      nextId: id + 1,
      active: options.activate === false ? state.active : { kind: 'tab', id },
    },
  };
}

export function updateTab(
  state: SavedState,
  id: number,
  patch: { url?: string; title?: string; favicon?: string | null },
): SavedState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => {
      if (tab.id !== id) return tab;
      return {
        ...tab,
        url: isWebUrl(patch.url) ? patch.url : tab.url,
        title:
          typeof patch.title === 'string'
            ? patch.title.slice(0, MAX_TITLE)
            : tab.title,
        favicon:
          patch.favicon === null
            ? null
            : isWebUrl(patch.favicon)
              ? patch.favicon
              : tab.favicon,
      };
    }),
  };
}

export function removeTab(state: SavedState, id: number): SavedState {
  if (!findTab(state, id)) return state;
  const before = navOrder(state);
  const next: SavedState = {
    ...state,
    tabs: state.tabs.filter((t) => t.id !== id),
  };
  const stillValid =
    state.active !== null && !sameRef(state.active, { kind: 'tab', id });
  return {
    ...next,
    active: stillValid
      ? state.active
      : pickNeighbor(before, state.active, navOrder(next)),
  };
}

export function setActive(state: SavedState, ref: ActiveRef): SavedState {
  const exists =
    ref.kind === 'tab'
      ? findTab(state, ref.id) !== undefined
      : findSpace(state, ref.spaceId);
  return exists ? { ...state, active: ref } : state;
}

export function addSpace(
  state: SavedState,
  name?: string,
): { state: SavedState; id: number } {
  const id = state.nextId;
  const space: SavedSpace = {
    id,
    name: cleanName(name, `Space ${state.spaces.length + 1}`),
    color: SPACE_COLORS[(state.spaces.length + 1) % SPACE_COLORS.length],
    collapsed: false,
    leadData: null,
  };
  return {
    id,
    state: { ...state, spaces: [...state.spaces, space], nextId: id + 1 },
  };
}

export function renameSpace(
  state: SavedState,
  id: number,
  name: string,
): SavedState {
  return {
    ...state,
    spaces: state.spaces.map((s) =>
      s.id === id ? { ...s, name: cleanName(name, s.name) } : s,
    ),
  };
}

export function setSpaceColor(
  state: SavedState,
  id: number,
  color: SpaceColor,
): SavedState {
  if (!SPACE_COLORS.includes(color)) return state;
  return {
    ...state,
    spaces: state.spaces.map((s) => (s.id === id ? { ...s, color } : s)),
  };
}

export function setSpaceCollapsed(
  state: SavedState,
  id: number,
  collapsed: boolean,
): SavedState {
  return {
    ...state,
    spaces: state.spaces.map((s) => (s.id === id ? { ...s, collapsed } : s)),
  };
}

// Move a tab into a Space, or out of any Space (spaceId = null).
export function moveTab(
  state: SavedState,
  tabId: number,
  spaceId: number | null,
): SavedState {
  if (!findTab(state, tabId)) return state;
  if (spaceId !== null && !findSpace(state, spaceId)) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, spaceId } : t)),
  };
}

// Remove a Space but keep its tabs (they become ungrouped).
export function ungroupSpace(state: SavedState, id: number): SavedState {
  if (!findSpace(state, id)) return state;
  const before = navOrder(state);
  const next: SavedState = {
    ...state,
    spaces: state.spaces.filter((s) => s.id !== id),
    tabs: state.tabs.map((t) =>
      t.spaceId === id ? { ...t, spaceId: null } : t,
    ),
  };
  const leadWasActive = sameRef(state.active, { kind: 'lead', spaceId: id });
  return {
    ...next,
    active: leadWasActive
      ? pickNeighbor(before, state.active, navOrder(next))
      : state.active,
  };
}

// Remove a Space AND close its tabs. Returns which tabs were removed so the
// caller can close their web pages.
export function deleteSpace(
  state: SavedState,
  id: number,
): { state: SavedState; removedTabIds: number[] } {
  if (!findSpace(state, id)) return { state, removedTabIds: [] };
  const before = navOrder(state);
  const removedTabIds = state.tabs
    .filter((t) => t.spaceId === id)
    .map((t) => t.id);
  const next: SavedState = {
    ...state,
    spaces: state.spaces.filter((s) => s.id !== id),
    tabs: state.tabs.filter((t) => t.spaceId !== id),
  };
  const activeGone =
    sameRef(state.active, { kind: 'lead', spaceId: id }) ||
    (state.active?.kind === 'tab' && removedTabIds.includes(state.active.id));
  return {
    removedTabIds,
    state: {
      ...next,
      active: activeGone
        ? pickNeighbor(before, state.active, navOrder(next))
        : state.active,
    },
  };
}

export function setSidebarPinned(
  state: SavedState,
  pinned: boolean,
): SavedState {
  return { ...state, settings: { ...state.settings, sidebarPinned: pinned } };
}
