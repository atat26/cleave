import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterShortcuts, SHORTCUT_GROUPS } from './shortcuts.ts';

test('every group has shortcuts, and no key combination is listed twice', () => {
  assert.ok(SHORTCUT_GROUPS.length >= 4);
  const seen = new Set<string>();
  for (const group of SHORTCUT_GROUPS) {
    assert.ok(group.shortcuts.length > 0, group.title);
    for (const s of group.shortcuts) {
      assert.ok(s.keys.trim() !== '' && s.does.trim() !== '');
      for (const key of s.keys.split(' / ')) {
        assert.equal(seen.has(key), false, `listed twice: ${key}`);
        seen.add(key);
      }
    }
  }
});

test('the list covers the shortcuts the menus advertise', () => {
  const all = SHORTCUT_GROUPS.flatMap((g) =>
    g.shortcuts.map((s) => s.keys),
  ).join(' | ');
  for (const advertised of [
    'Ctrl+F',
    'Ctrl+D',
    'Ctrl+P',
    'Ctrl+S',
    'Ctrl+W',
    'F11',
    'F12',
  ]) {
    assert.ok(all.includes(advertised), advertised);
  }
});

test('searching matches the keys or the words and drops empty groups', () => {
  assert.deepEqual(filterShortcuts(SHORTCUT_GROUPS, ''), SHORTCUT_GROUPS);
  const reload = filterShortcuts(SHORTCUT_GROUPS, 'reload');
  assert.ok(reload.length >= 1);
  assert.ok(
    reload.every((g) =>
      g.shortcuts.every((s) => /reload/i.test(s.keys + s.does)),
    ),
  );
  const byKey = filterShortcuts(SHORTCUT_GROUPS, 'ctrl+l');
  assert.ok(
    byKey.some((g) =>
      g.shortcuts.some((s) => s.does === 'Go to the address bar'),
    ),
  );
  assert.deepEqual(filterShortcuts(SHORTCUT_GROUPS, 'zzzz'), []);
});
