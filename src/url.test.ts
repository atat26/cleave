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

test('searches use the chosen engine; addresses are never searched', () => {
  const google = 'https://www.google.com/search?q=%s';
  assert.equal(
    resolveInput('giant pandas', google),
    'https://www.google.com/search?q=giant%20pandas',
  );
  assert.equal(
    searchUrl('example.com', google),
    'https://www.google.com/search?q=example.com',
  );
  assert.equal(resolveInput('example.com', google), 'https://example.com/');
  assert.equal(
    resolveInput('javascript:alert(1)', google),
    'https://www.google.com/search?q=javascript%3Aalert(1)',
  );
});
