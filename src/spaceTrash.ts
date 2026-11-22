// Deleted Spaces, kept for a while so they can be brought back (they show in the
// Library under Recently deleted, next to deleted chats and artifacts). What is kept
// is the Space's name, colour, picture and note, the addresses and titles of its
// pages, and which artifacts were in it (the artifacts themselves are kept anyway,
// just no longer in a Space). Pure and strict about what it reads back from disk.

export interface TrashedPage {
  title: string;
  url: string;
}

export interface TrashedSpace {
  id: number;
  // The Space's own number when it was deleted, so the chats that were linked to it can be linked to
  // it again when it is brought back (null for one put away by an older version).
  spaceId: number | null;
  name: string;
  color: string;
  emoji: string | null;
  about: string;
  deletedAt: number;
  pages: TrashedPage[];
  artifactIds: number[];
}

export interface SpaceTrash {
  version: 1;
  nextId: number;
  items: TrashedSpace[];
}

export const MAX_TRASHED_SPACES = 50;
// As many pages as a Space can hold (see MAX_TABS in model.ts), so deleting a big Space loses none.
export const MAX_TRASHED_PAGES = 1000;
const MAX_TEXT = 200;
const MAX_ABOUT = 1000;
// As long as an address in a tab may be (MAX_URL in model.ts): a long sign-in or search address must
// survive "bring it back".
const MAX_URL = 4096;
const DAY_MS = 24 * 60 * 60 * 1000;

export const defaultSpaceTrash = (): SpaceTrash => ({
  version: 1,
  nextId: 1,
  items: [],
});

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const isWebUrl = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_URL &&
  /^https?:\/\//i.test(value);

function cleanPages(raw: unknown): TrashedPage[] {
  if (!Array.isArray(raw)) return [];
  const pages: TrashedPage[] = [];
  for (const item of raw) {
    if (pages.length >= MAX_TRASHED_PAGES) break;
    if (typeof item !== 'object' || item === null) continue;
    const { title, url } = item as Record<string, unknown>;
    if (!isWebUrl(url)) continue;
    pages.push({ title: text(title, MAX_TEXT), url });
  }
  return pages;
}

function cleanItem(raw: unknown): TrashedSpace | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isCount(r.id) || r.id < 1) return null;
  const name = text(r.name, 60);
  return {
    id: r.id,
    spaceId: isCount(r.spaceId) && r.spaceId >= 1 ? r.spaceId : null,
    name: name === '' ? 'Space' : name,
    color: text(r.color, 20),
    emoji:
      typeof r.emoji === 'string' && r.emoji !== ''
        ? r.emoji.slice(0, 16)
        : null,
    about: text(r.about, MAX_ABOUT),
    deletedAt: isCount(r.deletedAt) ? r.deletedAt : 0,
    pages: cleanPages(r.pages),
    artifactIds: Array.isArray(r.artifactIds)
      ? r.artifactIds
          .filter((id): id is number => isCount(id) && id >= 1)
          .slice(0, 500)
      : [],
  };
}

// Turn whatever is on disk into a valid trash. Never throws.
export function parseSpaceTrash(raw: unknown): SpaceTrash {
  const trash = defaultSpaceTrash();
  if (typeof raw !== 'object' || raw === null) return trash;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return trash;
  const seen = new Set<number>();
  for (const item of items) {
    if (trash.items.length >= MAX_TRASHED_SPACES) break;
    const clean = cleanItem(item);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    trash.items.push(clean);
  }
  const highest = Math.max(0, ...seen);
  const next = (raw as { nextId?: unknown }).nextId;
  trash.nextId = Math.max(isCount(next) ? next : 1, highest + 1);
  return trash;
}

// Put a deleted Space in the trash (the oldest go if it is full).
export function trashSpace(
  trash: SpaceTrash,
  space: {
    spaceId?: number | null;
    name: string;
    color: string;
    emoji: string | null;
    about: string;
    pages: TrashedPage[];
    artifactIds: number[];
  },
  now: number,
): SpaceTrash {
  const item: TrashedSpace = {
    id: trash.nextId,
    spaceId:
      typeof space.spaceId === 'number' && isCount(space.spaceId)
        ? space.spaceId
        : null,
    name: text(space.name, 60) || 'Space',
    color: text(space.color, 20),
    emoji: space.emoji,
    about: text(space.about, MAX_ABOUT),
    deletedAt: now,
    pages: cleanPages(space.pages),
    artifactIds: space.artifactIds.filter(isCount).slice(0, 500),
  };
  return {
    ...trash,
    nextId: trash.nextId + 1,
    items: [...trash.items, item].slice(-MAX_TRASHED_SPACES),
  };
}

// Take one out (to restore it): the item and the trash without it.
export function takeTrashedSpace(
  trash: SpaceTrash,
  id: number,
): { trash: SpaceTrash; item: TrashedSpace } | null {
  const item = trash.items.find((i) => i.id === id);
  if (!item) return null;
  return {
    item,
    trash: { ...trash, items: trash.items.filter((i) => i.id !== id) },
  };
}

export const purgeTrashedSpace = (trash: SpaceTrash, id: number): SpaceTrash =>
  trash.items.some((i) => i.id === id)
    ? { ...trash, items: trash.items.filter((i) => i.id !== id) }
    : trash;

export const emptySpaceTrash = (trash: SpaceTrash): SpaceTrash =>
  trash.items.length === 0 ? trash : { ...trash, items: [] };

// Forget what has been in the trash longer than `days`.
export function purgeOldTrashedSpaces(
  trash: SpaceTrash,
  now: number,
  days: number,
): SpaceTrash {
  const keep = trash.items.filter((i) => now - i.deletedAt < days * DAY_MS);
  return keep.length === trash.items.length ? trash : { ...trash, items: keep };
}
