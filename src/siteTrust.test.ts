import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_SITES,
  defaultSiteTrust,
  normalizeSite,
  parseSiteTrust,
  siteTrustRows,
  trustOf,
  visibleText,
  withSiteTrust,
} from './siteTrust.ts';

test('a site name is read from whatever you type or paste', () => {
  assert.equal(normalizeSite('www.example.com'), 'www.example.com');
  assert.equal(normalizeSite('  Example.COM  '), 'example.com');
  assert.equal(
    normalizeSite('https://www.example.com/a/b?q=1#x'),
    'www.example.com',
  );
  assert.equal(normalizeSite('http://localhost:3000/'), 'localhost:3000');
  assert.equal(normalizeSite('localhost'), 'localhost');
  assert.equal(normalizeSite('192.168.1.5'), '192.168.1.5');
  assert.equal(normalizeSite('https://example.com:443/'), 'example.com');
  assert.equal(normalizeSite('example.com:8080'), 'example.com:8080');
  // A name with accents is written the way the browser writes it.
  assert.equal(normalizeSite('bücher.example'), 'xn--bcher-kva.example');
});

test('things that are not one site are refused', () => {
  for (const bad of [
    '',
    '   ',
    'com',
    'localhost:abc',
    '*.example.com',
    'example.com/*',
    'user@example.com',
    'https://user:pass@example.com/',
    'file:///C:/x',
    'javascript:alert(1)',
    'a b.example',
    'exa"mple.com',
    'x'.repeat(400) + '.com',
    42,
    null,
    undefined,
    {},
  ]) {
    assert.equal(normalizeSite(bad), null, JSON.stringify(bad));
  }
});

test('the default for a site nobody has decided about is unknown', () => {
  const state = defaultSiteTrust();
  assert.equal(trustOf(state, 'www.example.com'), 'unknown');
  assert.equal(trustOf(state, ''), 'unknown');
  assert.equal(trustOf(state, 'constructor'), 'unknown');
  assert.equal(trustOf(state, '__proto__'), 'unknown');
});

test('a choice applies to exactly that site, however it is written', () => {
  const set = withSiteTrust(
    defaultSiteTrust(),
    'https://www.example.com/page',
    'trusted',
  );
  assert.ok(set.ok);
  assert.equal(set.host, 'www.example.com');
  assert.equal(trustOf(set.state, 'www.example.com'), 'trusted');
  assert.equal(trustOf(set.state, 'WWW.EXAMPLE.COM'), 'trusted');
  // Not the bare domain, another subdomain, a longer name, or the same name on another port.
  assert.equal(trustOf(set.state, 'example.com'), 'unknown');
  assert.equal(trustOf(set.state, 'docs.example.com'), 'unknown');
  assert.equal(trustOf(set.state, 'www.example.com.evil.test'), 'unknown');
  assert.equal(trustOf(set.state, 'www.example.com:8443'), 'unknown');
});

test('blocked, trusted and back to unknown', () => {
  let state = defaultSiteTrust();
  for (const [level, expected] of [
    ['blocked', 'blocked'],
    ['trusted', 'trusted'],
    ['unknown', 'unknown'],
  ] as const) {
    const result = withSiteTrust(state, 'bank.example', level);
    assert.ok(result.ok);
    state = result.state;
    assert.equal(trustOf(state, 'bank.example'), expected);
  }
  assert.deepEqual(state.sites, {});
});

test('changing the list never changes the old copy, and bad input changes nothing', () => {
  const before = defaultSiteTrust();
  const result = withSiteTrust(before, 'a.example', 'trusted');
  assert.ok(result.ok);
  assert.deepEqual(before.sites, {});
  assert.ok(!withSiteTrust(before, '*.example.com', 'trusted').ok);
  assert.ok(!withSiteTrust(before, 'a.example', 'sure' as never).ok);
});

test('the list has a size limit', () => {
  let state = defaultSiteTrust();
  for (let i = 0; i < MAX_SITES; i++) {
    const result = withSiteTrust(state, `site${i}.example`, 'trusted');
    assert.ok(result.ok);
    state = result.state;
  }
  const full = withSiteTrust(state, 'one-more.example', 'trusted');
  assert.ok(!full.ok);
  // A site already in the list can still be changed, and any can be removed.
  assert.ok(withSiteTrust(state, 'site0.example', 'blocked').ok);
  assert.ok(withSiteTrust(state, 'site0.example', 'unknown').ok);
});

test('the list is shown sorted by name', () => {
  let state = defaultSiteTrust();
  for (const host of ['b.example', 'a.example', 'c.example']) {
    const result = withSiteTrust(
      state,
      host,
      host === 'b.example' ? 'blocked' : 'trusted',
    );
    assert.ok(result.ok);
    state = result.state;
  }
  assert.deepEqual(siteTrustRows(state), [
    { host: 'a.example', level: 'trusted' },
    { host: 'b.example', level: 'blocked' },
    { host: 'c.example', level: 'trusted' },
  ]);
});

test('junk in the saved file is dropped and good entries survive', () => {
  for (const junk of [
    null,
    undefined,
    5,
    'x',
    [],
    { sites: null },
    { sites: [] },
    { sites: 'a' },
  ]) {
    assert.deepEqual(parseSiteTrust(junk), defaultSiteTrust());
  }
  const parsed = parseSiteTrust({
    version: 1,
    sites: {
      'a.example': 'trusted',
      'B.example': 'trusted', // not written the way the browser writes it
      'c.example': 'maybe',
      '*.example.com': 'trusted',
      'd.example': 'blocked',
      __proto__: 'trusted',
    },
  });
  assert.deepEqual(parsed.sites, {
    'a.example': 'trusted',
    'd.example': 'blocked',
  });
});

// Invisible characters, written by number so they can be read here.
const ch = (code: number) => String.fromCodePoint(code);
const ZWSP = ch(0x200b);
const ZWNJ = ch(0x200c);
const ZWJ = ch(0x200d);
const WORD_JOINER = ch(0x2060);
const RLO = ch(0x202e);
const LRI = ch(0x2066);
const BOM = ch(0xfeff);
const SOFT_HYPHEN = ch(0xad);
const VS15 = ch(0xfe0e);
const VS16 = ch(0xfe0f);
const VS_SUPPLEMENT = ch(0xe0100);
const KEYCAP = ch(0x20e3);
const TAG_H = ch(0xe0068);
const TAG_I = ch(0xe0069);
const HANGUL_FILLER = ch(0x3164);
const HANGUL_CHOSEONG_FILLER = ch(0x115f);
const BELL = ch(7);
const NUL = ch(0);

test('typed text loses what you could not see, and keeps new lines and tabs', () => {
  assert.equal(visibleText('hello'), 'hello');
  assert.equal(visibleText('a\nb\tc'), 'a\nb\tc');
  assert.equal(visibleText('a\r\nb\rc'), 'a\nb\nc');
  // Zero-width characters, direction marks and soft hyphens.
  assert.equal(
    visibleText(`a${ZWSP}b${WORD_JOINER}c${RLO}d${LRI}e${BOM}${SOFT_HYPHEN}f`),
    'abcdef',
  );
  // Invisible "tag" characters that can carry a hidden message.
  assert.equal(visibleText(`hi${TAG_H}${TAG_I}`), 'hi');
  // Variation selectors, fillers and control characters.
  assert.equal(
    visibleText(
      `x${VS15}${HANGUL_FILLER}${HANGUL_CHOSEONG_FILLER}${BELL}y${NUL}z`,
    ),
    'xyz',
  );
  assert.equal(visibleText(`x${VS_SUPPLEMENT}y${VS16}z`), 'xyz');
  // Ordinary text in other scripts is untouched.
  assert.equal(visibleText('héllo wörld 你好 😀'), 'héllo wörld 你好 😀');
});

test('the joiners that real writing needs stay, and the same marks used to hide a message go', () => {
  // Persian uses the zero-width non-joiner inside words.
  const persian = `می${ZWNJ}خواهم`;
  assert.equal(visibleText(persian), persian);
  // Emoji made with the joiner and the presentation mark: a family, a heart, a keycap, a flag.
  for (const emoji of [
    `👨${ZWJ}👩${ZWJ}👧`,
    `❤${VS16}`,
    `1${VS16}${KEYCAP}`,
    `🏳${VS16}${ZWJ}🌈`,
  ]) {
    assert.equal(visibleText(emoji), emoji, emoji);
  }
  // On their own, doubled, or at the edges they carry nothing but a hidden message.
  assert.equal(visibleText(`a${ZWNJ}${ZWJ}b`), 'ab');
  assert.equal(visibleText(`${ZWJ}ab`), 'ab');
  assert.equal(visibleText(`ab${ZWNJ}`), 'ab');
  assert.equal(visibleText(`a ${ZWJ} b`), 'a  b');
  assert.equal(visibleText(`a${ZWNJ}${ZWNJ}${ZWNJ}b`), 'ab');
  assert.equal(visibleText(`x${VS16}y`), 'xy');
  // A joiner next to a hidden mark is not between two letters.
  assert.equal(visibleText(`a${ZWNJ}${ZWSP}b`), 'ab');
});
