// Which websites the assistant may act on freely, and which it may never touch. Pure code with no
// Electron, so it is easy to test.
//
//   Trusted  - you vouch for the site: typing, filling forms, clicking and moving within it go ahead
//              without a card (a step that cannot be undone, like a Buy button, still asks).
//   Unknown  - every site you have not decided about (the default): your standing settings for those
//              actions are held at "Ask" here, while "Allow the rest of this reply" still works.
//   Blocked  - the assistant does not read, act on or go to the site at all.
//
// A site is exactly what is in the address bar after "https://": "www.example.com" is not
// "example.com". Only you can change this list (the Settings page, the site panel, or a button on a
// card). Nothing the assistant reads, and nothing the assistant does, can add a site.

export type SiteTrust = 'trusted' | 'unknown' | 'blocked';
export type SiteChoice = 'trusted' | 'blocked';

export interface SiteTrustState {
  version: 1;
  sites: Record<string, SiteChoice>;
}

export const MAX_SITES = 500;

export const defaultSiteTrust = (): SiteTrustState => ({
  version: 1,
  sites: {},
});

// A site name from whatever you typed or pasted ("Example.com", "https://www.example.com/a/b?q=1"):
// the host as the browser writes it (lower case, with a port only if it is not the default), or null.
export function normalizeSite(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (text === '' || text.length > 300) return null;
  // No spaces or characters that never belong in a host name.
  if (/[\s<>"'`\\|^{}*@]/.test(text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''))) {
    // "https://user@host" and the like are refused, and so are wildcards.
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  const host = url.host;
  if (host === '' || host.length > 253) return null;
  // A name with a dot, or "localhost", or an address: not a bare word like "com".
  const name = url.hostname;
  if (!name.includes('.') && !name.includes(':') && name !== 'localhost') {
    return null;
  }
  return host;
}

const isChoice = (value: unknown): value is SiteChoice =>
  value === 'trusted' || value === 'blocked';

// Turn whatever is on disk into a valid list. Never throws.
export function parseSiteTrust(raw: unknown): SiteTrustState {
  const state = defaultSiteTrust();
  if (typeof raw !== 'object' || raw === null) return state;
  const sites = (raw as Record<string, unknown>).sites;
  if (typeof sites !== 'object' || sites === null || Array.isArray(sites)) {
    return state;
  }
  for (const [key, value] of Object.entries(sites)) {
    if (Object.keys(state.sites).length >= MAX_SITES) break;
    // Only a site written exactly the way the browser writes it.
    if (normalizeSite(key) === key && isChoice(value)) {
      state.sites[key] = value;
    }
  }
  return state;
}

// What the assistant may do on this site. `host` is as in a web address (with the port, if any).
export function trustOf(state: SiteTrustState, host: string): SiteTrust {
  if (typeof host !== 'string') return 'unknown';
  const choice = Object.hasOwn(state.sites, host.toLowerCase())
    ? state.sites[host.toLowerCase()]
    : undefined;
  return choice ?? 'unknown';
}

export type SetResult =
  | { ok: true; state: SiteTrustState; host: string }
  | { ok: false; error: string };

// Set a site to trusted or blocked, or back to unknown (which removes it from the list).
export function withSiteTrust(
  state: SiteTrustState,
  input: unknown,
  level: SiteTrust,
): SetResult {
  const host = normalizeSite(input);
  if (host === null) {
    return {
      ok: false,
      error: 'That is not a website address. Use a name like www.example.com.',
    };
  }
  if (level !== 'trusted' && level !== 'blocked' && level !== 'unknown') {
    return { ok: false, error: 'That is not a choice.' };
  }
  const sites = { ...state.sites };
  if (level === 'unknown') {
    delete sites[host];
  } else {
    if (!(host in sites) && Object.keys(sites).length >= MAX_SITES) {
      return {
        ok: false,
        error: `The list is full (${MAX_SITES} sites). Remove one first.`,
      };
    }
    sites[host] = level;
  }
  return { ok: true, state: { version: 1, sites }, host };
}

export type SiteTrustRow = { host: string; level: SiteChoice };

// The list, sorted by name.
export const siteTrustRows = (state: SiteTrustState): SiteTrustRow[] =>
  Object.entries(state.sites)
    .map(([host, level]) => ({ host, level }))
    .sort((a, b) => a.host.localeCompare(b.host));

// ---- Text the assistant types --------------------------------------------------------------

// Characters that show nothing (or reorder what is shown): format marks, tag characters, variation
// selectors, fillers, private-use and control characters. A new line and a tab are kept, and so are
// the two joiners that real writing needs (see `kept` below).
const EXTRA_HIDDEN = [0x115f, 0x1160, 0x3164, 0xffa0, 0x180e, 0x034f, 0x2800];
const extraClass = EXTRA_HIDDEN.map((c) => `\\u{${c.toString(16)}}`).join('');
const HIDDEN = new RegExp(
  `^(?:[\\p{Cf}\\p{Variation_Selector}\\p{Co}${extraClass}]|[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f])$`,
  'u',
);
const LETTERISH = /[\p{L}\p{M}\p{Extended_Pictographic}]/u;
const EMOJI_BASE = /[\p{Extended_Pictographic}#*0-9\u{20e3}]/u;

// A hidden character that is part of real writing, so it stays:
//  - the zero-width joiner and non-joiner (U+200D, U+200C) between two letters or emoji: Persian and
//    other scripts need the non-joiner, and family and flag emoji are made with the joiner;
//  - the emoji presentation mark (U+FE0F) right after an emoji (or a digit or # or * for a keycap).
// Anywhere else (next to another one, at the start or end, after a space) they carry nothing but a
// hidden message, so they go.
function kept(chars: string[], i: number): boolean {
  const ch = chars[i];
  if (ch === '\u200c' || ch === '\u200d') {
    const before = chars[i - 1];
    const after = chars[i + 1];
    return (
      before !== undefined &&
      after !== undefined &&
      LETTERISH.test(before) &&
      LETTERISH.test(after)
    );
  }
  if (ch === '\ufe0f') {
    const before = chars[i - 1];
    return before !== undefined && EMOJI_BASE.test(before);
  }
  return false;
}

// The text as it will be typed: without anything you could not see on a card. (The card shows this
// same text, so what you approve is what is typed.)
export function visibleText(text: string): string {
  const chars = Array.from(text.replace(/\r\n?/g, '\n'));
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    if (!HIDDEN.test(chars[i]) || kept(chars, i)) out += chars[i];
  }
  return out;
}
