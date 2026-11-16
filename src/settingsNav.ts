// A tiny way for one panel to say which part of Settings should open first (for
// example the Tools panel's link to the web search settings). Settings reads and
// clears it when it opens.
export type SettingsSection = 'model' | 'prompt' | 'web-search' | 'privacy';

let requested: SettingsSection | null = null;
const listeners = new Set<() => void>();

export function requestSettingsSection(section: SettingsSection): void {
  requested = section;
  // Settings that is already open moves to it.
  for (const listener of listeners) listener();
}

// Settings listens, so a request moves it even when it is already open.
export function onSectionRequested(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function takeRequestedSection(): SettingsSection | null {
  const section = requested;
  requested = null;
  return section;
}
