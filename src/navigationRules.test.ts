import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedNavigation } from './navigationRules.ts';

test('a page may send its tab to a web address, a blank page, a warning-page link or an extension page', () => {
  for (const ok of [
    'https://example.com/',
    'http://example.com/a?b=c#d',
    'https://sub.example.com:8443/x',
    'about:blank',
    'aib:proceed',
    `chrome-extension://${'a'.repeat(32)}/popup.html`,
  ]) {
    assert.ok(isAllowedNavigation(ok), ok);
  }
});

test('nothing else: not a file, a blob, a program address, a script or an odd extension address', () => {
  for (const bad of [
    'file:///C:/Windows/win.ini',
    'FILE:///C:/x',
    'blob:https://example.com/1234',
    'filesystem:https://example.com/temporary/x',
    'ftp://example.com/x',
    'chrome://settings',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com/',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'about:srcdoc',
    'about:newtab',
    'mailto:a@example.com',
    'chrome-extension://short/x.html',
    `chrome-extension://${'q'.repeat(32)}/x.html`,
    'not an address',
    '',
  ]) {
    assert.ok(!isAllowedNavigation(bad), bad);
  }
});
