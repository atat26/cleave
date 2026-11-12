import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultNamingSettings,
  parseNamingSettings,
} from './namingSettings.ts';

test('automatic naming is on unless you turn it off', () => {
  assert.equal(defaultNamingSettings().auto, true);
  assert.equal(parseNamingSettings({ version: 1, auto: false }).auto, false);
  assert.equal(parseNamingSettings({ auto: true }).auto, true);
});

test('junk on disk falls back to the default', () => {
  for (const junk of [null, 3, 'off', [], {}, { auto: 'no' }]) {
    assert.equal(parseNamingSettings(junk).auto, true);
  }
});
