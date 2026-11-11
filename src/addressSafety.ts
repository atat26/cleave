// Which web addresses the assistant may read in its hidden window, and which of
// those it must ask you about. Pure code with no Electron or network: the app does
// the real network checks (the actual address a server answers from) separately, but
// every rule that can be decided from the address itself lives here, so it is easy
// to test against a long list of tricky addresses.
//
// Two jobs:
//   1. Keep it OFF your own network. Addresses that point at your computer, your home
//      or office network, or the machine's cloud metadata service are refused,
//      however they are spelled.
//   2. Tell apart addresses that came from somewhere real (a linked tab, a search
//      result, a link on a page) from ones the assistant wrote itself. A made-up
//      address could carry private information out in its query, so it always asks.

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const MAX_ADDRESS = 2000;

// Names that only mean something on a private network.
const PRIVATE_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.intranet',
  '.localdomain',
  '.home.arpa',
  '.private',
];

// ---- IP addresses ---------------------------------------------------------------

function parseIpv4(text: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts as [number, number, number, number];
}

// Is this an ordinary public internet address? (Not private, loopback, link-local,
// shared, documentation, multicast or reserved.)
function isPublicIpv4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // this host, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // shared (carrier-grade NAT)
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // reserved, documentation
  if (a === 192 && b === 88 && c === 99) return false; // old 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  if (a >= 224) return false; // multicast and reserved, including broadcast
  return true;
}

// Eight 16-bit groups, or null if the text is not a valid IPv6 address.
function parseIpv6(text: string): number[] | null {
  let s = text.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  // A dotted IPv4 ending (::ffff:1.2.3.4) becomes two groups.
  if (s.includes('.')) {
    const colon = s.lastIndexOf(':');
    const v4 = parseIpv4(s.slice(colon + 1));
    if (!v4) return null;
    s = `${s.slice(0, colon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === '' ? [] : part.split(':'));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const all = [...head, ...tail];
  if (!all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    if (head.length + tail.length > 7) return null;
    groups = [
      ...head,
      ...Array<string>(8 - head.length - tail.length).fill('0'),
      ...tail,
    ];
  }
  return groups.map((g) => Number.parseInt(g, 16));
}

function isPublicIpv6(g: number[]): boolean {
  const zeros = (from: number, to: number) =>
    g.slice(from, to).every((x) => x === 0);
  const embedded = (
    hi: number,
    lo: number,
  ): [number, number, number, number] => [
    hi >> 8,
    hi & 0xff,
    lo >> 8,
    lo & 0xff,
  ];
  if (zeros(0, 8)) return false; // ::
  if (zeros(0, 7) && g[7] === 1) return false; // ::1
  if (zeros(0, 5) && g[5] === 0xffff) return isPublicIpv4(embedded(g[6], g[7])); // mapped IPv4
  if (zeros(0, 6)) return false; // old IPv4-compatible form
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) {
    return isPublicIpv4(embedded(g[6], g[7])); // NAT64: the IPv4 inside decides
  }
  if (g[0] === 0x2002) return isPublicIpv4(embedded(g[1], g[2])); // 6to4
  if ((g[0] & 0xe000) !== 0x2000) return false; // only global addresses (2000::/3)
  if (g[0] === 0x2001 && g[1] <= 0x01ff) return false; // protocol assignments, Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return true;
}

// Is this IP address (as text, IPv4 or IPv6) an ordinary public one? Used on the
// address a server actually answered from, as well as on addresses in links.
export function isPublicIp(ip: string): boolean {
  const text = ip.trim().replace(/^\[|\]$/g, '');
  if (text.includes(':')) {
    const groups = parseIpv6(text);
    return groups !== null && isPublicIpv6(groups);
  }
  const v4 = parseIpv4(text);
  return v4 !== null && isPublicIpv4(v4);
}

// ---- Host names -----------------------------------------------------------------

// Can this host name possibly be a public website? (No lookup is done here: the app
// also checks what the name really points at.)
export function isPublicHostname(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (host === '') return false;
  if (host.includes(':')) return isPublicIp(host); // an IPv6 address
  // An address written as numbers (the URL reader has already turned odd forms such
  // as 0x7f.1 or 2130706433 into a plain a.b.c.d).
  if (/^[\d.]+$/.test(host)) return isPublicIp(host);
  if (host === 'localhost') return false;
  if (!host.includes('.')) return false; // a single word is a local name
  if (PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return false;
  // Letters, digits and dashes in each part, and a real ending (letters, or the
  // xn-- form of an international one).
  const labels = host.split('.');
  if (
    !labels.every(
      (l) =>
        /^[a-z0-9-]{1,63}$/.test(l) && !l.startsWith('-') && !l.endsWith('-'),
    )
  ) {
    return false;
  }
  const last = labels[labels.length - 1];
  return /^[a-z]{2,}$/.test(last) || /^xn--[a-z0-9-]+$/.test(last);
}

// ---- Whole addresses ------------------------------------------------------------

export type AddressCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

// May this address be read at all? http or https, no username or password, an
// ordinary port, and a host that is not on a private network.
export function checkPublicAddress(raw: unknown): AddressCheck {
  if (typeof raw !== 'string' || raw === '' || raw.length > MAX_ADDRESS) {
    return { ok: false, reason: 'That is not a usable web address.' };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'That is not a usable web address.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https addresses can be read.' };
  }
  if (url.username !== '' || url.password !== '') {
    return {
      ok: false,
      reason: 'Addresses with a username or password cannot be read.',
    };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return { ok: false, reason: 'Only the normal web ports can be used.' };
  }
  if (!isPublicHostname(url.hostname)) {
    return {
      ok: false,
      reason:
        'That address is on a private network or a local name, so it cannot be read.',
    };
  }
  return { ok: true, url };
}

// ---- Where an address came from -------------------------------------------------

// Addresses the assistant has seen from real sources in this conversation: a linked
// tab, a search result, a link on a page. An address that matches one of these
// exactly is "known". `bare` holds addresses whose query part was never available
// (a link listed in a page's controls shows its path only).
export interface KnownAddresses {
  exact: Set<string>;
  bare: Set<string>;
}

export const emptyKnown = (): KnownAddresses => ({
  exact: new Set(),
  bare: new Set(),
});

// An address in one standard form, so two spellings of the same page match. The
// part after # is dropped (it is only a place on the page).
export function normalizeAddress(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
}

const withoutQuery = (normalized: string) => {
  const q = normalized.indexOf('?');
  return q < 0 ? normalized : normalized.slice(0, q);
};

// Remember an address from a real source. `complete` is false when only the part
// before the query is known.
export function addKnown(
  known: KnownAddresses,
  raw: string,
  complete = true,
): void {
  const normalized = normalizeAddress(raw);
  if (normalized === null) return;
  if (complete) known.exact.add(normalized);
  known.bare.add(withoutQuery(normalized));
}

export type ReadLinkCheck =
  | { ok: false; reason: string }
  // `known` is true when the address matches one seen from a real source; an
  // unknown address is risky and always asks.
  | { ok: true; url: URL; known: boolean };

export function checkReadLink(
  raw: unknown,
  known: KnownAddresses,
): ReadLinkCheck {
  const checked = checkPublicAddress(raw);
  if (!checked.ok) return checked;
  const normalized = normalizeAddress(checked.url.href);
  if (normalized === null)
    return { ok: false, reason: 'That is not a usable web address.' };
  const isKnown =
    known.exact.has(normalized) ||
    // An address with no query can only match one whose query was never known.
    (checked.url.search === '' && known.bare.has(normalized));
  return { ok: true, url: checked.url, known: isKnown };
}
