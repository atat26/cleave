// The little pictures sites use as icons, remembered by site name so Settings can
// show them in lists (without loading anything from the sites just to draw a list).
// The pictures are only ever remembered from pages you open. Saved to favicons.json.
// Pure data and functions, so it is easy to test.

export interface FaviconCache {
  version: 1;
  // Site name (no "www.") to the address of its icon, oldest first.
  icons: Record<string, string>;
}

export const defaultFavicons = (): FaviconCache => ({ version: 1, icons: {} });

const MAX_ICONS = 600;
const MAX_ADDRESS = 600;

const siteName = (address: string): string | null => {
  try {
    const url = new URL(address);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
};

const isIconAddress = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > MAX_ADDRESS) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

// Remember the icon a page showed (the newest is kept last).
export function rememberFavicon(
  cache: FaviconCache,
  pageAddress: string,
  iconAddress: string | null | undefined,
): FaviconCache {
  const name = siteName(pageAddress);
  if (name === null || !isIconAddress(iconAddress)) return cache;
  if (cache.icons[name] === iconAddress) return cache;
  const icons = { ...cache.icons };
  delete icons[name];
  icons[name] = iconAddress;
  const names = Object.keys(icons);
  for (const old of names.slice(0, Math.max(0, names.length - MAX_ICONS))) {
    delete icons[old];
  }
  return { ...cache, icons };
}

// The icon for a site name, or for the main site it belongs to ("mail.google.com"
// falls back to "google.com"), or null.
export function faviconFor(
  cache: FaviconCache,
  host: string,
  site?: string,
): string | null {
  const exact = cache.icons[host.replace(/^www\./, '')];
  if (exact) return exact;
  return site ? (cache.icons[site] ?? null) : null;
}

// Turn whatever is on disk into a valid cache. Never throws.
export function parseFavicons(raw: unknown): FaviconCache {
  const cache = defaultFavicons();
  if (typeof raw !== 'object' || raw === null) return cache;
  const icons = (raw as { icons?: unknown }).icons;
  if (typeof icons !== 'object' || icons === null || Array.isArray(icons)) {
    return cache;
  }
  for (const [name, address] of Object.entries(icons)) {
    if (/^[a-z0-9.-]+$/.test(name) && isIconAddress(address)) {
      cache.icons[name] = address;
    }
  }
  const names = Object.keys(cache.icons);
  for (const old of names.slice(0, Math.max(0, names.length - MAX_ICONS))) {
    delete cache.icons[old];
  }
  return cache;
}

// The icon a tab shows right after it moves to a new page, until that page reports its own (issue #139).
// The browser engine does not always announce an icon again when the new page names the same icon as the
// one before (moving about inside a site), and a tab whose icon was cleared at every move kept the grey
// circle for good. So: the same site keeps the icon it had, and another site shows the icon remembered
// for it from an earlier visit, or none. A page that reports a different icon replaces it, as before.
export function iconAfterNavigation(
  cache: FaviconCache,
  previousPage: string,
  newPage: string,
  previousIcon: string | null,
): string | null {
  const after = siteName(newPage);
  if (after === null) return null;
  if (previousIcon !== null && siteName(previousPage) === after) {
    return previousIcon;
  }
  return faviconFor(cache, after);
}
