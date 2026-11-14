// Page zoom: the steps it moves through, and the zoom you chose for each site
// (like Chrome, zoom belongs to a site: zoom in on one and every page of it stays
// zoomed, now and next time). Saved to zoom.json. Pure data and functions, so it
// is easy to test.

// The steps, as factors (1 = 100%).
export const ZOOM_LEVELS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
  5,
] as const;
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

const MAX_SITES = 1000;

// The next step up (1) or down (-1) from the zoom a page has now. A zoom between
// steps (from an old setting) moves to the nearest step in that direction. At the
// ends it stays put.
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_LEVELS.find((level) => level > current + 1e-6) ?? MAX_ZOOM;
  }
  const lower = ZOOM_LEVELS.filter((level) => level < current - 1e-6);
  return lower.length > 0 ? lower[lower.length - 1] : MIN_ZOOM;
}

// "125%".
export const zoomLabel = (factor: number): string =>
  `${Math.round(factor * 100)}%`;

// Which site a page belongs to for zoom: its host name, or null for anything that
// is not an ordinary web page (those keep the default).
export function zoomHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    return parsed.hostname === '' ? null : parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export interface ZoomSettings {
  version: 1;
  // Host name -> factor, only for sites that are not at 100%.
  sites: Record<string, number>;
}

export const defaultZoomSettings = (): ZoomSettings => ({
  version: 1,
  sites: {},
});

const isFactor = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= MIN_ZOOM &&
  value <= MAX_ZOOM;

// Turn whatever is on disk into valid settings: only real sites with a sensible,
// non-default zoom are kept. Never throws.
export function parseZoomSettings(raw: unknown): ZoomSettings {
  const settings = defaultZoomSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const sites = (raw as { sites?: unknown }).sites;
  if (typeof sites !== 'object' || sites === null || Array.isArray(sites)) {
    return settings;
  }
  for (const [host, factor] of Object.entries(sites)) {
    if (Object.keys(settings.sites).length >= MAX_SITES) break;
    if (host === '' || host.length > 253 || !isFactor(factor)) continue;
    if (Math.abs(factor - 1) < 1e-6) continue;
    settings.sites[host.toLowerCase()] = factor;
  }
  return settings;
}

// The zoom a site has (1 when none was chosen).
export const zoomFor = (settings: ZoomSettings, host: string | null): number =>
  host === null ? 1 : (settings.sites[host] ?? 1);

// Remember a site's zoom (100% means "forget it"). A bad factor or site is ignored.
export function withSiteZoom(
  settings: ZoomSettings,
  host: string | null,
  factor: number,
): ZoomSettings {
  if (host === null || !isFactor(factor)) return settings;
  const sites = { ...settings.sites };
  if (Math.abs(factor - 1) < 1e-6) delete sites[host];
  else if (sites[host] !== undefined || Object.keys(sites).length < MAX_SITES) {
    sites[host] = factor;
  }
  return { ...settings, sites };
}
