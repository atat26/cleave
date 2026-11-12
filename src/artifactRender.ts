// Showing an HTML artifact as a page, safely. The text may have been written by
// the assistant after it read a web page, so it is never trusted: it is shown in a
// sandboxed frame (no scripts, no forms, no popups, no access to the app), and the
// page gets a policy that blocks every request to the internet, so it cannot load
// anything or send anything anywhere. Pure code, easy to test.

// The policy: nothing may load, except pictures written into the page itself
// (data: addresses) and its own inline styles.
export const HTML_POLICY =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

// A complete page for the frame: the policy first, links that cannot take the
// frame anywhere, then the artifact's own HTML.
export function htmlDocument(html: string): string {
  // The artifact's own document type line is dropped: ours comes first.
  const body = html.replace(/^\s*<!doctype[^>]*>/i, '');
  return (
    '<!doctype html><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${HTML_POLICY}">` +
    '<base target="_blank">' +
    body
  );
}

// What the frame is allowed to do: nothing (an empty list of permissions).
export const HTML_SANDBOX = '';
