// Which search provider the assistant uses. The key is not here: it is stored
// encrypted with the other secrets (secrets.ts). Saved to search.json. Pure data
// and functions, so it is easy to test.
import { isSearchProvider } from './webSearch.ts';
import type { SearchProviderId } from './webSearch.ts';

export interface SearchSettings {
  version: 1;
  provider: SearchProviderId;
}

export const defaultSearchSettings = (): SearchSettings => ({
  version: 1,
  provider: 'brave',
});

// Turn whatever is on disk into valid settings. Never throws.
export function parseSearchSettings(raw: unknown): SearchSettings {
  const settings = defaultSearchSettings();
  if (typeof raw === 'object' && raw !== null) {
    const provider = (raw as { provider?: unknown }).provider;
    if (isSearchProvider(provider)) settings.provider = provider;
  }
  return settings;
}
