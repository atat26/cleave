import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultToolSettings,
  levelFor,
  parseToolSettings,
  withLevel,
} from './toolSettings.ts';

test('with nothing saved, every tool has its default level', () => {
  const settings = defaultToolSettings();
  assert.equal(levelFor(settings, 'click'), 'ask');
  assert.equal(levelFor(settings, 'read_page'), 'always');
  assert.equal(levelFor(settings, 'no_such_tool'), 'ask');
});

test('a choice is kept, and choosing the default again removes it', () => {
  let settings = withLevel(defaultToolSettings(), 'click', 'if-safe');
  assert.equal(levelFor(settings, 'click'), 'if-safe');
  assert.deepEqual(settings.levels, { click: 'if-safe' });
  settings = withLevel(settings, 'click', 'ask'); // the default
  assert.deepEqual(settings.levels, {});
  // Unknown tools and bad levels change nothing.
  const same = withLevel(settings, 'format_disk', 'always');
  assert.equal(same, settings);
  assert.equal(withLevel(settings, 'click', 'whenever' as never), settings);
});

test('loading repairs whatever is on disk', () => {
  const loaded = parseToolSettings({
    version: 1,
    levels: {
      click: 'never',
      read_page: 'always', // same as the default: not kept
      scroll: 'sometimes', // not a level
      format_disk: 'always', // not a tool
      type_text: 7,
    },
  });
  assert.deepEqual(loaded.levels, { click: 'never' });
  for (const junk of [null, 'x', [], {}, { levels: 'no' }, { levels: [] }]) {
    assert.deepEqual(parseToolSettings(junk), defaultToolSettings());
  }
});
