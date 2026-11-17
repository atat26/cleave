import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HTML_POLICY,
  HTML_POLICY_OPEN,
  HTML_SANDBOX,
  PREVIEW_SHIM,
  htmlDocument,
  parsePreviewMessage,
  previewNote,
} from './artifactRender.ts';

test('an HTML artifact is shown with a policy that blocks every request out', () => {
  const page = htmlDocument(
    '<h1>Hello</h1><img src="https://evil.example/x.png">',
  );
  // The policy comes before anything the artifact wrote.
  assert.ok(page.indexOf('Content-Security-Policy') < page.indexOf('<h1>'));
  assert.ok(page.startsWith('<!doctype html>'));
  assert.ok(page.includes('<h1>Hello</h1>'));
  // Nothing may be loaded from anywhere; only what is written into the page.
  assert.match(HTML_POLICY, /default-src 'none'/);
  assert.match(HTML_POLICY, /img-src data: blob:/);
  assert.ok(
    !/https?:|\*/.test(HTML_POLICY),
    'no web address or wildcard allowed',
  );
  // Connections (fetch, WebSocket, beacons) fall back to "none".
  assert.ok(!HTML_POLICY.includes('connect-src'));
  // Forms cannot send anything anywhere.
  assert.match(HTML_POLICY, /form-action 'none'/);
});

test('scripts run in the preview, but only inline ones', () => {
  assert.match(HTML_POLICY, /script-src 'unsafe-inline' 'unsafe-eval'/);
  // No outside script can be named in the policy.
  const scriptSources = /script-src ([^;]*)/.exec(HTML_POLICY)?.[1] ?? '';
  assert.deepEqual(scriptSources.split(' ').sort(), [
    "'unsafe-eval'",
    "'unsafe-inline'",
  ]);
});

test('the frame may run scripts and nothing else', () => {
  assert.equal(HTML_SANDBOX, 'allow-scripts');
  // None of these may ever be added: each would let the page out of its box.
  for (const bad of [
    'allow-same-origin',
    'allow-top-navigation',
    'allow-popups',
    'allow-forms',
    'allow-modals',
    'allow-downloads',
    'allow-pointer-lock',
    'allow-presentation',
    'allow-storage-access',
  ]) {
    assert.ok(!HTML_SANDBOX.includes(bad), bad);
  }
});

test('links in the page cannot take the frame anywhere', () => {
  assert.ok(
    htmlDocument('<a href="https://a.example">x</a>').includes(
      '<base target="_blank">',
    ),
  );
});

test("the artifact's own document type line is replaced, not doubled", () => {
  const page = htmlDocument('  <!DOCTYPE html>\n<html><body>Hi</body></html>');
  assert.equal((page.match(/<!doctype/gi) ?? []).length, 1);
  assert.ok(page.includes('<html><body>Hi</body></html>'));
});

test('the helper script and the policy come before the page itself', () => {
  const page = htmlDocument('<button onclick="go()">Go</button>');
  assert.ok(page.indexOf('<script>') < page.indexOf('<button'));
  assert.ok(page.indexOf('Content-Security-Policy') < page.indexOf('<script>'));
  assert.ok(page.includes('x-dns-prefetch-control'));
});

// Runs the helper script in a stand-in for a sealed frame, where merely touching
// localStorage throws (as it does for a page with no identity of its own).
function runShim() {
  const posted: unknown[] = [];
  const listeners: Record<string, (e: unknown) => void> = {};
  const win: Record<string, unknown> = {
    parent: { postMessage: (m: unknown) => posted.push(m) },
    addEventListener: (name: string, fn: (e: unknown) => void) => {
      listeners['window:' + name] = fn;
    },
  };
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(win, name, {
      get() {
        throw new Error('SecurityError');
      },
      configurable: true,
    });
  }
  const doc = {
    addEventListener: (name: string, fn: (e: unknown) => void) => {
      listeners['document:' + name] = fn;
    },
  };
  // The script uses window, document and parent as plain names, as in a page.
  new Function('window', 'document', 'parent', PREVIEW_SHIM)(
    win,
    doc,
    win.parent,
  );
  return { win, posted, listeners };
}

test('a page that uses localStorage gets a working stand-in instead of a crash', () => {
  const { win } = runShim();
  const store = win.localStorage as Storage;
  assert.equal(store.getItem('a'), null);
  store.setItem('a', 1 as unknown as string);
  assert.equal(store.getItem('a'), '1');
  assert.equal(store.length, 1);
  assert.equal(store.key(0), 'a');
  assert.equal(store.key(5), null);
  store.removeItem('a');
  assert.equal(store.getItem('a'), null);
  store.setItem('b', 'x');
  store.clear();
  assert.equal(store.length, 0);
  // Not shared: each kind has its own.
  (win.sessionStorage as Storage).setItem('s', '1');
  assert.equal(store.getItem('s'), null);
  // Plain property names do not leak through.
  assert.equal(store.getItem('constructor'), null);
});

test('the helper script reports blocked loads and errors to the app', () => {
  const { posted, listeners } = runShim();
  listeners['document:securitypolicyviolation']({
    blockedURI: 'https://cdn.example/x.js',
  });
  listeners['window:error']({ message: 'x is not defined' });
  listeners['window:unhandledrejection']({ reason: new Error('nope') });
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [
    { aibPreview: 1, kind: 'blocked', text: 'https://cdn.example/x.js' },
    { aibPreview: 1, kind: 'error', text: 'x is not defined' },
    { aibPreview: 1, kind: 'error', text: 'nope' },
  ]);
});

test('only messages in our own shape are taken, as plain text', () => {
  assert.deepEqual(
    parsePreviewMessage({
      aibPreview: 1,
      kind: 'error',
      text: ' bad\n\tthing ',
    }),
    {
      kind: 'error',
      text: 'bad thing',
    },
  );
  assert.equal(
    parsePreviewMessage({
      aibPreview: 1,
      kind: 'blocked',
      text: 'x'.repeat(500),
    })?.text.length,
    160,
  );
  for (const junk of [
    null,
    5,
    'x',
    [],
    {},
    { kind: 'error', text: 'x' },
    { aibPreview: 2, kind: 'error', text: 'x' },
    { aibPreview: 1, kind: 'run', text: 'x' },
    { aibPreview: 1, kind: 'error', text: 5 },
  ]) {
    assert.equal(parsePreviewMessage(junk), null, JSON.stringify(junk));
  }
});

test('the note says which websites were refused, and the first error', () => {
  assert.equal(previewNote([]), null);
  assert.equal(
    previewNote([
      { kind: 'blocked', text: 'inline' },
      { kind: 'blocked', text: 'eval' },
    ]),
    null,
  );
  assert.match(
    previewNote([
      { kind: 'blocked', text: 'https://cdn.tailwindcss.com/3.4.1' },
      { kind: 'blocked', text: 'https://cdn.tailwindcss.com/other.js' },
      { kind: 'blocked', text: 'https://fonts.googleapis.com/css' },
    ]) ?? '',
    /load from the internet \(cdn\.tailwindcss\.com, fonts\.googleapis\.com\)/,
  );
  assert.match(
    previewNote([{ kind: 'error', text: 'x is not defined' }]) ?? '',
    /error: x is not defined/,
  );
  assert.match(
    previewNote([
      { kind: 'blocked', text: 'https://a.example/x' },
      { kind: 'blocked', text: 'https://b.example/x' },
      { kind: 'blocked', text: 'https://c.example/x' },
      { kind: 'blocked', text: 'https://d.example/x' },
    ]) ?? '',
    /and more/,
  );
});

test('with the internet allowed the page may reach secure addresses only', () => {
  const open = htmlDocument('<p>x</p>', true);
  assert.ok(open.includes(HTML_POLICY_OPEN));
  assert.ok(!open.includes(HTML_POLICY + '"'));
  // Closed is the default.
  assert.ok(htmlDocument('<p>x</p>').includes(HTML_POLICY));
  assert.ok(!htmlDocument('<p>x</p>').includes('https:'));
  // Every address kind in the open policy is https or wss; plain http, a wildcard
  // or "any address" is never named.
  assert.ok(!/(^|[ ;])http:/.test(HTML_POLICY_OPEN));
  assert.ok(!/(^|[ ;])ws:/.test(HTML_POLICY_OPEN));
  assert.ok(!HTML_POLICY_OPEN.includes('*'));
  assert.match(HTML_POLICY_OPEN, /connect-src https: wss:/);
  assert.match(HTML_POLICY_OPEN, /form-action 'none'/);
  assert.match(HTML_POLICY_OPEN, /default-src 'none'/);
  // Frames and objects stay forbidden (they fall back to "none").
  assert.ok(!HTML_POLICY_OPEN.includes('frame-src'));
  assert.ok(!HTML_POLICY_OPEN.includes('object-src'));
});
