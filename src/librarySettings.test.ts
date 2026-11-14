import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultLibrarySettings,
  parseLibrarySettings,
  withLibrarySettings,
} from './librarySettings.ts';

test('the Library keeps history 90 days and deleted items 30 days by default', () => {
  assert.deepEqual(defaultLibrarySettings(), {
    version: 1,
    saveHistory: true,
    historyDays: 90,
    trashDays: 30,
  });
});

test('saved choices are kept; anything else falls back to the default', () => {
  assert.deepEqual(
    parseLibrarySettings({ saveHistory: false, historyDays: 7, trashDays: 60 }),
    { version: 1, saveHistory: false, historyDays: 7, trashDays: 60 },
  );
  assert.deepEqual(
    parseLibrarySettings({ saveHistory: 'no', historyDays: 8, trashDays: -1 }),
    defaultLibrarySettings(),
  );
  for (const junk of [null, 5, 'x', [], {}]) {
    assert.deepEqual(parseLibrarySettings(junk), defaultLibrarySettings());
  }
});

test('changes apply one at a time, and bad ones are ignored', () => {
  const start = defaultLibrarySettings();
  assert.equal(
    withLibrarySettings(start, { saveHistory: false }).saveHistory,
    false,
  );
  assert.equal(
    withLibrarySettings(start, { historyDays: 365 }).historyDays,
    365,
  );
  assert.equal(withLibrarySettings(start, { trashDays: 7 }).trashDays, 7);
  // Only that one thing changes.
  assert.equal(withLibrarySettings(start, { trashDays: 7 }).historyDays, 90);
  for (const bad of [
    { historyDays: 10 },
    { trashDays: 'x' },
    { saveHistory: 1 },
    null,
    5,
  ]) {
    assert.deepEqual(withLibrarySettings(start, bad), start);
  }
});
