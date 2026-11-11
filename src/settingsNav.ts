// A tiny way for one panel to say which part of Settings should open first (for
// example the Tools panel's link to the web search settings). Settings reads and
// clears it when it opens.
export type SettingsSection = 'model' | 'prompt' | 'web-search';

let requested: SettingsSection | null = null;

export function requestSettingsSection(section: SettingsSection): void {
  requested = section;
}

export function takeRequestedSection(): SettingsSection | null {
  const section = requested;
  requested = null;
  return section;
}
