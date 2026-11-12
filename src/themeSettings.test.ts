import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultThemeSettings,
  isThemeChoice,
  parseThemeSettings,
} from './themeSettings.ts';

test('the theme follows the computer unless you choose', () => {
  assert.equal(defaultThemeSettings().theme, 'system');
});

test('saved choices are kept; junk falls back to the default', () => {
  assert.equal(parseThemeSettings({ version: 1, theme: 'dark' }).theme, 'dark');
  assert.equal(parseThemeSettings({ theme: 'light' }).theme, 'light');
  for (const junk of [null, 5, 'dark', [], { theme: 'purple' }, { theme: 3 }]) {
    assert.equal(parseThemeSettings(junk).theme, 'system');
  }
});

test('only the three choices are valid', () => {
  assert.ok(
    isThemeChoice('system') && isThemeChoice('light') && isThemeChoice('dark'),
  );
  assert.ok(!isThemeChoice('auto') && !isThemeChoice(undefined));
});
