import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveInput, searchUrl } from './url.ts';

test('selected text is always searched for, even if it looks like an address', () => {
  assert.equal(
    searchUrl('  giant pandas & bamboo '),
    'https://duckduckgo.com/?q=giant%20pandas%20%26%20bamboo',
  );
  // Typed into the address bar, the same text would be loaded as an address.
  assert.equal(resolveInput('example.com'), 'https://example.com/');
  assert.equal(
    searchUrl('example.com'),
    'https://duckduckgo.com/?q=example.com',
  );
});

test('what is typed is turned into a safe address or a search', () => {
  assert.equal(resolveInput(''), '');
  assert.equal(resolveInput('https://a.example/x'), 'https://a.example/x');
  assert.equal(
    resolveInput('javascript:alert(1)'),
    'https://duckduckgo.com/?q=javascript%3Aalert(1)',
  );
});
