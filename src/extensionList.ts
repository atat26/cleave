// The browser extensions you added: which ones, whether each is on, and what each
// asked for (so it can be shown in plain words before you say yes). Saved to
// extensions.json. Pure data and functions, so it is easy to test; the part that
// talks to Electron is extensionManager.ts.

export interface ExtensionRecord {
  // The folder it was copied into (inside the app's own data), like "ext-3".
  key: string;
  // Chrome's id for it, known once it has been loaded.
  id: string | null;
  name: string;
  version: string;
  enabled: boolean;
  // Its button sits in the toolbar (otherwise it is only in the puzzle menu).
  pinned: boolean;
  // It has a button at all (an "action" in its manifest).
  hasAction: boolean;
  // Its settings page inside the extension's folder ("options.html"), or null.
  optionsPage: string | null;
  // Where it came from: a folder you picked (copied into the app's data), or the
  // Chrome Web Store (kept up to date, in the store library's own folder).
  source: 'folder' | 'store';
  // A note shown on its row: it was updated and now asks for more access, so it
  // was switched off until you say yes.
  review: string | null;
  addedAt: number;
  manifestVersion: 2 | 3;
  // What its manifest asks for.
  permissions: string[];
  hostPermissions: string[];
}

export interface ExtensionsState {
  version: 1;
  nextKey: number;
  items: ExtensionRecord[];
}

export const defaultExtensions = (): ExtensionsState => ({
  version: 1,
  nextKey: 1,
  items: [],
});

export const MAX_EXTENSIONS = 100;
const MAX_TEXT = 200;
const MAX_PERMISSIONS = 100;

const cleanText = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  return text === '' ? fallback : text;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.slice(0, 200))
        .slice(0, MAX_PERMISSIONS)
    : [];

// ---- A manifest, read safely ---------------------------------------------------

export interface ParsedManifest {
  name: string;
  version: string;
  manifestVersion: 2 | 3;
  permissions: string[];
  hostPermissions: string[];
  // The folder's own default language, for names like "__MSG_extName__".
  defaultLocale: string | null;
  // Does it have a toolbar button (an "action" or "browser_action")?
  hasAction: boolean;
  optionsPage: string | null;
}

// Read an extension's manifest.json (already parsed from text). Only manifest
// versions 2 and 3 with a name are taken. Never throws.
export function parseManifest(raw: unknown): ParsedManifest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.manifest_version !== 2 && m.manifest_version !== 3) return null;
  if (typeof m.name !== 'string' || m.name.trim() === '') return null;
  const all = strings(m.permissions);
  // In version 2, sites are listed among the permissions.
  // The sites its page scripts run on count too: a script there can read and change the page,
  // whatever "permissions" says. (The extension gate reads the manifest itself, so this list
  // is only what is shown and compared.)
  const scripts = Array.isArray(m.content_scripts)
    ? m.content_scripts.flatMap((c: unknown) =>
        typeof c === 'object' && c !== null
          ? strings((c as { matches?: unknown }).matches).filter(isHostPattern)
          : [],
      )
    : [];
  const hosts = [
    ...strings(m.host_permissions),
    ...all.filter((p) => isHostPattern(p)),
    ...scripts,
  ];
  return {
    name: m.name.slice(0, MAX_TEXT),
    version: cleanText(m.version, '0'),
    manifestVersion: m.manifest_version,
    permissions: all.filter((p) => !isHostPattern(p)),
    hostPermissions: [...new Set(hosts)],
    optionsPage: optionsPageOf(m),
    hasAction:
      (typeof m.action === 'object' && m.action !== null) ||
      (typeof m.browser_action === 'object' && m.browser_action !== null),
    defaultLocale:
      typeof m.default_locale === 'string' &&
      /^[A-Za-z_]{2,10}$/.test(m.default_locale)
        ? m.default_locale
        : null,
  };
}

// The settings page from a manifest (options_page, or options_ui.page): a plain
// path inside the extension's folder, never a web address or a path going up.
export function cleanOptionsPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.replace(/^\.?\//, '');
  if (path === '' || path.length > 200) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/')) return null;
  if (path.includes('\\') || path.split('/').some((part) => part === '..')) {
    return null;
  }
  if (/[\u0000-\u001f?#]/.test(path)) return null;
  return path;
}
const optionsPageOf = (m: Record<string, unknown>): string | null => {
  const ui = m.options_ui;
  return (
    cleanOptionsPath(m.options_page) ??
    cleanOptionsPath(
      typeof ui === 'object' && ui !== null
        ? (ui as { page?: unknown }).page
        : undefined,
    )
  );
};

const isHostPattern = (p: string): boolean =>
  p === '<all_urls>' || /^(\*|https?|file|ftp|wss?):\/\//.test(p);

// A name like "__MSG_extName__" looked up in the extension's messages.json (the
// text of that file, already parsed). Anything else is returned as it is.
export function resolveMessage(text: string, messages: unknown): string {
  const m = /^__MSG_([A-Za-z0-9_@]+)__$/.exec(text);
  if (!m || typeof messages !== 'object' || messages === null) return text;
  const wanted = m[1].toLowerCase();
  for (const [key, value] of Object.entries(messages)) {
    if (key.toLowerCase() !== wanted) continue;
    const message = (value as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.trim() !== '') {
      return message.slice(0, MAX_TEXT);
    }
  }
  return text;
}

// ---- What it asks for, in plain words --------------------------------------------

const WORDS: Record<string, string> = {
  tabs: 'See the addresses and titles of your tabs',
  cookies: 'Read and change cookies',
  history: 'Read your browsing history',
  bookmarks: 'Read and change your bookmarks',
  downloads: 'Manage your downloads',
  clipboardRead: 'Read what you copy',
  clipboardWrite: 'Put things on your clipboard',
  notifications: 'Show notifications',
  contextMenus: 'Add items to the right-click menu',
  webRequest: 'Watch and change the requests your pages make',
  webRequestBlocking: 'Block or change the requests your pages make',
  declarativeNetRequest: 'Block or change the requests your pages make',
  nativeMessaging: 'Talk to programs on your computer',
  management: 'See and manage your other extensions',
  geolocation: 'Know your location',
  proxy: 'Control your internet connection settings',
  privacy: 'Change privacy settings',
  topSites: 'See the sites you visit most',
  identity: 'Sign in with your accounts',
  debugger: 'Control other pages (a very powerful permission)',
  scripting: 'Run code in the pages you visit',
  webNavigation: 'See the pages you open and where you go',
  tabCapture: 'Record what is shown in a tab',
  desktopCapture: 'Record your screen',
  pageCapture: 'Save copies of the pages you visit',
  browsingData: 'Clear your browsing data',
  sessions: 'See your recently closed tabs',
  readingList: 'Read and change your reading list',
  activeTab: 'Use the page you are on when you click its button',
  'system.cpu': 'See details of your computer',
  'system.memory': 'See details of your computer',
  'system.storage': 'See details of your computer',
  contentSettings: 'Change what sites may do (cameras, scripts, pop-ups)',
  webAuthenticationProxy: 'Take part in sign-ins with security keys',
  enterprise: 'Use enterprise device features',
  offscreen: 'Open hidden pages in the background',
  sidePanel: 'Show a side panel',
  userScripts: 'Run its own code in the pages you visit',
  gcm: 'Receive messages from the internet in the background',
};

// Permissions that matter little: nothing is said about them (they cannot reach your data).
const QUIET = new Set([
  'storage',
  'unlimitedStorage',
  'alarms',
  'idle',
  'power',
  'fontSettings',
  'background',
  'tts',
  'ttsEngine',
  'search',
  'favicon',
  'declarativeContent',
  'declarativeNetRequestFeedback',
  'declarativeNetRequestWithHostAccess',
  'printerProvider',
  'wallpaper',
  'theme',
]);

const isAllSites = (host: string): boolean =>
  host === '<all_urls>' ||
  /^(\*|https?):\/\/(\*|\*\.\*)\//.test(host) ||
  host === '*://*/*' ||
  host === 'http://*/*' ||
  host === 'https://*/*';

// A list of plain sentences about what the extension can do.
export function describePermissions(
  record: Pick<ExtensionRecord, 'permissions' | 'hostPermissions'>,
): string[] {
  const lines: string[] = [];
  const hosts = record.hostPermissions;
  if (hosts.some(isAllSites)) {
    lines.push('Read and change your data on all websites');
  } else if (hosts.length > 0) {
    const names = [
      ...new Set(
        hosts.map((h) => h.replace(/^[a-z*]+:\/\//, '').replace(/\/.*$/, '')),
      ),
    ];
    lines.push(
      `Read and change your data on ${
        names.length <= 3 ? names.join(', ') : `${names.length} websites`
      }`,
    );
  }
  for (const permission of record.permissions) {
    if (QUIET.has(permission)) continue;
    // One it has no words for is shown by its own name, never left out.
    const words =
      WORDS[permission] ?? `Also asks for "${permission.slice(0, 40)}"`;
    if (!lines.includes(words)) lines.push(words);
  }
  return lines;
}

// ---- The list ---------------------------------------------------------------------

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && /^ext-\d{1,6}$/.test(value);

// Turn whatever is on disk into a valid list. Never throws.
export function parseExtensions(raw: unknown): ExtensionsState {
  const state = defaultExtensions();
  if (typeof raw !== 'object' || raw === null) return state;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return state;
  const seen = new Set<string>();
  let highest = 0;
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const i = item as Record<string, unknown>;
    if (!isKey(i.key) || seen.has(i.key)) continue;
    if (i.manifestVersion !== 2 && i.manifestVersion !== 3) continue;
    seen.add(i.key);
    highest = Math.max(highest, Number(i.key.slice(4)));
    state.items.push({
      key: i.key,
      id: typeof i.id === 'string' && /^[a-p]{32}$/.test(i.id) ? i.id : null,
      name: cleanText(i.name, 'Extension'),
      version: cleanText(i.version, '0'),
      enabled: i.enabled !== false,
      pinned: i.pinned !== false,
      hasAction: i.hasAction === true,
      optionsPage: cleanOptionsPath(i.optionsPage),
      source: i.source === 'store' ? 'store' : 'folder',
      review:
        typeof i.review === 'string' && i.review.trim() !== ''
          ? i.review.trim().slice(0, 300)
          : null,
      addedAt:
        typeof i.addedAt === 'number' && Number.isFinite(i.addedAt)
          ? i.addedAt
          : 0,
      manifestVersion: i.manifestVersion,
      permissions: strings(i.permissions),
      hostPermissions: strings(i.hostPermissions),
    });
  }
  state.items = state.items.slice(0, MAX_EXTENSIONS);
  state.nextKey = Math.max(
    highest + 1,
    typeof (raw as { nextKey?: unknown }).nextKey === 'number'
      ? Math.trunc((raw as { nextKey: number }).nextKey)
      : 1,
    1,
  );
  return state;
}

// The folder name the next extension will be copied into.
export const nextFolderKey = (state: ExtensionsState): string =>
  `ext-${state.nextKey}`;

// Add an extension (its folder is `nextFolderKey(state)`).
export function addExtension(
  state: ExtensionsState,
  manifest: ParsedManifest,
  now: number,
): { state: ExtensionsState; key: string } | null {
  if (state.items.length >= MAX_EXTENSIONS) return null;
  const key = nextFolderKey(state);
  return {
    key,
    state: {
      ...state,
      nextKey: state.nextKey + 1,
      items: [
        ...state.items,
        {
          key,
          id: null,
          name: manifest.name,
          version: manifest.version,
          enabled: true,
          // New extensions start in the toolbar, so they are easy to find.
          pinned: true,
          hasAction: manifest.hasAction,
          optionsPage: manifest.optionsPage,
          source: 'folder',
          review: null,
          addedAt: now,
          manifestVersion: manifest.manifestVersion,
          permissions: manifest.permissions,
          hostPermissions: manifest.hostPermissions,
        },
      ],
    },
  };
}

// ---- Extensions from the Chrome Web Store ----------------------------------------

// The store library keeps each version in a folder named like "1.2.3_0". Of the
// names in an extension's folder, the newest version (or null if none fits).
export function latestVersionDir(names: string[]): string | null {
  let best: { name: string; parts: number[] } | null = null;
  for (const name of names) {
    const m = /^(\d{1,9}(?:\.\d{1,9}){0,3})_\d{1,4}$/.exec(name);
    if (!m) continue;
    const parts = m[1].split('.').map(Number);
    if (best === null || compareParts(parts, best.parts) > 0) {
      best = { name, parts };
    }
  }
  return best?.name ?? null;
}

const compareParts = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

// Does the newer manifest ask for something the older one did not?
export function grewPermissions(
  before: Pick<ExtensionRecord, 'permissions' | 'hostPermissions'>,
  after: Pick<ExtensionRecord, 'permissions' | 'hostPermissions'>,
): boolean {
  const had = new Set([...before.permissions, ...before.hostPermissions]);
  return [...after.permissions, ...after.hostPermissions].some(
    (p) => !had.has(p),
  );
}

// An extension the store library has installed or updated (it is loaded now, with
// this id). A new one is added; one we know has its version and wishes brought up
// to date, and if it now asks for more access it is switched off with a note until
// you agree. Returns what happened.
export function upsertStoreExtension(
  state: ExtensionsState,
  id: string,
  manifest: ParsedManifest,
  now: number,
): {
  state: ExtensionsState;
  key: string;
  added: boolean;
  needsReview: boolean;
} | null {
  if (!/^[a-p]{32}$/.test(id)) return null;
  const existing = state.items.find((e) => e.id === id && e.source === 'store');
  if (!existing) {
    const added = addExtension(state, manifest, now);
    if (!added) return null;
    return {
      key: added.key,
      added: true,
      needsReview: false,
      state: {
        ...added.state,
        items: added.state.items.map((e) =>
          e.key === added.key ? { ...e, id, source: 'store' } : e,
        ),
      },
    };
  }
  const grew =
    existing.version !== manifest.version &&
    grewPermissions(existing, manifest);
  const updated: ExtensionRecord = {
    ...existing,
    name: manifest.name,
    version: manifest.version,
    hasAction: manifest.hasAction,
    optionsPage: manifest.optionsPage,
    manifestVersion: manifest.manifestVersion,
    permissions: manifest.permissions,
    hostPermissions: manifest.hostPermissions,
    enabled: grew ? false : existing.enabled,
    review: grew
      ? 'Updated, and it now asks for more access. Turn it on to review and accept.'
      : existing.review,
  };
  return {
    key: existing.key,
    added: false,
    needsReview: grew,
    state: {
      ...state,
      items: state.items.map((e) => (e.key === existing.key ? updated : e)),
    },
  };
}

export const removeExtension = (
  state: ExtensionsState,
  key: string,
): ExtensionsState =>
  state.items.some((e) => e.key === key)
    ? { ...state, items: state.items.filter((e) => e.key !== key) }
    : state;

export function updateExtension(
  state: ExtensionsState,
  key: string,
  changes: Partial<
    Pick<ExtensionRecord, 'enabled' | 'id' | 'pinned' | 'review'>
  >,
): ExtensionsState {
  if (!state.items.some((e) => e.key === key)) return state;
  return {
    ...state,
    items: state.items.map((e) => (e.key === key ? { ...e, ...changes } : e)),
  };
}
