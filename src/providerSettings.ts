// Which AI provider and model the chat uses. This is NOT secret (the API key is
// stored separately, encrypted, in secrets.ts). Pure data and functions, so it is
// easy to test. Saved to llm.json.
import { isValidModelId } from './openrouter.ts';

export interface ProviderSettings {
  version: 1;
  // Only OpenRouter for now; a provider interface leaves room for more.
  provider: 'openrouter';
  // The model name sent with each message (e.g. "openai/gpt-4o"), or null if
  // none has been chosen yet.
  model: string | null;
}

export const defaultProviderSettings = (): ProviderSettings => ({
  version: 1,
  provider: 'openrouter',
  model: null,
});

// Turn whatever is on disk into valid settings. This never throws.
export function parseProviderSettings(raw: unknown): ProviderSettings {
  const settings = defaultProviderSettings();
  if (typeof raw === 'object' && raw !== null) {
    const model = (raw as { model?: unknown }).model;
    if (isValidModelId(model)) settings.model = model;
  }
  return settings;
}

// Choose a model (or null to clear the choice). A name that is not acceptable
// leaves the settings as they were.
export function withModel(
  settings: ProviderSettings,
  model: unknown,
): ProviderSettings {
  if (model === null) return { ...settings, model: null };
  return isValidModelId(model) ? { ...settings, model } : settings;
}
