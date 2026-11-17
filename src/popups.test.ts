import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addBlocked,
  blockedLabel,
  decidePopup,
  GESTURE_MS,
  opensInBackground,
} from './popups.ts';

test('a window you just asked for opens; one nobody asked for is blocked', () => {
  assert.equal(decidePopup({ answer: null, sinceGesture: 200 }), 'open');
  assert.equal(decidePopup({ answer: null, sinceGesture: GESTURE_MS }), 'open');
  assert.equal(
    decidePopup({ answer: null, sinceGesture: GESTURE_MS + 1 }),
    'block',
  );
  assert.equal(decidePopup({ answer: null, sinceGesture: null }), 'block');
});

test('a site can be set to always allow, or to block without telling you', () => {
  assert.equal(decidePopup({ answer: 'allow', sinceGesture: null }), 'open');
  assert.equal(
    decidePopup({ answer: 'block', sinceGesture: null }),
    'block-quietly',
  );
  // A click you made still opens what you clicked, even on a blocking site.
  assert.equal(decidePopup({ answer: 'block', sinceGesture: 100 }), 'open');
});

test('blocked windows are remembered once, newest last, web addresses only', () => {
  let list: string[] = [];
  list = addBlocked(list, 'https://ad.example.com/win?x=1');
  list = addBlocked(list, 'https://ad.example.com/win?x=1');
  list = addBlocked(list, 'javascript:alert(1)');
  list = addBlocked(list, 'not a url');
  list = addBlocked(list, 'http://other.example/');
  assert.deepEqual(list, [
    'https://ad.example.com/win?x=1',
    'http://other.example/',
  ]);
  for (let i = 0; i < 12; i++) list = addBlocked(list, `https://s${i}.com/`);
  assert.equal(list.length, 8);
  assert.equal(list[list.length - 1], 'https://s11.com/');
});

test('a blocked address reads as a short line', () => {
  assert.equal(
    blockedLabel('https://www.example.com/promo/'),
    'example.com/promo',
  );
  assert.equal(blockedLabel('https://example.com/'), 'example.com');
  assert.ok(
    blockedLabel('https://example.com/' + 'a'.repeat(100)).endsWith('…'),
  );
});

test('a middle-click or Ctrl+click link opens behind the page; other windows come to the front', () => {
  assert.equal(opensInBackground('background-tab'), true);
  for (const other of [
    'foreground-tab',
    'new-window',
    'default',
    'other',
    '',
  ]) {
    assert.equal(opensInBackground(other), false, other);
  }
});
