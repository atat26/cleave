import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  crashPageUrl,
  isLoadError,
  loadErrorName,
  loadErrorUrl,
} from './errorPage.ts';

const html = (url: string) =>
  decodeURIComponent(url.slice(url.indexOf(',') + 1));

test('only the real "cannot be reached" errors show a page', () => {
  for (const code of [
    -7, -21, -100, -101, -102, -103, -104, -105, -106, -118,
  ]) {
    assert.equal(isLoadError(code), true, String(code));
  }
  assert.equal(isLoadError(-3), false); // a load you cancelled yourself
  assert.equal(isLoadError(-200), false); // a certificate: its own page
  assert.equal(isLoadError(0), false);
  assert.equal(loadErrorName(-105), 'ERR_NAME_NOT_RESOLVED');
});

test('the page says what happened in plain words, with Reload and the code', () => {
  const page = html(loadErrorUrl('nas.example.com', -105));
  assert.ok(page.startsWith('<!doctype html>'));
  assert.ok(page.includes('This site can’t be reached'));
  assert.ok(
    page.includes('nas.example.com’s server address could not be found'),
  );
  assert.ok(page.includes('href="aib:reload"'));
  assert.ok(page.includes('ERR_NAME_NOT_RESOLVED'));
  assert.ok(
    html(loadErrorUrl('localhost', -102)).includes(
      'localhost refused to connect',
    ),
  );
});

test('being offline gets its own heading', () => {
  const page = html(loadErrorUrl('a.com', -106));
  assert.ok(page.includes('<h1>No internet</h1>'));
  assert.ok(page.includes('not connected to the internet'));
});

test('a hostile site name cannot add anything to the page', () => {
  const page = html(loadErrorUrl('<img src=x onerror=alert(1)>', -102));
  assert.ok(!page.includes('<img src=x'));
  assert.ok(page.includes('&lt;img'));
  assert.ok(!html(crashPageUrl('<b>x</b>')).includes('<b>x</b>'));
});

test('the crash page offers Reload and does not blame the site for other tabs', () => {
  const page = html(crashPageUrl('a.com'));
  assert.ok(page.includes('This page stopped working'));
  assert.ok(page.includes('href="aib:reload"'));
  assert.ok(html(crashPageUrl('')).includes('The page crashed'));
});
