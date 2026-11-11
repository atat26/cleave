// Which AI provider and model the chat uses, your pinned models, and your system
// prompt. None of this is secret (the API key is stored separately, encrypted,
// in secrets.ts). Pure data and functions, so it is easy to test. Saved to
// llm.json.
import { isValidModelId } from './openrouter.ts';

// How many models can be pinned, and how long the system prompt can be.
export const MAX_PINNED = 12;
export const MAX_SYSTEM_PROMPT = 4000;

export interface ProviderSettings {
  version: 1;
  // Only OpenRouter for now; a provider interface leaves room for more.
  provider: 'openrouter';
  // The default model for new chats (e.g. "openai/gpt-4o"), or null if none has
  // been chosen yet.
  model: string | null;
  // Models you use often, shown as quick choices in the chat. In pin order.
  pinned: string[];
  // Your own instructions for the model, or null to use the built-in default.
  systemPrompt: string | null;
}

export const defaultProviderSettings = (): ProviderSettings => ({
  version: 1,
  provider: 'openrouter',
  model: null,
  pinned: [],
  systemPrompt: null,
});

// A tidy system prompt, or null if there is nothing to keep (empty or blank means
// "use the default").
function cleanPrompt(value: string): string | null {
  const text = value.slice(0, MAX_SYSTEM_PROMPT);
  return text.trim() === '' ? null : text;
}

// Turn whatever is on disk into valid settings. This never throws.
export function parseProviderSettings(raw: unknown): ProviderSettings {
  const settings = defaultProviderSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const { model, pinned, systemPrompt } = raw as {
    model?: unknown;
    pinned?: unknown;
    systemPrompt?: unknown;
  };
  if (isValidModelId(model)) settings.model = model;
  if (Array.isArray(pinned)) {
    for (const id of pinned) {
      if (settings.pinned.length >= MAX_PINNED) break;
      if (isValidModelId(id) && !settings.pinned.includes(id))
        settings.pinned.push(id);
    }
  }
  if (typeof systemPrompt === 'string')
    settings.systemPrompt = cleanPrompt(systemPrompt);
  return settings;
}

// Choose the default model (or null to clear the choice). A name that is not
// acceptable leaves the settings as they were.
export function withModel(
  settings: ProviderSettings,
  model: unknown,
): ProviderSettings {
  if (model === null) return { ...settings, model: null };
  return isValidModelId(model) ? { ...settings, model } : settings;
}

// Pin a model, or unpin it if it is already pinned. Nothing happens for a bad
// name, or when the pin limit is reached.
export function togglePinned(
  settings: ProviderSettings,
  id: unknown,
): ProviderSettings {
  if (!isValidModelId(id)) return settings;
  if (settings.pinned.includes(id)) {
    return { ...settings, pinned: settings.pinned.filter((p) => p !== id) };
  }
  if (settings.pinned.length >= MAX_PINNED) return settings;
  return { ...settings, pinned: [...settings.pinned, id] };
}

// Set your system prompt. null, or text that is empty or only spaces, goes back to
// the built-in default. Text over the limit is cut. Anything else is ignored.
export function withSystemPrompt(
  settings: ProviderSettings,
  text: unknown,
): ProviderSettings {
  if (text === null) return { ...settings, systemPrompt: null };
  if (typeof text !== 'string') return settings;
  return { ...settings, systemPrompt: cleanPrompt(text) };
}
