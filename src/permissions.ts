// What websites may do: use the camera, microphone, location, send notifications or
// read the clipboard. Like Chrome, a site that asks gets a small question, and the
// answer can be remembered for that site. Everything else (USB, serial, MIDI...)
// is always refused. Saved to permissions.json. Pure data and functions, so it is
// easy to test.

// The things a site can be asked about.
export type AskKind =
  | 'camera'
  | 'microphone'
  | 'location'
  | 'notifications'
  | 'clipboard';

export const ASK_KINDS: AskKind[] = [
  'camera',
  'microphone',
  'location',
  'notifications',
  'clipboard',
];

export type Answer = 'allow' | 'block';

export interface PermissionsState {
  version: 1;
  // What you answered for each site (its address up to the host and port), by kind.
  sites: Record<string, Partial<Record<AskKind, Answer>>>;
}

export const defaultPermissions = (): PermissionsState => ({
  version: 1,
  sites: {},
});

const MAX_SITES = 500;

// Harmless things that are always fine for a page to do.
const ALWAYS_ALLOWED = new Set([
  'clipboard-sanitized-write',
  'fullscreen',
  'pointerLock',
  'keyboardLock',
  'speaker-selection',
  'mediaKeySystem',
  'persistent-storage',
  'background-sync',
]);

// What to do with a permission request from Electron: allow it, refuse it, or ask
// about these kinds (all of them must be allowed). Anything not known is refused.
export type Verdict =
  | { verdict: 'allow' }
  | { verdict: 'block' }
  | { verdict: 'ask'; kinds: AskKind[] };

export function classify(
  permission: string,
  mediaTypes: readonly string[] = [],
): Verdict {
  if (ALWAYS_ALLOWED.has(permission)) return { verdict: 'allow' };
  switch (permission) {
    case 'media': {
      const kinds: AskKind[] = [];
      if (mediaTypes.includes('video')) kinds.push('camera');
      if (mediaTypes.includes('audio')) kinds.push('microphone');
      return kinds.length > 0
        ? { verdict: 'ask', kinds }
        : { verdict: 'block' };
    }
    case 'geolocation':
      return { verdict: 'ask', kinds: ['location'] };
    case 'notifications':
      return { verdict: 'ask', kinds: ['notifications'] };
    case 'clipboard-read':
    case 'deprecated-sync-clipboard-read':
      return { verdict: 'ask', kinds: ['clipboard'] };
    default:
      return { verdict: 'block' };
  }
}

// The site a page belongs to, as the key permissions are saved under: its address
// up to the host and port. Only secure sites (https, or this computer) can be asked
// about anything; others get null, and so are refused.
export function siteKey(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const local =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return null;
  }
  return url.origin;
}

// What is remembered for a site and kind: allow, block, or null (ask).
export function answerFor(
  state: PermissionsState,
  site: string,
  kind: AskKind,
): Answer | null {
  return state.sites[site]?.[kind] ?? null;
}

// All the kinds together: block if any is blocked, allow if all are allowed,
// otherwise the ones still to ask about.
export function decide(
  state: PermissionsState,
  site: string | null,
  kinds: AskKind[],
):
  | { verdict: 'allow' }
  | { verdict: 'block' }
  | { verdict: 'ask'; kinds: AskKind[] } {
  if (site === null) return { verdict: 'block' };
  const answers = kinds.map((kind) => answerFor(state, site, kind));
  if (answers.includes('block')) return { verdict: 'block' };
  const unanswered = kinds.filter((_kind, i) => answers[i] === null);
  return unanswered.length === 0
    ? { verdict: 'allow' }
    : { verdict: 'ask', kinds: unanswered };
}

// Remember an answer for a site (answer null forgets it).
export function setAnswer(
  state: PermissionsState,
  site: string,
  kind: AskKind,
  answer: Answer | null,
): PermissionsState {
  const current = { ...state.sites[site] };
  if (answer === null) delete current[kind];
  else current[kind] = answer;
  const sites = { ...state.sites };
  if (Object.keys(current).length === 0) delete sites[site];
  else {
    delete sites[site]; // so the newest answer is last, and the oldest drop first
    sites[site] = current;
  }
  const keys = Object.keys(sites);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SITES))) {
    delete sites[old];
  }
  return { ...state, sites };
}

// Forget everything about one site.
export function resetSite(
  state: PermissionsState,
  site: string,
): PermissionsState {
  if (!(site in state.sites)) return state;
  const sites = { ...state.sites };
  delete sites[site];
  return { ...state, sites };
}

// Turn whatever is on disk into valid permissions. Never throws.
export function parsePermissions(raw: unknown): PermissionsState {
  const state = defaultPermissions();
  if (typeof raw !== 'object' || raw === null) return state;
  const sites = (raw as { sites?: unknown }).sites;
  if (typeof sites !== 'object' || sites === null || Array.isArray(sites)) {
    return state;
  }
  for (const [site, entry] of Object.entries(sites)) {
    if (siteKey(site) !== site) continue;
    if (typeof entry !== 'object' || entry === null) continue;
    const kept: Partial<Record<AskKind, Answer>> = {};
    for (const kind of ASK_KINDS) {
      const answer = (entry as Record<string, unknown>)[kind];
      if (answer === 'allow' || answer === 'block') kept[kind] = answer;
    }
    if (Object.keys(kept).length > 0) state.sites[site] = kept;
  }
  const keys = Object.keys(state.sites);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SITES))) {
    delete state.sites[old];
  }
  return state;
}

const KIND_WORDS: Record<AskKind, string> = {
  camera: 'use your camera',
  microphone: 'use your microphone',
  location: 'know your location',
  notifications: 'show notifications',
  clipboard: 'see text you copied',
};

// "docs.example.com wants to use your camera and microphone".
export function askText(host: string, kinds: AskKind[]): string {
  const words = kinds.map((kind) => KIND_WORDS[kind]);
  // Camera and microphone read as one: "use your camera and microphone".
  const joined =
    kinds.includes('camera') && kinds.includes('microphone')
      ? [
          'use your camera and microphone',
          ...words.filter(
            (_w, i) => kinds[i] !== 'camera' && kinds[i] !== 'microphone',
          ),
        ]
      : words;
  return `${host} wants to ${joined.join(' and ')}`;
}
