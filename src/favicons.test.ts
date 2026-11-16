import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultFavicons,
  faviconFor,
  parseFavicons,
  rememberFavicon,
} from './favicons.ts';

test('an icon is remembered by site name, without www., and the newest wins', () => {
  let cache = rememberFavicon(
    defaultFavicons(),
    'https://www.a.com/page?x=1',
    'https://a.com/icon.png',
  );
  assert.deepEqual(cache.icons, { 'a.com': 'https://a.com/icon.png' });
  cache = rememberFavicon(cache, 'https://a.com/', 'https://a.com/new.png');
  assert.equal(faviconFor(cache, 'a.com'), 'https://a.com/new.png');
  assert.equal(faviconFor(cache, 'www.a.com'), 'https://a.com/new.png');
});

test('only icons from web pages and web addresses are kept', () => {
  const base = defaultFavicons();
  assert.equal(
    rememberFavicon(base, 'file:///x.html', 'https://a.com/i.png'),
    base,
  );
  assert.equal(
    rememberFavicon(base, 'https://a.com/', 'javascript:alert(1)'),
    base,
  );
  assert.equal(
    rememberFavicon(base, 'https://a.com/', 'data:image/png;base64,AAAA'),
    base,
  );
  assert.equal(rememberFavicon(base, 'https://a.com/', null), base);
  assert.equal(
    rememberFavicon(base, 'https://a.com/', 'https://a.com/' + 'x'.repeat(700)),
    base,
  );
});

test('a subsite falls back to its main site icon', () => {
  const cache = rememberFavicon(
    defaultFavicons(),
    'https://google.com/',
    'https://google.com/i.ico',
  );
  assert.equal(
    faviconFor(cache, 'mail.google.com', 'google.com'),
    'https://google.com/i.ico',
  );
  assert.equal(faviconFor(cache, 'mail.google.com'), null);
  assert.equal(faviconFor(cache, 'other.org', 'other.org'), null);
});

test('the cache is capped, dropping the oldest, and repaired from disk', () => {
  let cache = defaultFavicons();
  for (let i = 0; i < 620; i++) {
    cache = rememberFavicon(
      cache,
      `https://s${i}.com/`,
      `https://s${i}.com/i.png`,
    );
  }
  assert.equal(Object.keys(cache.icons).length, 600);
  assert.equal(Object.keys(cache.icons)[0], 's20.com');
  assert.deepEqual(
    parseFavicons({
      icons: {
        'ok.com': 'https://ok.com/i.png',
        'BAD NAME': 'https://x.com/i.png',
        'evil.com': 'javascript:alert(1)',
        'num.com': 5,
      },
    }).icons,
    { 'ok.com': 'https://ok.com/i.png' },
  );
  for (const junk of [null, 5, 'x', [], { icons: [] }]) {
    assert.deepEqual(parseFavicons(junk), defaultFavicons());
  }
});
