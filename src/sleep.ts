// Putting pages to sleep: a sleeping page has no live web page behind it (it uses no
// memory), and loads again the next time you open it. You can put a whole Space's
// pages to sleep, and choose to have pages you have not used for a while go to sleep
// by themselves. Pure rules, so they are easy to test; the app does the sleeping.

export interface SleepTab {
  id: number;
  spaceId: number | null;
  // Has a live web page right now.
  loaded: boolean;
  closed: boolean;
  // Playing sound.
  audible: boolean;
  // The assistant is working in it.
  working: boolean;
}

// "After how long" choices, in minutes (0 is never).
export const SLEEP_AFTER_CHOICES = [0, 15, 30, 60, 120, 240, 480] as const;
export type SleepAfter = (typeof SLEEP_AFTER_CHOICES)[number];

export interface SleepSettings {
  version: 1;
  // Pages not used for this many minutes go to sleep (0: never).
  afterMinutes: SleepAfter;
}

export const defaultSleepSettings = (): SleepSettings => ({
  version: 1,
  afterMinutes: 0,
});

const isChoice = (value: unknown): value is SleepAfter =>
  (SLEEP_AFTER_CHOICES as readonly unknown[]).includes(value);

// Turn whatever is on disk into valid settings. Never throws.
export function parseSleepSettings(raw: unknown): SleepSettings {
  const settings = defaultSleepSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const { afterMinutes } = raw as Record<string, unknown>;
  if (isChoice(afterMinutes)) settings.afterMinutes = afterMinutes;
  return settings;
}

export function withSleepSettings(
  settings: SleepSettings,
  changes: unknown,
): SleepSettings {
  if (typeof changes !== 'object' || changes === null) return settings;
  const { afterMinutes } = changes as Record<string, unknown>;
  return isChoice(afterMinutes) && afterMinutes !== settings.afterMinutes
    ? { ...settings, afterMinutes }
    : settings;
}

// How a choice reads in Settings.
export function sleepAfterWords(minutes: SleepAfter): string {
  if (minutes === 0) return 'Never';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

// The pages of a Space that can go to sleep now: open and loaded, not the one you
// are looking at, not playing sound, and not being used by the assistant.
export function spaceSleepers(
  tabs: SleepTab[],
  spaceId: number,
  activeId: number | null,
): number[] {
  return tabs
    .filter(
      (t) =>
        t.spaceId === spaceId &&
        t.loaded &&
        !t.closed &&
        t.id !== activeId &&
        !t.audible &&
        !t.working,
    )
    .map((t) => t.id);
}

// The pages that have gone unused for `afterMinutes` and can go to sleep. `lastUsed`
// holds when each page was last shown (a page with no entry counts as just used).
export function idleSleepers(
  tabs: SleepTab[],
  lastUsed: ReadonlyMap<number, number>,
  now: number,
  afterMinutes: SleepAfter,
  activeId: number | null,
): number[] {
  if (afterMinutes === 0) return [];
  const limit = afterMinutes * 60_000;
  return tabs
    .filter(
      (t) =>
        t.loaded &&
        !t.closed &&
        t.id !== activeId &&
        !t.audible &&
        !t.working &&
        now - (lastUsed.get(t.id) ?? now) >= limit,
    )
    .map((t) => t.id);
}
