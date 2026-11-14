// Your choices for the Library: whether browsing history is saved, how long it is
// kept, and how long deleted chats and artifacts wait in "Recently deleted" before
// they are removed for good. Saved to library.json. Pure data and functions, so it
// is easy to test.

export const HISTORY_DAYS_CHOICES = [7, 30, 90, 365] as const;
export const TRASH_DAYS_CHOICES = [7, 14, 30, 60, 90] as const;

export interface LibrarySettings {
  version: 1;
  // Save the pages you visit. Off: nothing new is added (what is saved stays until
  // you clear it).
  saveHistory: boolean;
  historyDays: number;
  trashDays: number;
}

export const defaultLibrarySettings = (): LibrarySettings => ({
  version: 1,
  saveHistory: true,
  historyDays: 90,
  trashDays: 30,
});

const isChoice = (
  choices: readonly number[],
  value: unknown,
): value is number => typeof value === 'number' && choices.includes(value);

// Turn whatever is on disk into valid settings. Never throws.
export function parseLibrarySettings(raw: unknown): LibrarySettings {
  const settings = defaultLibrarySettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const { saveHistory, historyDays, trashDays } = raw as Record<
    string,
    unknown
  >;
  if (typeof saveHistory === 'boolean') settings.saveHistory = saveHistory;
  if (isChoice(HISTORY_DAYS_CHOICES, historyDays)) {
    settings.historyDays = historyDays;
  }
  if (isChoice(TRASH_DAYS_CHOICES, trashDays)) settings.trashDays = trashDays;
  return settings;
}

// Change some settings. Anything that is not an allowed choice is ignored.
export function withLibrarySettings(
  settings: LibrarySettings,
  changes: unknown,
): LibrarySettings {
  if (typeof changes !== 'object' || changes === null) return settings;
  const { saveHistory, historyDays, trashDays } = changes as Record<
    string,
    unknown
  >;
  return {
    ...settings,
    saveHistory:
      typeof saveHistory === 'boolean' ? saveHistory : settings.saveHistory,
    historyDays: isChoice(HISTORY_DAYS_CHOICES, historyDays)
      ? historyDays
      : settings.historyDays,
    trashDays: isChoice(TRASH_DAYS_CHOICES, trashDays)
      ? trashDays
      : settings.trashDays,
  };
}
