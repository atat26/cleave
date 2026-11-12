import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeSite } from './site.ts';

test('an https page shows its site and a secure connection', () => {
  assert.deepEqual(describeSite('https://www.example.com/a/b?x=1#top'), {
    host: 'example.com',
    secure: true,
  });
  assert.deepEqual(describeSite('https://docs.example.co.uk/'), {
    host: 'docs.example.co.uk',
    secure: true,
  });
});

test('a plain http page is marked not secure', () => {
  assert.deepEqual(describeSite('http://neverssl.com/'), {
    host: 'neverssl.com',
    secure: false,
  });
});

test('anything that is not an ordinary web page has no chip', () => {
  for (const address of [
    '',
    'about:blank',
    'file:///C:/x.html',
    'javascript:1',
    'not an address',
  ]) {
    assert.equal(describeSite(address), null, address);
  }
});
