// The page shown when a site's security certificate is not right ("Your connection
// isn't private"), like Chrome's. It says what is wrong in plain words, offers to go
// back, and (under "Advanced") to go on anyway for that site until the app closes.
// Pure code with no Electron, so it is easy to test. The page is plain HTML with its
// own styles; its two links ("aib:back" and "aib:proceed") are caught by the app.

// Network error numbers that are certificate problems.
const NAMES: Record<number, { name: string; reason: string }> = {
  [-200]: {
    name: 'ERR_CERT_COMMON_NAME_INVALID',
    reason: 'The site’s certificate was issued for a different name.',
  },
  [-201]: {
    name: 'ERR_CERT_DATE_INVALID',
    reason: 'The site’s certificate has expired, or is not valid yet.',
  },
  [-202]: {
    name: 'ERR_CERT_AUTHORITY_INVALID',
    reason:
      'The site’s certificate was issued by someone this computer does not trust.',
  },
  [-203]: {
    name: 'ERR_CERT_CONTAINS_ERRORS',
    reason: 'The site’s certificate has errors.',
  },
  [-206]: {
    name: 'ERR_CERT_REVOKED',
    reason: 'The site’s certificate was cancelled by whoever issued it.',
  },
  [-207]: {
    name: 'ERR_CERT_INVALID',
    reason: 'The site’s certificate is not valid.',
  },
  [-208]: {
    name: 'ERR_CERT_WEAK_SIGNATURE_ALGORITHM',
    reason: 'The site’s certificate uses an outdated, weak signature.',
  },
  [-210]: {
    name: 'ERR_CERT_NON_UNIQUE_NAME',
    reason: 'The site’s certificate uses a name that is not unique.',
  },
  [-211]: {
    name: 'ERR_CERT_WEAK_KEY',
    reason: 'The site’s certificate uses a weak key.',
  },
  [-212]: {
    name: 'ERR_CERT_NAME_CONSTRAINT_VIOLATION',
    reason: 'The site’s certificate breaks the rules it was issued under.',
  },
  [-213]: {
    name: 'ERR_CERT_VALIDITY_TOO_LONG',
    reason: 'The site’s certificate is valid for longer than is allowed.',
  },
};

// Is this network error a certificate problem?
export const isCertError = (code: number): boolean => code in NAMES;

// A cancelled certificate (or an invalid one) is never offered "proceed".
export const canProceed = (code: number): boolean =>
  isCertError(code) && code !== -206 && code !== -207;

export const certErrorName = (code: number): string =>
  NAMES[code]?.name ?? 'ERR_CERT';

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );

// The page, as an address the tab can load.
export function certErrorUrl(host: string, code: number): string {
  const info = NAMES[code];
  const safeHost = escapeHtml(host);
  const proceed = canProceed(code)
    ? `<details><summary>Advanced</summary>
<p>${escapeHtml(info?.reason ?? 'The certificate could not be checked.')}
The code is <code>${escapeHtml(certErrorName(code))}</code>.</p>
<p>You can go on, but only do this if you know why the site’s certificate is wrong, such as a device on your own network. Nothing is remembered: it applies to this site until you close the browser.</p>
<p><a class="link" href="aib:proceed">Proceed to ${safeHost} (unsafe)</a></p></details>`
    : `<p class="muted">This site cannot be opened. The code is <code>${escapeHtml(certErrorName(code))}</code>.</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Privacy error</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--mut:#59636e;--card:#f6f8fa;--bd:#d1d9e0;--acc:#0969da;--red:#cf222e}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e6e8eb;--mut:#9aa3ad;--card:#1c1f24;--bd:#30363d;--acc:#79b8ff;--red:#ff7b72}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh}
main{max-width:560px;padding:32px}
.icon{width:44px;height:44px;border-radius:50%;background:var(--card);border:1px solid var(--bd);display:grid;place-items:center;color:var(--red);font-size:24px;margin-bottom:16px}
h1{font-size:24px;margin:0 0 12px}
p{margin:0 0 12px}.muted{color:var(--mut)}
code{background:var(--card);padding:1px 5px;border-radius:4px;font-size:13px}
.btn{display:inline-block;margin-top:8px;padding:8px 16px;border-radius:8px;background:var(--acc);color:var(--bg);text-decoration:none;font-weight:600}
details{margin-top:24px;border-top:1px solid var(--bd);padding-top:12px}
summary{cursor:pointer;color:var(--mut)}
.link{color:var(--red)}
</style></head><body><main>
<div class="icon">!</div>
<h1>Your connection isn’t private</h1>
<p>Attackers might be trying to steal what you send to <b>${safeHost}</b>, such as passwords or messages. The site’s security certificate cannot be trusted.</p>
<p><a class="btn" href="aib:back">Back to safety</a></p>
${proceed}
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

// What an "aib:" link on the page means (anything else is nothing).
export function parseCertLink(url: string): 'back' | 'proceed' | null {
  if (url === 'aib:back') return 'back';
  if (url === 'aib:proceed') return 'proceed';
  return null;
}

// The error number for a name like "net::ERR_CERT_COMMON_NAME_INVALID" (or null).
export function certErrorCode(error: string): number | null {
  const name = error.replace(/^net::/, '');
  for (const [code, info] of Object.entries(NAMES)) {
    if (info.name === name) return Number(code);
  }
  return null;
}
