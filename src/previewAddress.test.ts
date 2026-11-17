import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewAddressAllowed } from './previewAddress.ts';

test('public websites over https may be reached', () => {
  for (const ok of [
    'https://cdn.tailwindcss.com/3.4.1',
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://fonts.gstatic.com/s/inter/v12/x.woff2',
    'https://api.example.com:443/data',
    'wss://stream.example.com/socket',
    'HTTPS://CDN.EXAMPLE.COM/x.js',
  ]) {
    assert.equal(previewAddressAllowed(ok), true, ok);
  }
});

test('plain http and other kinds of address never may', () => {
  for (const bad of [
    'http://example.com/x',
    'ws://example.com/socket',
    'ftp://example.com/x',
    'file:///C:/Windows/win.ini',
    'data:text/html,x',
    'blob:https://example.com/abc',
    'javascript:alert(1)',
    '',
    'not an address',
  ]) {
    assert.equal(previewAddressAllowed(bad), false, bad);
  }
});

test('your own computer and network never may, however they are written', () => {
  for (const bad of [
    'https://localhost/',
    'https://localhost:8443/x',
    'https://127.0.0.1/',
    'https://127.1/',
    'https://2130706433/',
    'https://0x7f000001/',
    'https://[::1]/',
    'https://10.0.0.5/',
    'https://172.16.0.1/',
    'https://192.168.1.10/',
    'https://169.254.169.254/latest/meta-data/',
    'https://nas.local/',
    'https://printer.lan/',
    'https://router.home.arpa/',
    'https://user:secret@example.com/',
    'https://example.com:6379/',
    'https://example.com:22/',
    'wss://192.168.1.10/socket',
    'wss://localhost/socket',
  ]) {
    assert.equal(previewAddressAllowed(bad), false, bad);
  }
});
