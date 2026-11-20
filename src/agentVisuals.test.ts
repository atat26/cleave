import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cardSide,
  defaultAgentVisualSettings,
  overlayBounds,
  overlayFor,
  parseAgentVisualSettings,
  PEEK_EXTRA,
  PILL_HEIGHT,
  noOverlayFlags,
  overlayFlags,
  popoutOf,
} from './agentVisuals.ts';
import type { ChatMessage } from './chats.ts';
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
    { version: 1, showWork: 'glow', keepFinished: false, showCursor: true },
  );
  assert.equal(
    parseAgentVisualSettings({ showCursor: false }).showCursor,
    false,
  );
  assert.equal(parseAgentVisualSettings({ showCursor: 'no' }).showCursor, true);
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

test('the pill of a finished run offers to open what it made; no other pill does', () => {
  const made = { kind: 'artifact' as const, id: 4 };
  assert.deepEqual(
    overlayFor(input({ run: run({ word: 'finished', made }) }))?.made,
    made,
  );
  assert.equal(
    overlayFor(input({ run: run({ word: 'finished' }) }))?.made,
    null,
  );
  // Not after a Stop or when stuck, even if it made something before that.
  for (const word of ['stopped', 'stuck'] as const) {
    assert.equal(overlayFor(input({ run: run({ word, made }) }))?.made, null);
  }
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

const approval = {
  messageId: 5,
  partId: 2,
  toolName: 'type_text',
  ask: 'Type "hi" into the Search box on shop.example',
  risky: false,
  card: null,
  site: { host: 'shop.example', favicon: null },
};

test('a step waiting for your approval pops its card out over the page, whatever is on screen', () => {
  const waiting = run({ word: 'waiting' });
  const onPage = overlayFor(input({ run: waiting, approval }));
  assert.equal(onPage?.card, approval);
  assert.equal(onPage?.glow, true);
  assert.equal(onPage?.mode, 'frame');
  // A step about your tabs, on a page that is not the one it names: no glow, but the card.
  const tabs = run({ word: 'waiting', touchesPage: false, tabId: null });
  const off = overlayFor(input({ run: tabs, approval, activeTab: null }));
  assert.equal(off?.card, approval);
  assert.equal(off?.glow, false);
  assert.equal(off?.mode, 'frame');
  // Nothing waiting: no card, and no glow for that step.
  assert.equal(overlayFor(input({ run: tabs, activeTab: null })), null);
  // Not while it is only working: the card is for a question.
  assert.equal(overlayFor(input({ approval }))?.card, null);
});

test('the card pops out even when the display is turned off, but the glow and pill do not', () => {
  const settings = {
    ...defaultAgentVisualSettings(),
    showWork: 'off' as const,
  };
  const state = overlayFor(
    input({ run: run({ word: 'waiting' }), approval, settings }),
  );
  assert.equal(state?.card, approval);
  assert.equal(state?.glow, false);
  assert.equal(state?.pill, false);
  assert.equal(state?.marker, null);
  // No page area on screen (chat-only view): nothing pops out; the chat holds the question.
  assert.equal(
    overlayFor(
      input({ run: run({ word: 'waiting' }), approval, pageShown: false }),
    ),
    null,
  );
});

test('the card goes at the bottom, or the top when the marked element is down there', () => {
  const view = { height: 600 };
  assert.equal(cardSide(null, view, 280), 'bottom');
  assert.equal(
    cardSide({ x: 10, y: 80, width: 200, height: 30 }, view, 280),
    'bottom',
  );
  assert.equal(
    cardSide({ x: 10, y: 400, width: 200, height: 30 }, view, 280),
    'top',
  );
  // Only just clear of the card's band: still the bottom.
  assert.equal(
    cardSide({ x: 10, y: 270, width: 200, height: 30 }, view, 280),
    'bottom',
  );
});

test('the card is built from the waiting step only, and only while the reply is going', () => {
  const part = {
    type: 'tool' as const,
    id: 3,
    callId: 'c',
    name: 'type_text',
    arguments: '{"tab":4}',
    label: 'Type',
    status: 'waiting' as const,
    outcome: '',
    details: '',
    ask: 'Type "hi"',
    risky: true,
    card: { text: { label: 'Text to type', value: 'hi' } },
  };
  const message = (status: 'streaming' | 'done', parts = [part]) =>
    ({
      id: 9,
      role: 'assistant',
      status,
      parts,
      content: '',
    }) as unknown as ChatMessage;
  const tabs = [{ id: 4, url: 'https://www.shop.example/x', favicon: null }];
  const card = popoutOf(message('streaming'), tabs);
  assert.equal(card?.messageId, 9);
  assert.equal(card?.partId, 3);
  assert.equal(card?.risky, true);
  assert.equal(card?.site?.host, 'shop.example');
  assert.deepEqual(card?.card, {
    text: { label: 'Text to type', value: 'hi' },
  });
  assert.equal(popoutOf(message('done'), tabs), null);
  assert.equal(
    popoutOf(message('streaming', [{ ...part, status: 'ok' as never }]), tabs),
    null,
  );
  assert.equal(popoutOf(undefined, tabs), null);
});

test('a minimized card is just the strip, with the question, Review, Go to tab and Stop', () => {
  const waiting = run({ word: 'waiting' });
  const state = overlayFor(
    input({ run: waiting, approval, minimized: true, goToTab: true }),
  );
  assert.equal(state?.mode, 'pill');
  assert.equal(state?.minimized, true);
  assert.equal(state?.card, null);
  assert.equal(state?.glow, false);
  assert.equal(state?.marker, null);
  assert.equal(state?.pill, true);
  assert.equal(state?.ended, false);
  assert.equal(state?.goToTab, true);
  assert.equal(state?.askLine, approval.ask);
  // Only the first line of a longer question.
  const long = { ...approval, ask: 'Open 3 tabs\nshop.example\nnews.example' };
  assert.equal(
    overlayFor(input({ run: waiting, approval: long, minimized: true }))
      ?.askLine,
    'Open 3 tabs',
  );
  // It stays even if the display is off: a question is never hidden away.
  const off = { ...defaultAgentVisualSettings(), showWork: 'off' as const };
  const quiet = overlayFor(
    input({ run: waiting, approval, minimized: true, settings: off }),
  );
  assert.equal(quiet?.minimized, true);
  assert.equal(quiet?.pill, true);
  // Minimized without anything waiting does nothing special.
  assert.equal(overlayFor(input({ minimized: true }))?.minimized, false);
  // Not minimized: the card, and Go to tab only if there is a tab to go to.
  const open = overlayFor(input({ run: waiting, approval, goToTab: true }));
  assert.equal(open?.card, approval);
  assert.equal(open?.goToTab, true);
  assert.equal(overlayFor(input({ run: waiting, approval }))?.goToTab, false);
  // No card, no Go to tab.
  assert.equal(overlayFor(input({ goToTab: true }))?.goToTab, false);
});

test('the chat is told where each fact is already shown, so it does not repeat it', () => {
  assert.deepEqual(overlayFlags(null), noOverlayFlags());
  // Working on the page: the pill is there, no card.
  assert.deepEqual(overlayFlags(overlayFor(input())), {
    pill: true,
    card: false,
  });
  // A card over the page, with the pill.
  const waiting = run({ word: 'waiting' });
  assert.deepEqual(
    overlayFlags(overlayFor(input({ run: waiting, approval }))),
    {
      pill: true,
      card: true,
    },
  );
  // Minimized: the strip still holds the question.
  assert.deepEqual(
    overlayFlags(
      overlayFor(input({ run: waiting, approval, minimized: true })),
    ),
    { pill: true, card: true },
  );
  // Display off: the card alone, no pill.
  const off = { ...defaultAgentVisualSettings(), showWork: 'off' as const };
  assert.deepEqual(
    overlayFlags(overlayFor(input({ run: waiting, approval, settings: off }))),
    { pill: false, card: true },
  );
  // An ended run: the pill is its status.
  assert.deepEqual(
    overlayFlags(overlayFor(input({ run: run({ word: 'finished' }) }))),
    { pill: true, card: false },
  );
});

test('the cursor comes with the glow only, and only when its setting is on', () => {
  const cursor = {
    x: 50,
    y: 60,
    kind: 'arrow' as const,
    tone: 'acting' as const,
    tag: 'Clicking',
    burst: false,
  };
  assert.deepEqual(overlayFor(input({ cursor }))?.cursor, cursor);
  // None given: none.
  assert.equal(overlayFor(input())?.cursor, null);
  // Turned off: not drawn, the rest is.
  const off = { ...defaultAgentVisualSettings(), showCursor: false };
  assert.equal(overlayFor(input({ cursor, settings: off }))?.cursor, null);
  assert.equal(overlayFor(input({ cursor, settings: off }))?.glow, true);
  // "Glow only" still has the cursor (it is not the marker).
  const glowOnly = {
    ...defaultAgentVisualSettings(),
    showWork: 'glow' as const,
  };
  assert.deepEqual(
    overlayFor(input({ cursor, settings: glowOnly }))?.cursor,
    cursor,
  );
  // A step on another page, an ended run, or a minimized card: no cursor.
  assert.equal(overlayFor(input({ cursor, activeTab: 9 })), null);
  const ended = run({ word: 'finished', touchesPage: false, tabId: null });
  assert.equal(overlayFor(input({ run: ended, cursor }))?.cursor, null);
  const waiting = run({ word: 'waiting' });
  assert.equal(
    overlayFor(input({ run: waiting, approval, minimized: true, cursor }))
      ?.cursor,
    null,
  );
});

test('the last steps come along with the pill, for its hover list', () => {
  const recent = [
    { partId: 1, state: 'done' as const, verb: 'Read', target: 'Shop A' },
    { partId: 2, state: 'running' as const, verb: 'Clicking', target: null },
  ];
  assert.deepEqual(overlayFor(input({ recent }))?.recent, recent);
  assert.deepEqual(overlayFor(input())?.recent, []);
  // An ended run keeps its list; a minimized card and a turned-off display have none.
  const ended = run({ word: 'finished', touchesPage: false, tabId: null });
  assert.deepEqual(overlayFor(input({ run: ended, recent }))?.recent, recent);
  const waiting = run({ word: 'waiting' });
  assert.deepEqual(
    overlayFor(input({ run: waiting, approval, minimized: true, recent }))
      ?.recent,
    [],
  );
  const off = { ...defaultAgentVisualSettings(), showWork: 'off' as const };
  assert.deepEqual(
    overlayFor(input({ run: waiting, approval, settings: off, recent }))
      ?.recent,
    [],
  );
});

test('the strip is taller while the hover list is open, and the page-wide frame is not', () => {
  const page = { x: 100, y: 60, width: 800, height: 600 };
  assert.equal(
    overlayBounds('pill', page, true).height,
    PILL_HEIGHT + PEEK_EXTRA,
  );
  assert.equal(overlayBounds('pill', page, false).height, PILL_HEIGHT);
  assert.deepEqual(overlayBounds('frame', page, true), page);
  // Never taller than the page.
  assert.equal(
    overlayBounds('pill', { x: 0, y: 0, width: 300, height: 80 }, true).height,
    80,
  );
});
