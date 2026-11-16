import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canProceed,
  certErrorCode,
  certErrorName,
  certErrorUrl,
  isCertError,
  parseCertLink,
} from './certPage.ts';

const html = (url: string) =>
  decodeURIComponent(url.slice(url.indexOf(',') + 1));

test('certificate problems are told apart from other network errors', () => {
  assert.equal(isCertError(-200), true);
  assert.equal(isCertError(-202), true);
  assert.equal(isCertError(-105), false); // name not resolved
  assert.equal(isCertError(-102), false); // connection refused
  assert.equal(certErrorName(-200), 'ERR_CERT_COMMON_NAME_INVALID');
});

test('going on is offered for most problems, but never for a cancelled certificate', () => {
  assert.equal(canProceed(-200), true);
  assert.equal(canProceed(-201), true);
  assert.equal(canProceed(-202), true);
  assert.equal(canProceed(-206), false);
  assert.equal(canProceed(-207), false);
  assert.equal(canProceed(-105), false);
});

test('the page names the site and the problem, with a way back and (under Advanced) a way on', () => {
  const page = html(certErrorUrl('nas1.example.com', -200));
  assert.ok(page.startsWith('<!doctype html>'));
  assert.ok(page.includes('nas1.example.com'));
  assert.ok(page.includes('ERR_CERT_COMMON_NAME_INVALID'));
  assert.ok(page.includes('href="aib:back"'));
  assert.ok(page.includes('href="aib:proceed"'));
  assert.ok(page.includes('<details>'));
  const revoked = html(certErrorUrl('bad.example.com', -206));
  assert.ok(revoked.includes('href="aib:back"'));
  assert.ok(!revoked.includes('aib:proceed'));
});

test('a hostile site name cannot add anything to the page', () => {
  const page = html(certErrorUrl('<script>alert(1)</script>"x', -200));
  assert.ok(!page.includes('<script>alert'));
  assert.ok(page.includes('&lt;script&gt;'));
});

test('only the two known links mean anything', () => {
  assert.equal(parseCertLink('aib:back'), 'back');
  assert.equal(parseCertLink('aib:proceed'), 'proceed');
  for (const bad of [
    '',
    'aib:other',
    'aib:proceed?x=1',
    'https://a.com',
    'AIB:BACK',
  ]) {
    assert.equal(parseCertLink(bad), null, bad);
  }
});

test('an error name from Electron is turned back into its number', () => {
  assert.equal(certErrorCode('net::ERR_CERT_COMMON_NAME_INVALID'), -200);
  assert.equal(certErrorCode('ERR_CERT_DATE_INVALID'), -201);
  assert.equal(certErrorCode('net::ERR_SOMETHING_ELSE'), null);
});
