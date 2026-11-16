// Which sites have saved cookies on this computer, for Settings > Privacy and
// security (so you can clear one site's data). Pure code with no Electron, so it is
// easy to test.

export interface SiteDataRow {
  // The site's name, without a leading dot or "www." (cookies of "www.a.com" and
  // ".a.com" are both "a.com").
  host: string;
  cookies: number;
}

// Group cookies by site, by name.
export function siteDataRows(
  cookies: readonly { domain?: string }[],
): SiteDataRow[] {
  const counts = new Map<string, number>();
  for (const cookie of cookies) {
    const host = siteOfCookieDomain(cookie.domain);
    if (host === null) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return [...counts]
    .map(([host, count]) => ({ host, cookies: count }))
    .sort((a, b) => a.host.localeCompare(b.host));
}

// The site a cookie's domain belongs to (or null if it has no usable name).
export function siteOfCookieDomain(domain: string | undefined): string | null {
  const host = (domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/^www\./, '');
  return /^[a-z0-9.-]+$/.test(host) && host !== '' ? host : null;
}

// Does this cookie belong to the site? (Its domain is the site, with or without a
// leading dot or "www.".)
export const cookieIsOfSite = (
  cookie: { domain?: string },
  host: string,
): boolean => siteOfCookieDomain(cookie.domain) === host;

// The words under a site: "3 cookies".
export const cookieWords = (count: number): string =>
  `${count} ${count === 1 ? 'cookie' : 'cookies'}`;

// Two-part endings where the main site is one label further in ("bbc.co.uk"). (A
// short list of the common ones; the full public list is not built in.)
const TWO_PART_ENDINGS = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'net.uk',
  'sch.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'co.nz',
  'org.nz',
  'net.nz',
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'co.in',
  'net.in',
  'org.in',
  'com.br',
  'net.br',
  'org.br',
  'com.cn',
  'net.cn',
  'org.cn',
  'com.mx',
  'com.tr',
  'com.sg',
  'com.hk',
  'com.tw',
  'co.za',
  'co.kr',
  'or.kr',
  'com.ar',
  'com.co',
  'co.id',
  'com.my',
  'com.ph',
  'com.vn',
]);

// The main site a name belongs to: "mail.google.com" is part of "google.com".
// Addresses made of numbers and one-word names (localhost) stand alone.
export function mainSite(host: string): string {
  if (/^[\d.]+$/.test(host) || host.includes(':')) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  return labels.slice(TWO_PART_ENDINGS.has(lastTwo) ? -3 : -2).join('.');
}

export interface SiteGroup {
  // The main site ("google.com").
  site: string;
  // All its cookies together.
  cookies: number;
  // The names under it, the main site's own name first ("google.com", then
  // "chat.google.com", "mail.google.com").
  hosts: SiteDataRow[];
}

// The sites with cookies, grouped by main site.
export function siteDataGroups(
  cookies: readonly { domain?: string }[],
): SiteGroup[] {
  const groups = new Map<string, SiteGroup>();
  for (const row of siteDataRows(cookies)) {
    const site = mainSite(row.host);
    const group = groups.get(site) ?? { site, cookies: 0, hosts: [] };
    group.cookies += row.cookies;
    group.hosts.push(row);
    groups.set(site, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      hosts: [...group.hosts].sort(
        (a, b) =>
          Number(b.host === group.site) - Number(a.host === group.site) ||
          a.host.localeCompare(b.host),
      ),
    }))
    .sort((a, b) => a.site.localeCompare(b.site));
}
