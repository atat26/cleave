import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextRegion } from './regions.ts';

test('F6 goes sidebar, toolbar and panels, then the page, then around', () => {
  assert.equal(nextRegion('sidebar', false, true), 'window');
  assert.equal(nextRegion('window', false, true), 'page');
  assert.equal(nextRegion('page', false, true), 'sidebar');
});

test('Shift+F6 goes the other way', () => {
  assert.equal(nextRegion('page', true, true), 'window');
  assert.equal(nextRegion('sidebar', true, true), 'page');
});

test('a hidden page is skipped', () => {
  assert.equal(nextRegion('window', false, false), 'sidebar');
  assert.equal(nextRegion('sidebar', true, false), 'window');
});

test('with focus somewhere unknown it starts at the first (or last) part', () => {
  assert.equal(nextRegion(null, false, true), 'sidebar');
  assert.equal(nextRegion(null, true, true), 'page');
});
