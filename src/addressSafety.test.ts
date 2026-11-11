import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addKnown,
  checkPublicAddress,
  checkReadLink,
  emptyKnown,
  isPublicHostname,
  isPublicIp,
  normalizeAddress,
} from './addressSafety.ts';

test('public IP addresses are allowed; private, reserved and special ones are not (IPv4)', () => {
  const yes = [
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.255.255',
    '172.32.0.1',
    '100.128.0.1',
    '11.0.0.1',
    '223.255.255.254',
  ];
  const no = [
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '100.64.0.1',
    '100.127.255.255',
    '169.254.169.254',
    '169.254.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.255.255',
    '192.0.0.1',
    '192.0.2.5',
    '192.88.99.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
  ];
  for (const ip of yes) assert.equal(isPublicIp(ip), true, ip);
  for (const ip of no) assert.equal(isPublicIp(ip), false, ip);
});

test('IPv6: only global addresses, and the IPv4 hidden inside mapped, NAT64 and 6to4 forms decides', () => {
  const yes = [
    '2606:4700:4700::1111',
    '2a00:1450:4001:80b::200e',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '2002:0808:0808::1',
  ];
  const no = [
    '::',
    '::1',
    '[::1]',
    'fe80::1',
    'fe80::1%eth0',
    'fec0::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:192.168.1.1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    '2002:c0a8:101::',
    '2001:db8::1',
    '2001::1',
    '2001:1::1',
    '100::1',
    '::1.2.3.4',
    '1::',
  ];
  for (const ip of yes) assert.equal(isPublicIp(ip), true, ip);
  for (const ip of no) assert.equal(isPublicIp(ip), false, ip);
});

test('text that is not an IP address is never public', () => {
  for (const junk of [
    '',
    'not an ip',
    '999.1.1.1',
    '1.2.3',
    '1.2.3.4.5',
    '1:2:3',
    ':::',
    'g::1',
    '1::2::3',
    '08.8.8.8x',
  ]) {
    assert.equal(isPublicIp(junk), false, junk);
  }
});

test('host names: public-looking ones pass; local, single-word and malformed ones do not', () => {
  const yes = [
    'example.com',
    'www.nytimes.com',
    'sub.example.co.uk',
    'xn--bcher-kva.example',
    'a-b.example.org',
    'EXAMPLE.COM',
    'example.com.',
  ];
  const no = [
    '',
    'localhost',
    'LOCALHOST',
    'foo.localhost',
    'printer.local',
    'router.lan',
    'nas.home',
    'wiki.corp',
    'db.internal',
    'intranet',
    'my-server',
    'app.home.arpa',
    '-bad.example',
    'bad-.example',
    'under_score.example',
    'example.123',
    'a..b.example',
    'x'.repeat(64) + '.example',
    'exa mple.com',
    'exa%6dple.com',
  ];
  for (const host of yes) assert.equal(isPublicHostname(host), true, host);
  for (const host of no) assert.equal(isPublicHostname(host), false, host);
});

test('whole addresses: ordinary web pages pass, every disguise of the local network is refused', () => {
  const yes = [
    'https://www.nytimes.com/section/technology',
    'http://example.com/',
    'https://example.com:8443/page?x=1#top',
    'http://93.184.216.34/page',
    'https://[2606:4700:4700::1111]/dns',
    'https://xn--bcher-kva.example/',
    'HTTPS://Example.COM/Path',
  ];
  for (const address of yes)
    assert.equal(checkPublicAddress(address).ok, true, address);

  const no = [
    // the machine itself, in every spelling the URL reader understands
    'http://localhost/',
    'http://localhost:8080/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://0x7f.1/',
    'http://0177.0.0.1/',
    'http://2130706433/',
    'http://017700000001/',
    'http://0/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[0:0:0:0:0:0:0:1]/',
    'http://[::ffff:7f00:1]:8080/',
    'http://app.localhost/',
    // private networks and the cloud metadata address
    'http://10.0.0.5/',
    'http://192.168.1.1/admin',
    'http://172.16.0.9/',
    'http://172.31.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.1.1/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:192.168.0.1]/',
    // local-only names
    'http://printer.local/',
    'http://router.lan/',
    'http://intranet/',
    'http://wiki/',
    'http://nas.home/',
    'http://db.internal:8080/',
    // not an ordinary web address
    'file:///C:/secrets.txt',
    'ftp://example.com/',
    'javascript:alert(1)',
    'data:text/html,hi',
    'chrome://settings',
    'about:blank',
    'blob:https://example.com/x',
    // credentials, odd ports, junk
    'https://user:pass@example.com/',
    'https://user@example.com/',
    'http://example.com:22/',
    'http://example.com:6379/',
    'http://example.com:3000/',
    'not a url',
    '',
    '   ',
    'https://',
    'http://exa mple.com/',
  ];
  for (const address of no)
    assert.equal(checkPublicAddress(address).ok, false, address);

  for (const junk of [
    null,
    undefined,
    5,
    {},
    [],
    'https://example.com/' + 'a'.repeat(2100),
  ]) {
    assert.equal(checkPublicAddress(junk).ok, false);
  }
});

test('a refusal says why in plain words, never echoing the address back', () => {
  const refused = checkPublicAddress('http://192.168.1.1/secret-token-123');
  assert.ok(!refused.ok);
  assert.match(refused.reason, /private network/);
  assert.ok(!refused.reason.includes('secret-token-123'));
});

test('addresses are put in one standard form, ignoring the # part and the spelling of the host', () => {
  assert.equal(
    normalizeAddress('HTTPS://Example.COM:443/a/b?x=1#frag'),
    'https://example.com/a/b?x=1',
  );
  assert.equal(normalizeAddress('http://example.com'), 'http://example.com/');
  assert.equal(normalizeAddress('ftp://example.com/'), null);
  assert.equal(normalizeAddress('nonsense'), null);
});

test('an address is known only if it matches one seen from a real source', () => {
  const known = emptyKnown();
  addKnown(known, 'https://news.example/2026/story.html?id=7#comments'); // a search result
  addKnown(known, 'https://shop.example/pricing', false); // a link listed without its query

  const check = (address: string) => {
    const result = checkReadLink(address, known);
    return result.ok ? result.known : 'refused';
  };
  // Exactly the address seen (the # part does not matter).
  assert.equal(check('https://news.example/2026/story.html?id=7'), true);
  assert.equal(check('https://NEWS.example/2026/story.html?id=7#top'), true);
  // The same page with a changed or extra query is a different address: not known.
  assert.equal(
    check('https://news.example/2026/story.html?id=7&secret=abc'),
    false,
  );
  assert.equal(check('https://news.example/2026/story.html'), true); // seen with its query, path alone is known too
  assert.equal(check('https://news.example/other'), false);
  // A link listed without its query matches only when no query is given.
  assert.equal(check('https://shop.example/pricing'), true);
  assert.equal(check('https://shop.example/pricing?token=SECRET'), false);
  // A completely new address, even on a known site, is not known.
  assert.equal(check('https://news.example/?q=my+private+notes'), false);
  assert.equal(check('https://evil.example/?data=x'), false);
});

test('a refused address stays refused even if it was "seen" somewhere', () => {
  const known = emptyKnown();
  addKnown(known, 'http://127.0.0.1/admin');
  addKnown(known, 'http://192.168.1.1/');
  assert.equal(checkReadLink('http://127.0.0.1/admin', known).ok, false);
  assert.equal(checkReadLink('http://192.168.1.1/', known).ok, false);
});
