// What the user chose for the new-tab page: whether the box picks what Enter does
// by itself (auto mode), whether "Pick up" shows, and which Pick up items were
// hidden. Saved to new-tab.json. Pure data and functions, so it is easy to test.

export interface NewTabSettings {
  version: 1;
  // The box chooses Go to, Search or Ask for you as you type.
  autoMode: boolean;
  // "Pick up": unfinished things from the current Space under the box.
  suggestions: boolean;
  // Items taken off Pick up ("chat:4", "artifact:2", "page:9"), oldest first.
  hidden: string[];
}

export const defaultNewTabSettings = (): NewTabSettings => ({
  version: 1,
  autoMode: true,
  suggestions: true,
  hidden: [],
});

const MAX_HIDDEN = 300;
const KEY = /^(chat|artifact|page):\d{1,9}$/;

// Turn whatever is on disk into valid settings. Never throws.
export function parseNewTabSettings(raw: unknown): NewTabSettings {
  const settings = defaultNewTabSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const { autoMode, suggestions, hidden } = raw as Record<string, unknown>;
  if (typeof autoMode === 'boolean') settings.autoMode = autoMode;
  if (typeof suggestions === 'boolean') settings.suggestions = suggestions;
  if (Array.isArray(hidden)) {
    const seen = new Set<string>();
    for (const key of hidden) {
      if (typeof key === 'string' && KEY.test(key) && !seen.has(key)) {
        seen.add(key);
        settings.hidden.push(key);
      }
    }
    settings.hidden = settings.hidden.slice(-MAX_HIDDEN);
  }
  return settings;
}

// Change the two switches (anything else in `changes` is ignored).
export function withNewTabSettings(
  settings: NewTabSettings,
  changes: unknown,
): NewTabSettings {
  if (typeof changes !== 'object' || changes === null) return settings;
  const { autoMode, suggestions } = changes as Record<string, unknown>;
  return {
    ...settings,
    autoMode: typeof autoMode === 'boolean' ? autoMode : settings.autoMode,
    suggestions:
      typeof suggestions === 'boolean' ? suggestions : settings.suggestions,
  };
}

// Take an item off Pick up (it is not deleted anywhere).
export function hidePickUp(
  settings: NewTabSettings,
  key: unknown,
): NewTabSettings {
  if (typeof key !== 'string' || !KEY.test(key)) return settings;
  if (settings.hidden.includes(key)) return settings;
  return { ...settings, hidden: [...settings.hidden, key].slice(-MAX_HIDDEN) };
}

// Bring every hidden item back.
export const clearHiddenPickUp = (settings: NewTabSettings): NewTabSettings =>
  settings.hidden.length === 0 ? settings : { ...settings, hidden: [] };
