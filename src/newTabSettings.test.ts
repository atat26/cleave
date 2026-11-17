import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearHiddenPickUp,
  defaultNewTabSettings,
  hidePickUp,
  parseNewTabSettings,
  withNewTabSettings,
} from './newTabSettings.ts';

test('auto mode and suggestions start on, with nothing hidden', () => {
  assert.deepEqual(defaultNewTabSettings(), {
    version: 1,
    autoMode: true,
    suggestions: true,
    hidden: [],
  });
});

test('the two switches change one at a time; anything else is ignored', () => {
  let settings = withNewTabSettings(defaultNewTabSettings(), {
    autoMode: false,
  });
  assert.equal(settings.autoMode, false);
  assert.equal(settings.suggestions, true);
  settings = withNewTabSettings(settings, {
    suggestions: false,
    hidden: ['chat:1'],
  });
  assert.equal(settings.suggestions, false);
  assert.deepEqual(settings.hidden, []);
  assert.equal(withNewTabSettings(settings, 5), settings);
  assert.equal(
    withNewTabSettings(settings, { autoMode: 'yes' }).autoMode,
    false,
  );
});

test('hiding an item from Pick up is remembered once, only for real item keys, and can be undone', () => {
  let settings = hidePickUp(defaultNewTabSettings(), 'chat:4');
  settings = hidePickUp(settings, 'chat:4');
  settings = hidePickUp(settings, 'artifact:2');
  assert.deepEqual(settings.hidden, ['chat:4', 'artifact:2']);
  for (const bad of ['', 'chat', 'chat:x', 'tab:3', 'chat:1; drop', 5, null]) {
    assert.equal(hidePickUp(settings, bad), settings, String(bad));
  }
  assert.deepEqual(clearHiddenPickUp(settings).hidden, []);
});

test('the hidden list is capped, dropping the oldest', () => {
  let settings = defaultNewTabSettings();
  for (let i = 0; i < 320; i++) settings = hidePickUp(settings, `page:${i}`);
  assert.equal(settings.hidden.length, 300);
  assert.equal(settings.hidden[0], 'page:20');
});

test('whatever is on disk is repaired, never trusted', () => {
  const parsed = parseNewTabSettings({
    autoMode: false,
    suggestions: 'no',
    hidden: ['chat:1', 'chat:1', 'junk', 7, 'page:2'],
  });
  assert.equal(parsed.autoMode, false);
  assert.equal(parsed.suggestions, true);
  assert.deepEqual(parsed.hidden, ['chat:1', 'page:2']);
  for (const junk of [null, 5, 'x', [], {}]) {
    assert.deepEqual(parseNewTabSettings(junk), defaultNewTabSettings());
  }
});
