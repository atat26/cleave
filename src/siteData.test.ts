import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cookieIsOfSite,
  cookieWords,
  mainSite,
  siteDataGroups,
  siteDataRows,
  siteOfCookieDomain,
} from './siteData.ts';

test('cookies are grouped by site; a leading dot and www. do not make a new site', () => {
  assert.deepEqual(
    siteDataRows([
      { domain: '.a.com' },
      { domain: 'www.a.com' },
      { domain: 'a.com' },
      { domain: 'b.org' },
      { domain: 'localhost' },
      { domain: '' },
      {},
    ]),
    [
      { host: 'a.com', cookies: 3 },
      { host: 'b.org', cookies: 1 },
      { host: 'localhost', cookies: 1 },
    ],
  );
  assert.deepEqual(siteDataRows([]), []);
});

test('a cookie domain with odd characters is not a site', () => {
  assert.equal(siteOfCookieDomain('.Example.COM'), 'example.com');
  assert.equal(siteOfCookieDomain('bad host'), null);
  assert.equal(siteOfCookieDomain('a/b'), null);
  assert.equal(siteOfCookieDomain(undefined), null);
});

test('which cookies belong to a site', () => {
  assert.equal(cookieIsOfSite({ domain: '.a.com' }, 'a.com'), true);
  assert.equal(cookieIsOfSite({ domain: 'www.a.com' }, 'a.com'), true);
  assert.equal(cookieIsOfSite({ domain: 'sub.a.com' }, 'a.com'), false);
  assert.equal(cookieIsOfSite({ domain: 'b.com' }, 'a.com'), false);
});

test('the count reads naturally', () => {
  assert.equal(cookieWords(1), '1 cookie');
  assert.equal(cookieWords(3), '3 cookies');
});

test('names under one main site are grouped, with the main name first', () => {
  const groups = siteDataGroups([
    { domain: 'mail.google.com' },
    { domain: '.google.com' },
    { domain: 'chat.google.com' },
    { domain: 'chat.google.com' },
    { domain: 'news.bbc.co.uk' },
    { domain: 'bbc.co.uk' },
    { domain: 'localhost' },
    { domain: '10.0.0.5' },
  ]);
  assert.deepEqual(groups, [
    {
      site: '10.0.0.5',
      cookies: 1,
      hosts: [{ host: '10.0.0.5', cookies: 1 }],
    },
    {
      site: 'bbc.co.uk',
      cookies: 2,
      hosts: [
        { host: 'bbc.co.uk', cookies: 1 },
        { host: 'news.bbc.co.uk', cookies: 1 },
      ],
    },
    {
      site: 'google.com',
      cookies: 4,
      hosts: [
        { host: 'google.com', cookies: 1 },
        { host: 'chat.google.com', cookies: 2 },
        { host: 'mail.google.com', cookies: 1 },
      ],
    },
    {
      site: 'localhost',
      cookies: 1,
      hosts: [{ host: 'localhost', cookies: 1 }],
    },
  ]);
  assert.equal(mainSite('a.b.example.org'), 'example.org');
  assert.equal(mainSite('example.org'), 'example.org');
});
