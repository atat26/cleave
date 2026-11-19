import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  runChip,
  spaceSummary,
  tabStatuses,
  unseenAfterRun,
} from './sidebarStatus.ts';
import type { StatusInput } from './sidebarStatus.ts';
import type { RunView } from './runModel.ts';

const run = (over: Partial<RunView> = {}): RunView => ({
  word: 'working',
  verb: 'Clicking',
  target: 'Add to cart',
  ticks: ['running'],
  stepNumber: 1,
  partId: 1,
  state: 'running',
  tabId: 7,
  touchesPage: true,
  reading: false,
  ...over,
});
const input = (over: Partial<StatusInput> = {}): StatusInput => ({
  run: run(),
  working: new Set([7]),
  unseen: new Map(),
  activeTab: null,
  ...over,
});

test('a tab the assistant is working in has a blue dot, and the one it waits in an amber one', () => {
  assert.deepEqual([...tabStatuses(input())], [[7, 'working']]);
  const waiting = tabStatuses(
    input({ run: run({ word: 'waiting' }), working: new Set([7, 8]) }),
  );
  assert.equal(waiting.get(7), 'waiting');
  assert.equal(waiting.get(8), 'working');
});

test('nothing is marked as working once the run has ended', () => {
  for (const word of ['finished', 'stopped', 'stuck'] as const) {
    assert.equal(tabStatuses(input({ run: run({ word }) })).size, 0, word);
  }
  assert.equal(tabStatuses(input({ run: null })).size, 0);
});

test('what a finished run left stays on the tab until you open it', () => {
  const unseen = new Map([
    [3, 'finished' as const],
    [4, 'stuck' as const],
  ]);
  const statuses = tabStatuses(input({ run: null, unseen, activeTab: null }));
  assert.equal(statuses.get(3), 'finished');
  assert.equal(statuses.get(4), 'stuck');
  // The tab you are in shows nothing.
  const inThree = tabStatuses(input({ run: null, unseen, activeTab: 3 }));
  assert.equal(inThree.has(3), false);
  assert.equal(inThree.get(4), 'stuck');
});

test('a new run overrides the old marks on the tabs it works in', () => {
  const unseen = new Map([[7, 'finished' as const]]);
  assert.equal(tabStatuses(input({ unseen })).get(7), 'working');
});

test('when a run ends, green goes on the tabs it worked in that you are not in', () => {
  const ranIn = new Set([3, 4, 5]);
  const marks = unseenAfterRun(run({ word: 'finished' }), ranIn, 4);
  assert.deepEqual(
    [...marks].sort((a, b) => a[0] - b[0]),
    [
      [3, 'finished'],
      [5, 'finished'],
    ],
  );
});

test('a run that got stuck marks its tab red; one you stopped marks nothing', () => {
  const ranIn = new Set([3, 7]);
  assert.deepEqual(
    [...unseenAfterRun(run({ word: 'stuck' }), ranIn, null)],
    [[7, 'stuck']],
  );
  // Stuck in the tab you are in: nothing to tell you.
  assert.equal(unseenAfterRun(run({ word: 'stuck' }), ranIn, 7).size, 0);
  assert.equal(unseenAfterRun(run({ word: 'stopped' }), ranIn, null).size, 0);
  assert.equal(unseenAfterRun(null, ranIn, null).size, 0);
  assert.equal(
    unseenAfterRun(run({ word: 'stuck', tabId: null }), ranIn, null).size,
    0,
  );
});

test('a Space counts how many tabs are working and shows its most urgent dot', () => {
  assert.deepEqual(spaceSummary([]), { working: 0, urgent: null });
  assert.deepEqual(spaceSummary([null, null]), { working: 0, urgent: null });
  assert.deepEqual(spaceSummary(['working', 'working', null]), {
    working: 2,
    urgent: 'working',
  });
  assert.deepEqual(spaceSummary(['finished', 'working', 'waiting']), {
    working: 1,
    urgent: 'waiting',
  });
  assert.equal(spaceSummary(['working', 'stuck']).urgent, 'stuck');
  assert.equal(spaceSummary(['finished']).urgent, 'finished');
});

test('the run chip says what is going on in one line, only while it is', () => {
  const chip = (over: Partial<Parameters<typeof runChip>[0]> = {}) =>
    runChip({
      run: run(),
      workingTabs: 3,
      changes: 0,
      stuck: false,
      ...over,
    });
  assert.deepEqual(chip(), {
    tone: 'working',
    text: 'Assistant is working in 3 tabs',
  });
  assert.equal(chip({ workingTabs: 1 })?.text, 'Assistant is working in 1 tab');
  assert.equal(chip({ workingTabs: 0 })?.text, 'Assistant is working');
  assert.deepEqual(chip({ run: run({ word: 'waiting' }) }), {
    tone: 'waiting',
    text: 'Assistant is waiting for you',
  });
  assert.equal(
    chip({ run: run({ word: 'waiting' }), changes: 2 })?.text,
    'Assistant is waiting for you · 2 changes',
  );
  // One change is not a "batch".
  assert.equal(
    chip({ run: run({ word: 'waiting' }), changes: 1 })?.text,
    'Assistant is waiting for you',
  );
  assert.deepEqual(chip({ run: run({ word: 'stuck' }), stuck: true }), {
    tone: 'stuck',
    text: 'Assistant is stuck · needs you',
  });
  // Stuck but no tab is marked any more (you opened it): gone.
  assert.equal(chip({ run: run({ word: 'stuck' }) }), null);
  for (const word of ['finished', 'stopped'] as const) {
    assert.equal(chip({ run: run({ word }) }), null, word);
  }
  assert.equal(chip({ run: null }), null);
});
