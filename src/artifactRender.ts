// Showing an HTML artifact as a page, safely. The text may have been written by
// the assistant after it read a web page, so it is never trusted. The page is shown
// in a sealed frame: its scripts run (a calculator needs them), but the frame has
// its own empty identity, so it cannot reach the app, the browser's pages or any
// saved data; it cannot open windows, send forms or take over the window; and the
// page gets a policy that blocks every request to the internet, so it cannot load
// anything or send anything anywhere. (The app also refuses any request or
// navigation the frame tries: see previewGuard.ts.) Pure code, easy to test.

// The policy: nothing may load, except pictures, fonts and media written into the
// page itself (data: addresses), its own inline styles, and its own inline scripts.
// `eval` is allowed because calculators and small apps often use it; the frame has
// nothing to reach, so it does no harm there.
export const HTML_POLICY =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline' 'unsafe-eval'; form-action 'none'";

// The policy for a page you have allowed to use the internet: the same, but it may
// also load and connect to secure (https, wss) addresses. Never plain http, and the
// app still refuses your own computer and network (see previewGuard.ts). Such a page
// can also send out whatever is written in it, so this is only ever on for a page
// you chose it for, and only for the exact text you allowed.
export const HTML_POLICY_OPEN =
  "default-src 'none'; img-src data: blob: https:; media-src data: blob: https:; style-src 'unsafe-inline' https:; font-src data: https:; script-src 'unsafe-inline' 'unsafe-eval' https:; connect-src https: wss:; form-action 'none'";

// What the frame is allowed to do: run scripts, and nothing else. In particular
// NOT "allow-same-origin" (that would make it as trusted as the app), and not forms,
// pop-ups, dialogs, downloads or moving the window.
export const HTML_SANDBOX = 'allow-scripts';

// A small script that runs first inside the frame:
//  - A sealed frame has no storage, so pages that use localStorage or sessionStorage
//    (many do, even to remember a setting) would crash. They get a stand-in that
//    lives only as long as the preview.
//  - It tells the app when the page tried to load something from the internet (the
//    policy refuses) or hit an error, so a page that looks broken can say why.
export const PREVIEW_SHIM = `(function () {
  function say(kind, text) {
    try { parent.postMessage({ aibPreview: 1, kind: kind, text: String(text) }, '*'); } catch (e) {}
  }
  function makeStore() {
    var data = {};
    function has(k) { return Object.prototype.hasOwnProperty.call(data, k); }
    return {
      get length() { return Object.keys(data).length; },
      key: function (i) { var k = Object.keys(data)[i]; return k === undefined ? null : k; },
      getItem: function (k) { k = String(k); return has(k) ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); },
      removeItem: function (k) { delete data[String(k)]; },
      clear: function () { data = {}; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    var works = true;
    try { void window[name]; } catch (e) { works = false; }
    if (!works) {
      try { Object.defineProperty(window, name, { value: makeStore(), configurable: true }); } catch (e) {}
    }
  });
  document.addEventListener('securitypolicyviolation', function (e) {
    say('blocked', e.blockedURI || e.violatedDirective || '');
  });
  window.addEventListener('error', function (e) { say('error', e.message || 'error'); });
  window.addEventListener('unhandledrejection', function (e) {
    say('error', (e.reason && e.reason.message) || e.reason || 'error');
  });
})();`;

// A complete page for the frame: the policy first, links that cannot take the
// frame anywhere, the helper script, then the artifact's own HTML.
export function htmlDocument(html: string, internet = false): string {
  // The artifact's own document type line is dropped: ours comes first.
  const body = html.replace(/^\s*<!doctype[^>]*>/i, '');
  return (
    '<!doctype html><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${internet ? HTML_POLICY_OPEN : HTML_POLICY}">` +
    // No looking up made-up website names ahead of time.
    '<meta http-equiv="x-dns-prefetch-control" content="off">' +
    '<base target="_blank">' +
    `<script>${PREVIEW_SHIM}</script>` +
    body
  );
}

// ---- What the page tells us ----------------------------------------------------

export interface PreviewMessage {
  kind: 'blocked' | 'error';
  text: string;
}

const MAX_NOTE = 160;

// A message from the frame, if it is one of ours. (Anything else is ignored: the
// page can say whatever it likes, so this is only ever shown as plain text.)
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.aibPreview !== 1) return null;
  if (m.kind !== 'blocked' && m.kind !== 'error') return null;
  if (typeof m.text !== 'string') return null;
  const text = m.text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOTE);
  return { kind: m.kind, text };
}

// The website a blocked address belongs to ("fonts.googleapis.com"), or null for
// things that are not websites (inline, data, eval...).
const hostOf = (blocked: string): string | null => {
  if (!/^(https?|wss?):\/\//i.test(blocked)) return null;
  try {
    return new URL(blocked).hostname || null;
  } catch {
    return null;
  }
};

// One plain line for what went wrong in the page, or null if nothing did.
export function previewNote(messages: PreviewMessage[]): string | null {
  const hosts = [
    ...new Set(
      messages
        .filter((m) => m.kind === 'blocked')
        .map((m) => hostOf(m.text))
        .filter((h): h is string => h !== null),
    ),
  ];
  const error = messages.find((m) => m.kind === 'error' && m.text !== '');
  const parts: string[] = [];
  if (hosts.length > 0) {
    const shown = hosts.slice(0, 3).join(', ');
    parts.push(
      `This page tried to load from the internet (${shown}${hosts.length > 3 ? ' and more' : ''}), which is turned off in previews.`,
    );
  }
  if (error) parts.push(`The page reported an error: ${error.text}`);
  return parts.length > 0 ? parts.join(' ') : null;
}
