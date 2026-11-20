import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createThumbnailStore,
  isThumbnailUrl,
  MAX_THUMBNAIL_CHARS,
  thumbnailKey,
} from './thumbnails.ts';

const jpeg = (n = 1) => `data:image/jpeg;base64,${'QUJD'.repeat(n)}`;

test('only a small JPEG as a data address is a thumbnail', () => {
  assert.equal(isThumbnailUrl(jpeg()), true);
  for (const bad of [
    'https://evil.example/x.jpg',
    'data:image/png;base64,QUJD',
    'data:text/html;base64,QUJD',
    'data:image/jpeg;base64,',
    'data:image/jpeg;base64,QUJD" onerror="x',
    'javascript:alert(1)',
    42,
    null,
    undefined,
  ]) {
    assert.equal(isThumbnailUrl(bad), false, String(bad));
  }
  // Too big to be a thumbnail.
  assert.equal(isThumbnailUrl(jpeg(MAX_THUMBNAIL_CHARS)), false);
});

test('the key is the chat, the reply and the step', () => {
  assert.equal(thumbnailKey(1, 20, 3), '1:20:3');
  assert.notEqual(thumbnailKey(1, 20, 3), thumbnailKey(1, 2, 3));
});

test('thumbnails are kept in memory, a limited number, oldest first out; a bad value is ignored', () => {
  const store = createThumbnailStore(3);
  store.set('a', jpeg(1));
  store.set('b', jpeg(2));
  store.set('c', jpeg(3));
  store.set('bad', 'https://evil.example/');
  assert.equal(store.size(), 3);
  assert.equal(store.get('bad'), null);
  store.set('d', jpeg(4));
  assert.equal(store.size(), 3);
  assert.equal(store.get('a'), null);
  assert.equal(store.get('d'), jpeg(4));
  // Setting a key again makes it the newest, so it is the last to go.
  store.set('b', jpeg(5));
  store.set('e', jpeg(6));
  assert.equal(store.get('c'), null);
  assert.equal(store.get('b'), jpeg(5));
  store.clear();
  assert.equal(store.size(), 0);
  assert.equal(store.get('b'), null);
});
