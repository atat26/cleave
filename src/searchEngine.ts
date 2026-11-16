// The search engine the address bar (and "Search the web for…" on selected text)
// uses. Pick one of a few well-known ones, or add your own address with %s where
// the words go. Saved to search-engine.json. Pure data and functions, so it is easy
// to test. (This is not the assistant's web search: see searchSettings.ts.)

export interface Engine {
  id: string;
  name: string;
  // The address of a search, with %s where the words go.
  template: string;
}

export const ENGINES: readonly Engine[] = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    template: 'https://duckduckgo.com/?q=%s',
  },
  {
    id: 'google',
    name: 'Google',
    template: 'https://www.google.com/search?q=%s',
  },
  {
    id: 'bing',
    name: 'Bing',
    template: 'https://www.bing.com/search?q=%s',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    template: 'https://search.brave.com/search?q=%s',
  },
  {
    id: 'kagi',
    name: 'Kagi',
    template: 'https://kagi.com/search?q=%s',
  },
];

export const DEFAULT_ENGINE: Engine = ENGINES[0];

export interface CustomEngine {
  name: string;
  template: string;
}

export interface SearchEngineSettings {
  version: 1;
  // An id from ENGINES, or 'custom'.
  engine: string;
  custom: CustomEngine | null;
}

export const defaultSearchEngineSettings = (): SearchEngineSettings => ({
  version: 1,
  engine: DEFAULT_ENGINE.id,
  custom: null,
});

const MAX_TEMPLATE = 500;
const MAX_NAME = 40;

// Is this a usable search address? An ordinary https address (no sign-in name or
// password in it) with %s where the words go.
export function isValidTemplate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_TEMPLATE) return false;
  if (!value.includes('%s')) return false;
  try {
    const url = new URL(value.split('%s').join('x'));
    return (
      url.protocol === 'https:' &&
      url.hostname !== '' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

const cleanName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return name === '' ? null : name;
};

const validCustom = (value: unknown): CustomEngine | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { name, template } = value as Record<string, unknown>;
  const clean = cleanName(name);
  return clean !== null && isValidTemplate(template)
    ? { name: clean, template }
    : null;
};

// Turn whatever is on disk into valid settings. Never throws.
export function parseSearchEngineSettings(raw: unknown): SearchEngineSettings {
  const settings = defaultSearchEngineSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const { engine, custom } = raw as Record<string, unknown>;
  settings.custom = validCustom(custom);
  if (ENGINES.some((e) => e.id === engine)) settings.engine = engine as string;
  else if (engine === 'custom' && settings.custom) settings.engine = 'custom';
  return settings;
}

// Change settings: pick an engine, and/or set (or, with null, remove) the custom
// one. Anything unexpected is ignored. Picking "custom" needs one to be set.
export function withSearchEngine(
  settings: SearchEngineSettings,
  changes: unknown,
): SearchEngineSettings {
  if (typeof changes !== 'object' || changes === null) return settings;
  const { engine, custom } = changes as Record<string, unknown>;
  let next = settings;
  if (custom === null) {
    next = {
      ...next,
      custom: null,
      engine: next.engine === 'custom' ? DEFAULT_ENGINE.id : next.engine,
    };
  } else if (custom !== undefined) {
    const valid = validCustom(custom);
    if (valid) next = { ...next, custom: valid };
  }
  if (typeof engine === 'string') {
    if (ENGINES.some((e) => e.id === engine)) next = { ...next, engine };
    else if (engine === 'custom' && next.custom) {
      next = { ...next, engine: 'custom' };
    }
  }
  return next;
}

// The engine in use.
export function activeEngine(settings: SearchEngineSettings): Engine {
  if (settings.engine === 'custom' && settings.custom) {
    return { id: 'custom', ...settings.custom };
  }
  return ENGINES.find((e) => e.id === settings.engine) ?? DEFAULT_ENGINE;
}

// The address of a search for some text.
export const fillTemplate = (template: string, text: string): string =>
  template.split('%s').join(encodeURIComponent(text));

// Where a new tab opens: the home page of the search engine in use (the front of
// its search address, such as "https://www.google.com/").
export function engineHome(engine: Engine): string {
  try {
    return new URL(engine.template.split('%s').join('')).origin + '/';
  } catch {
    return DEFAULT_ENGINE.template.split('/?')[0] + '/';
  }
}
