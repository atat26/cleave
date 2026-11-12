// Whether the assistant names new chats on its own. (The "name it with AI"
// buttons always work.) Saved to naming.json. Pure data and functions, so it is
// easy to test.

export interface NamingSettings {
  version: 1;
  // Name a chat (and pick its emoji) when its first message is sent or retried.
  auto: boolean;
}

export const defaultNamingSettings = (): NamingSettings => ({
  version: 1,
  auto: true,
});

// Turn whatever is on disk into valid settings. Never throws.
export function parseNamingSettings(raw: unknown): NamingSettings {
  const settings = defaultNamingSettings();
  if (typeof raw === 'object' && raw !== null) {
    const auto = (raw as { auto?: unknown }).auto;
    if (typeof auto === 'boolean') settings.auto = auto;
  }
  return settings;
}
