// What you chose about extensions: for now, whether extensions from the Chrome Web
// Store update by themselves. Saved to extension-settings.json. Pure data and
// functions, so it is easy to test.

export interface ExtensionSettings {
  version: 1;
  // Extensions from the store are checked for updates at start and every few hours.
  autoUpdate: boolean;
}

export const defaultExtensionSettings = (): ExtensionSettings => ({
  version: 1,
  autoUpdate: true,
});

// Turn whatever is on disk into valid settings. Never throws.
export function parseExtensionSettings(raw: unknown): ExtensionSettings {
  const settings = defaultExtensionSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const { autoUpdate } = raw as Record<string, unknown>;
  if (typeof autoUpdate === 'boolean') settings.autoUpdate = autoUpdate;
  return settings;
}

// Change the switch (anything else in `changes` is ignored).
export function withExtensionSettings(
  settings: ExtensionSettings,
  changes: unknown,
): ExtensionSettings {
  if (typeof changes !== 'object' || changes === null) return settings;
  const { autoUpdate } = changes as Record<string, unknown>;
  return {
    ...settings,
    autoUpdate:
      typeof autoUpdate === 'boolean' ? autoUpdate : settings.autoUpdate,
  };
}
