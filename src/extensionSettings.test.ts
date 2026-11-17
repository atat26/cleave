import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultExtensionSettings,
  parseExtensionSettings,
  withExtensionSettings,
} from './extensionSettings.ts';

test('updates are on by default', () => {
  assert.equal(defaultExtensionSettings().autoUpdate, true);
});

test('the saved file is read safely', () => {
  assert.equal(parseExtensionSettings({ autoUpdate: false }).autoUpdate, false);
  assert.equal(parseExtensionSettings({ autoUpdate: true }).autoUpdate, true);
  for (const junk of [
    null,
    5,
    'x',
    [],
    {},
    { autoUpdate: 'no' },
    { autoUpdate: 0 },
  ]) {
    assert.deepEqual(
      parseExtensionSettings(junk),
      defaultExtensionSettings(),
      JSON.stringify(junk),
    );
  }
});

test('only the switch can be changed, and only to a true or false', () => {
  const off = withExtensionSettings(defaultExtensionSettings(), {
    autoUpdate: false,
  });
  assert.equal(off.autoUpdate, false);
  assert.equal(off.version, 1);
  assert.equal(
    withExtensionSettings(off, { autoUpdate: 'yes' }).autoUpdate,
    false,
  );
  assert.equal(withExtensionSettings(off, null), off);
  assert.equal(withExtensionSettings(off, { version: 9, other: 1 }).version, 1);
});
