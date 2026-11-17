import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultSleepSettings,
  idleSleepers,
  parseSleepSettings,
  sleepAfterWords,
  spaceSleepers,
  withSleepSettings,
} from './sleep.ts';
import type { SleepTab } from './sleep.ts';

const tab = (id: number, over: Partial<SleepTab> = {}): SleepTab => ({
  id,
  spaceId: 1,
  loaded: true,
  closed: false,
  audible: false,
  working: false,
  ...over,
});

test('putting a Space to sleep skips the page you are on, sound, the assistant, and what is already asleep', () => {
  const tabs = [
    tab(1),
    tab(2, { audible: true }),
    tab(3, { working: true }),
    tab(4, { loaded: false }),
    tab(5, { closed: true }),
    tab(6, { spaceId: 2 }),
    tab(7),
    tab(8, { spaceId: null }),
  ];
  assert.deepEqual(spaceSleepers(tabs, 1, 7), [1]);
  assert.deepEqual(spaceSleepers(tabs, 1, null), [1, 7]);
  assert.deepEqual(spaceSleepers(tabs, 9, null), []);
});

test('pages unused for long enough sleep; the active, playing and assistant pages never do', () => {
  const min = 60_000;
  const now = 10 * 60 * min;
  const tabs = [
    tab(1),
    tab(2),
    tab(3, { audible: true }),
    tab(4, { working: true }),
    tab(5),
    tab(6, { loaded: false }),
    tab(7),
  ];
  const last = new Map<number, number>([
    [1, now - 61 * min],
    [2, now - 59 * min],
    [3, now - 500 * min],
    [4, now - 500 * min],
    [5, now - 500 * min],
    [6, now - 500 * min],
    // 7 has never been seen: it counts as just used.
  ]);
  assert.deepEqual(idleSleepers(tabs, last, now, 60, 5), [1]);
  assert.deepEqual(idleSleepers(tabs, last, now, 15, 5), [1, 2]);
  assert.deepEqual(idleSleepers(tabs, last, now, 0, 5), []);
  // The page you are looking at is never put to sleep, however long ago it was "used".
  assert.deepEqual(idleSleepers([tab(1)], new Map([[1, 0]]), now, 15, 1), []);
  assert.deepEqual(
    idleSleepers([tab(1)], new Map([[1, 0]]), now, 15, null),
    [1],
  );
});

test('the setting offers fixed choices, starts as never, and ignores anything else', () => {
  assert.equal(defaultSleepSettings().afterMinutes, 0);
  assert.equal(parseSleepSettings({ afterMinutes: 60 }).afterMinutes, 60);
  for (const junk of [
    null,
    5,
    'x',
    [],
    {},
    { afterMinutes: 7 },
    { afterMinutes: '60' },
    { afterMinutes: -1 },
  ]) {
    assert.deepEqual(
      parseSleepSettings(junk),
      defaultSleepSettings(),
      JSON.stringify(junk),
    );
  }
  const on = withSleepSettings(defaultSleepSettings(), { afterMinutes: 120 });
  assert.equal(on.afterMinutes, 120);
  assert.equal(withSleepSettings(on, { afterMinutes: 120 }), on);
  assert.equal(withSleepSettings(on, { afterMinutes: 99 }), on);
  assert.equal(withSleepSettings(on, null), on);
  assert.equal(sleepAfterWords(0), 'Never');
  assert.equal(sleepAfterWords(30), '30 minutes');
  assert.equal(sleepAfterWords(60), '1 hour');
  assert.equal(sleepAfterWords(240), '4 hours');
});
