import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultAgentVisualSettings,
  overlayBounds,
  overlayFor,
  parseAgentVisualSettings,
  PILL_HEIGHT,
} from './agentVisuals.ts';
import type { OverlayInput } from './agentVisuals.ts';
import type { RunView } from './runModel.ts';

const run = (over: Partial<RunView> = {}): RunView => ({
  word: 'working',
  verb: 'Clicking',
  target: 'Add to cart',
  ticks: ['done', 'running'],
  stepNumber: 2,
  partId: 2,
  state: 'running',
  tabId: 7,
  touchesPage: true,
  reading: false,
  ...over,
});
const input = (over: Partial<OverlayInput> = {}): OverlayInput => ({
  run: run(),
  activeTab: 7,
  pageShown: true,
  dismissed: false,
  settings: defaultAgentVisualSettings(),
  ...over,
});

test('settings fall back to the defaults, and odd values are ignored', () => {
  assert.deepEqual(
    parseAgentVisualSettings(undefined),
    defaultAgentVisualSettings(),
  );
  assert.deepEqual(parseAgentVisualSettings('x'), defaultAgentVisualSettings());
  assert.deepEqual(
    parseAgentVisualSettings({ showWork: 'glow', keepFinished: false }),
    { version: 1, showWork: 'glow', keepFinished: false },
  );
  assert.equal(
    parseAgentVisualSettings({ showWork: 'loud' }).showWork,
    'glow-marker',
  );
  assert.equal(
    parseAgentVisualSettings({ keepFinished: 'no' }).keepFinished,
    true,
  );
});

test('while it works on the page on screen, the page glows with its state in the pill', () => {
  const state = overlayFor(input());
  assert.equal(state?.mode, 'frame');
  assert.equal(state?.tone, 'working');
  assert.equal(state?.soft, false);
  assert.equal(state?.ended, false);
  assert.equal(state?.verb, 'Clicking');
  assert.equal(state?.target, 'Add to cart');
  assert.equal(state?.step, 2);
});

test('only reading gives a softer glow; waiting for you is always strong and amber', () => {
  assert.equal(overlayFor(input({ run: run({ reading: true }) }))?.soft, true);
  const waiting = overlayFor(
    input({ run: run({ word: 'waiting', reading: true }) }),
  );
  assert.equal(waiting?.soft, false);
  assert.equal(waiting?.tone, 'waiting');
});

test('nothing is drawn on a page the step is not about, or when the page is not on screen', () => {
  // The step is in another tab.
  assert.equal(overlayFor(input({ activeTab: 9 })), null);
  // The step is about tabs, history or artifacts, not a page.
  assert.equal(
    overlayFor(input({ run: run({ touchesPage: false, tabId: null }) })),
    null,
  );
  // Chat-only view (no page), or no tab selected.
  assert.equal(overlayFor(input({ pageShown: false })), null);
  assert.equal(overlayFor(input({ activeTab: null })), null);
  assert.equal(overlayFor(input({ run: null })), null);
});

test('when the run has ended, a pill stays until you dismiss it', () => {
  for (const word of ['finished', 'stopped', 'stuck'] as const) {
    const state = overlayFor(
      input({ run: run({ word, touchesPage: false, tabId: null }) }),
    );
    assert.equal(state?.mode, 'pill', word);
    assert.equal(state?.ended, true, word);
    assert.equal(state?.tone, word);
  }
  const ended = run({ word: 'finished' });
  assert.equal(overlayFor(input({ run: ended, dismissed: true })), null);
  const keepOff = { ...defaultAgentVisualSettings(), keepFinished: false };
  assert.equal(overlayFor(input({ run: ended, settings: keepOff })), null);
  // It is shown on whatever page is on screen, not only the one it worked in.
  assert.equal(overlayFor(input({ run: ended, activeTab: 99 }))?.mode, 'pill');
});

test('turning the display off shows nothing at all', () => {
  const off = { ...defaultAgentVisualSettings(), showWork: 'off' as const };
  assert.equal(overlayFor(input({ settings: off })), null);
  assert.equal(
    overlayFor(input({ settings: off, run: run({ word: 'finished' }) })),
    null,
  );
});

test('the glow covers the page; the pill is a strip at the top, so the page below stays usable', () => {
  const page = { x: 100, y: 60, width: 800, height: 600 };
  assert.deepEqual(overlayBounds('frame', page), page);
  const pill = overlayBounds('pill', page);
  assert.equal(pill.y, 60);
  assert.equal(pill.height, PILL_HEIGHT);
  assert.equal(pill.width, 560);
  assert.equal(pill.x, 100 + (800 - 560) / 2);
  // A narrow page: the pill is never wider than the page.
  const narrow = overlayBounds('pill', { x: 0, y: 0, width: 300, height: 20 });
  assert.equal(narrow.width, 276);
  assert.equal(narrow.height, 20);
});

test('the marker comes with the glow only, and only when the setting asks for it', () => {
  const marker = {
    rect: { x: 10, y: 40, width: 120, height: 30 },
    tone: 'acting' as const,
    label: 'Clicking · Add to cart',
    placement: 'above' as const,
  };
  assert.deepEqual(overlayFor(input({ marker }))?.marker, marker);
  // No marker given: none.
  assert.equal(overlayFor(input())?.marker, null);
  // "Glow only": the marker is not drawn.
  const glowOnly = {
    ...defaultAgentVisualSettings(),
    showWork: 'glow' as const,
  };
  assert.equal(overlayFor(input({ marker, settings: glowOnly }))?.marker, null);
  // An ended run is the pill alone: no marker.
  const ended = run({ word: 'finished', touchesPage: false, tabId: null });
  assert.equal(overlayFor(input({ run: ended, marker }))?.marker, null);
});
