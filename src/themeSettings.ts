// The look of the app: light, dark, or whatever the computer is set to. Saved to
// theme.json. Pure data and functions, so it is easy to test.

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export interface ThemeSettings {
  version: 1;
  theme: ThemeChoice;
}

export const defaultThemeSettings = (): ThemeSettings => ({
  version: 1,
  theme: 'system',
});

export const isThemeChoice = (value: unknown): value is ThemeChoice =>
  typeof value === 'string' &&
  (THEME_CHOICES as readonly string[]).includes(value);

// Turn whatever is on disk into valid settings. Never throws.
export function parseThemeSettings(raw: unknown): ThemeSettings {
  const settings = defaultThemeSettings();
  if (typeof raw === 'object' && raw !== null) {
    const theme = (raw as { theme?: unknown }).theme;
    if (isThemeChoice(theme)) settings.theme = theme;
  }
  return settings;
}
