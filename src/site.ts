// What the small "site" chip at the start of the address bar says about the page:
// the site's name and whether the connection is secure. Pure code, no Electron.

export interface SiteInfo {
  // The site's name as shown (the host, without "www.").
  host: string;
  // https is secure; plain http is not.
  secure: boolean;
}

// The chip's content for an address, or null when there is nothing to say (a
// blank page, or an address that is not an ordinary web page).
export function describeSite(address: string): SiteInfo | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\./i, '');
  if (host === '') return null;
  return { host, secure: url.protocol === 'https:' };
}
