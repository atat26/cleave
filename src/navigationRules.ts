// Where a web page may send its own tab. Pure, so it is tested.
//
// Cleave's own ways to open an address (the address bar, a bookmark, the assistant) already accept
// only web addresses. This is a second check for a page that navigates the tab itself, with a link,
// a script or a redirect: it may go to a web address, to a blank page, to one of the app's own
// warning-page links, or to an extension's own page, and nowhere else (no files, no blobs, no
// program addresses). A page the app opens itself (an error page) is not asked about.
export function isAllowedNavigation(address: string): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  switch (url.protocol) {
    case 'http:':
    case 'https:':
      return true;
    case 'about:':
      return address === 'about:blank';
    case 'aib:':
      // The warning page's own links (handled where the page is shown).
      return true;
    case 'chrome-extension:':
      return /^[a-p]{32}$/.test(url.hostname);
    default:
      return false;
  }
}
