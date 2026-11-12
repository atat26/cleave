import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HTML_POLICY, HTML_SANDBOX, htmlDocument } from './artifactRender.ts';

test('an HTML artifact is shown with a policy that blocks every request out', () => {
  const page = htmlDocument(
    '<h1>Hello</h1><img src="https://evil.example/x.png">',
  );
  // The policy comes before anything the artifact wrote.
  assert.ok(page.indexOf('Content-Security-Policy') < page.indexOf('<h1>'));
  assert.ok(page.startsWith('<!doctype html>'));
  assert.ok(page.includes('<h1>Hello</h1>'));
  // Nothing may be loaded from anywhere; only pictures inside the page itself.
  assert.match(HTML_POLICY, /default-src 'none'/);
  assert.match(HTML_POLICY, /img-src data:/);
  assert.ok(!/img-src[^;]*https/.test(HTML_POLICY));
  assert.ok(!HTML_POLICY.includes('script-src'));
  assert.ok(!HTML_POLICY.includes('connect-src'));
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

test('the frame is given no permissions at all', () => {
  // An empty sandbox: no scripts, no forms, no popups, no same-origin access.
  assert.equal(HTML_SANDBOX, '');
});
