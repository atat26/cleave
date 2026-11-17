// A second lock behind the preview's own policy (see artifactRender.ts). An HTML
// artifact is shown in a frame inside the app's own window, and its scripts run. The
// page already forbids what it should, but the app refuses things as well, so one
// slip in the page's rules would still leave nothing to get through:
//   - a frame inside the window may not navigate anywhere (a script setting
//     location to a web address with something written in it is a way to send data);
//   - a request made by a frame inside the window is refused, unless you have
//     allowed the internet for that page; and even then only secure requests to
//     public websites go out: never plain http, and never your own computer or
//     network, whatever the address is written like or what its name points at.
// The window itself (the app's own page) is not affected.
import { session } from 'electron';
import type { BrowserWindow } from 'electron';
import dns from 'node:dns';
import { isPublicIp } from './addressSafety';
import { previewAddressAllowed } from './previewAddress';

// Asked on every request: may the preview that is on screen use the internet?
let internetAllowed: () => boolean = () => false;
export const setPreviewInternetCheck = (check: () => boolean): void => {
  internetAllowed = check;
};

// What a website name really points at (kept for a minute): only if every address
// it answers with is a public one.
const lookups = new Map<string, { ok: boolean; at: number }>();
const LOOKUP_KEEP_MS = 60_000;
async function pointsOnlyAtPublicAddresses(host: string): Promise<boolean> {
  const known = lookups.get(host);
  if (known && Date.now() - known.at < LOOKUP_KEEP_MS) return known.ok;
  let ok = false;
  try {
    const found = await dns.promises.lookup(host, { all: true });
    ok = found.length > 0 && found.every((entry) => isPublicIp(entry.address));
  } catch {
    ok = false;
  }
  lookups.set(host, { ok, at: Date.now() });
  return ok;
}

export function guardPreviewFrames(win: BrowserWindow): void {
  const contents = win.webContents;
  contents.on('will-frame-navigate', (event) => {
    // The window's own page is handled by 'will-navigate'.
    if (event.isMainFrame) return;
    // A preview starts as an inline document; that is not going anywhere.
    if (event.url === 'about:srcdoc' || event.url === 'about:blank') return;
    event.preventDefault();
    console.warn('[preview] a frame tried to navigate and was stopped');
  });
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      // Only the window's own frames are looked at; every other page goes through.
      if (details.webContentsId !== contents.id) {
        callback({});
        return;
      }
      // The app's own page is the top frame; anything deeper is a preview.
      const frame = details.frame;
      if (!frame || frame.parent === null) {
        callback({});
        return;
      }
      if (!internetAllowed() || !previewAddressAllowed(details.url)) {
        console.warn('[preview] a frame request was refused');
        callback({ cancel: true });
        return;
      }
      void pointsOnlyAtPublicAddresses(new URL(details.url).hostname).then(
        (ok) => {
          if (!ok)
            console.warn(
              '[preview] a request to a private address was refused',
            );
          callback({ cancel: !ok });
        },
      );
    },
  );
}
