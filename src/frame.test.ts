import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blendSizes,
  chatHeightWhileDragging,
  centreWidth,
  easeOutCubic,
  fitCentre,
  maxChatHeight,
  maxPanelWidth,
  pageRect,
  panelWidthWhileDragging,
  restingChatHeight,
  restingPanelWidth,
  settleChat,
  settlePanel,
} from './frame.ts';
import type { FrameSizes } from './frame.ts';
import {
  CHAT_ACTIVITY_HEIGHT,
  CHAT_APPROVAL_HEIGHT,
  CHAT_COMPACT_HEIGHT,
  CHAT_SNAP_HEIGHT,
  MIN_PAGE_HEIGHT,
  MIN_PAGE_WIDTH,
  PAGE_INSET,
  PANEL_DRAG_MIN_WIDTH,
  PANEL_SNAP_WIDTH,
  RAIL_WIDTH,
  TOOLBAR_HEIGHT,
  MIN_CENTRE_WIDTH,
} from './layout.ts';
import { CHAT_MIN_HEIGHT, PANEL_MIN_WIDTH } from './model.ts';

const WINDOW = { width: 1200, height: 800 };
const rest: FrameSizes = {
  sidebar: 48,
  left: 48,
  panel: 0,
  chat: CHAT_COMPACT_HEIGHT,
};

test('pageRect leaves room for the sidebar, toolbar, rail and chat', () => {
  const rect = pageRect(rest, WINDOW);
  assert.equal(rect.x, 48 + PAGE_INSET);
  assert.equal(rect.y, TOOLBAR_HEIGHT);
  // Right edge sits one inset left of the rail; bottom one inset above the chat.
  assert.equal(rect.x + rect.width, 1200 - RAIL_WIDTH - PAGE_INSET);
  assert.equal(rect.y + rect.height, 800 - CHAT_COMPACT_HEIGHT - PAGE_INSET);
});

test('a bigger panel or chat makes the page smaller, never negative', () => {
  const small = pageRect({ ...rest, panel: 400, chat: 300 }, WINDOW);
  const base = pageRect(rest, WINDOW);
  assert.equal(base.width - small.width, 400);
  assert.equal(base.height - small.height, 300 - CHAT_COMPACT_HEIGHT);
  const squeezed = pageRect({ ...rest, panel: 5000, chat: 5000 }, WINDOW);
  assert.equal(squeezed.width, 0);
  assert.equal(squeezed.height, 0);
});

test('a hover-opened sidebar floats: it does not move the page', () => {
  const floating = { ...rest, sidebar: 300 }; // wide view, same `left`
  assert.deepEqual(pageRect(floating, WINDOW), pageRect(rest, WINDOW));
  const pinned = { ...rest, sidebar: 300, left: 300 };
  assert.ok(pageRect(pinned, WINDOW).x > pageRect(rest, WINDOW).x);
});

test('blendSizes moves every part together, and easing starts fast', () => {
  const to: FrameSizes = { sidebar: 248, left: 248, panel: 340, chat: 364 };
  assert.deepEqual(blendSizes(rest, to, 0), rest);
  assert.deepEqual(blendSizes(rest, to, 1), to);
  assert.deepEqual(blendSizes(rest, to, 0.5), {
    sidebar: 148,
    left: 148,
    panel: 170,
    chat: 214,
  });
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

test('the chat is limited so the page always keeps some height', () => {
  const max = maxChatHeight(WINDOW);
  // The room left for the page, but never more than 70% of the window.
  assert.equal(
    max,
    Math.min(800 - TOOLBAR_HEIGHT - PAGE_INSET - MIN_PAGE_HEIGHT, 560),
  );
  assert.equal(maxChatHeight({ width: 1200, height: 1000 }), 700);
  assert.equal(chatHeightWhileDragging(5, WINDOW), CHAT_COMPACT_HEIGHT);
  assert.equal(chatHeightWhileDragging(99999, WINDOW), max);
  assert.equal(chatHeightWhileDragging(300, WINDOW), 300);
  // A tiny window still gives a usable (compact) chat, not a negative one.
  assert.equal(maxChatHeight({ width: 800, height: 100 }), CHAT_COMPACT_HEIGHT);
});

test('letting go of the chat edge: short snaps to compact, otherwise stays', () => {
  assert.deepEqual(settleChat(CHAT_SNAP_HEIGHT - 1, WINDOW), {
    expanded: false,
  });
  assert.deepEqual(settleChat(CHAT_SNAP_HEIGHT, WINDOW), {
    expanded: true,
    height: CHAT_MIN_HEIGHT, // raised to the smallest expanded height
  });
  assert.deepEqual(settleChat(400, WINDOW), { expanded: true, height: 400 });
  assert.deepEqual(settleChat(99999, WINDOW), {
    expanded: true,
    height: maxChatHeight(WINDOW),
  });
});

test('the chat at rest follows the saved setting, within the window', () => {
  assert.equal(
    restingChatHeight('both', false, 500, WINDOW),
    CHAT_COMPACT_HEIGHT,
  );
  assert.equal(restingChatHeight('both', true, 500, WINDOW), 500);
  // Window shrank since it was saved: it is capped, not left hanging off.
  assert.equal(
    restingChatHeight('both', true, 500, { width: 1200, height: 400 }),
    maxChatHeight({ width: 1200, height: 400 }),
  );
});

test('page-only closes the chat; chat-only gives it the whole middle', () => {
  // Page only: no chat, so the page runs to the bottom of the frame.
  assert.equal(restingChatHeight('page', true, 500, WINDOW), 0);
  const pageOnly = pageRect({ ...rest, chat: 0 }, WINDOW);
  assert.equal(pageOnly.y + pageOnly.height, 800 - PAGE_INSET);
  // Chat only: everything below the toolbar (the sidebar and rail stay).
  const full = restingChatHeight('chat', false, 500, WINDOW);
  assert.equal(full, 800 - TOOLBAR_HEIGHT);
  assert.equal(pageRect({ ...rest, chat: full }, WINDOW).height, 0);
  assert.equal(
    restingChatHeight('chat', false, 500, { width: 800, height: 10 }),
    0,
  );
});

test('the right panel is limited so the page always keeps some width', () => {
  const max = maxPanelWidth(rest, WINDOW);
  assert.equal(max, 560); // capped by the panel maximum on a wide window
  const narrow = { width: 700, height: 800 };
  assert.equal(
    maxPanelWidth(rest, narrow),
    700 - 48 - RAIL_WIDTH - 2 * PAGE_INSET - MIN_PAGE_WIDTH,
  );
  assert.equal(maxPanelWidth(rest, { width: 100, height: 800 }), 0);
  assert.equal(panelWidthWhileDragging(99999, rest, WINDOW), 560);
});

test('dragging the panel edge past the rail leaves a sliver, never nothing, so the edge stays in your hand', () => {
  // Far past the rail (a negative width) and right down to 0: the panel is still there.
  assert.equal(
    panelWidthWhileDragging(-500, rest, WINDOW),
    PANEL_DRAG_MIN_WIDTH,
  );
  assert.equal(panelWidthWhileDragging(0, rest, WINDOW), PANEL_DRAG_MIN_WIDTH);
  // The page takes a panel of 1 pixel or less away (and its edge with it): never that.
  assert.ok(PANEL_DRAG_MIN_WIDTH > 1);
  // Letting go of a sliver closes the panel, as dragging it all the way right is meant to.
  assert.deepEqual(settlePanel(PANEL_DRAG_MIN_WIDTH, rest, WINDOW), {
    open: false,
  });
  assert.deepEqual(settlePanel(-500, rest, WINDOW), { open: false });
  // A window with no room for a panel has none, even while dragging.
  assert.equal(
    panelWidthWhileDragging(-20, rest, { width: 100, height: 800 }),
    0,
  );
});

test('letting go of the panel edge: narrow closes it, otherwise it stays', () => {
  assert.deepEqual(settlePanel(PANEL_SNAP_WIDTH - 1, rest, WINDOW), {
    open: false,
  });
  assert.deepEqual(settlePanel(PANEL_SNAP_WIDTH, rest, WINDOW), {
    open: true,
    width: PANEL_MIN_WIDTH, // raised to the smallest open width
  });
  assert.deepEqual(settlePanel(420, rest, WINDOW), { open: true, width: 420 });
});

test('the panel at rest is 0 when closed, and fits the window when open', () => {
  assert.equal(restingPanelWidth(false, 340, rest, WINDOW), 0);
  assert.equal(restingPanelWidth(true, 340, rest, WINDOW), 340);
  assert.equal(
    restingPanelWidth(true, 600, rest, { width: 700, height: 800 }),
    maxPanelWidth(rest, { width: 700, height: 800 }),
  );
});

// ---- Keeping the middle wide enough --------------------------------------------

const fit = (
  window: { width: number; height: number },
  sidebarPinned: boolean,
  panelOpen: boolean,
  sidebarWidth = 248,
  panelWidth = 340,
) => fitCentre({ window, sidebarPinned, sidebarWidth, panelOpen, panelWidth });

test('with room to spare, nothing is changed', () => {
  assert.deepEqual(fit({ width: 1600, height: 900 }, true, true), {
    left: 248,
    panel: 340,
    sidebarCollapsed: false,
  });
  // Nothing pinned and no panel: just the strip and nothing.
  assert.deepEqual(fit({ width: 1100, height: 700 }, false, false), {
    left: 48,
    panel: 0,
    sidebarCollapsed: false,
  });
});

test('at the smallest window, a pinned sidebar and the panel together still leave 420', () => {
  // 1100 - 248 - 340 - 48 = 464: just enough, as in the design.
  const both = fit({ width: 1100, height: 700 }, true, true);
  assert.equal(
    centreWidth({ width: 1100, height: 700 }, both.left, both.panel),
    464,
  );
  assert.equal(both.sidebarCollapsed, false);
  // A wider sidebar would not fit: it goes to the strip first, the panel stays.
  const wide = fit({ width: 1100, height: 700 }, true, true, 360);
  assert.deepEqual(wide, { left: 48, panel: 340, sidebarCollapsed: true });
});

test('the sidebar collapses first, then the panel narrows, never below its minimum', () => {
  // 900 wide: pinned 248 + panel 340 + rail 48 leaves 264 (too narrow).
  const step1 = fit({ width: 900, height: 700 }, true, true);
  assert.equal(step1.sidebarCollapsed, true);
  assert.equal(step1.left, 48);
  // With the sidebar a strip, 900 - 48 - 48 - 340 = 464: the panel can stay as wide.
  assert.equal(step1.panel, 340);
  // 700 wide: even the strip leaves too little, so the panel narrows to what is left.
  const step2 = fit({ width: 700, height: 700 }, true, true);
  assert.equal(step2.panel, 280); // never below its minimum
  assert.ok(
    centreWidth({ width: 700, height: 700 }, step2.left, step2.panel) >= 0,
  );
  // 800 wide, strip sidebar: the panel gives up exactly what it must.
  const step3 = fit({ width: 800, height: 700 }, false, true, 248, 560);
  assert.equal(step3.panel, 800 - 48 - 48 - MIN_CENTRE_WIDTH);
  // It is never made wider than it was.
  assert.equal(
    fit({ width: 1400, height: 800 }, false, true, 248, 300).panel,
    300,
  );
});

test('a sidebar that was only hover-opened is never "collapsed" by this rule', () => {
  assert.equal(
    fit({ width: 900, height: 700 }, false, true).sidebarCollapsed,
    false,
  );
});

test('a slim chat grows to show a reply being written, and any chat opens for an approval', () => {
  // Nothing going on: as before.
  assert.equal(
    restingChatHeight('both', false, 500, WINDOW, 'none'),
    CHAT_COMPACT_HEIGHT,
  );
  // A reply being written: the slim bar gets room for one more line.
  assert.equal(
    restingChatHeight('both', false, 500, WINDOW, 'activity'),
    CHAT_ACTIVITY_HEIGHT,
  );
  assert.ok(CHAT_ACTIVITY_HEIGHT > CHAT_COMPACT_HEIGHT);
  // An expanded chat is left as it is while a reply is written.
  assert.equal(restingChatHeight('both', true, 500, WINDOW, 'activity'), 500);
  // An approval is waiting: even the slim bar opens up, but a taller chat stays.
  assert.equal(
    restingChatHeight('both', false, 500, WINDOW, 'approval'),
    CHAT_APPROVAL_HEIGHT,
  );
  assert.equal(restingChatHeight('both', true, 500, WINDOW, 'approval'), 500);
  // It never takes more than the window allows.
  const short = { width: 1200, height: 400 };
  assert.equal(
    restingChatHeight('both', false, 500, short, 'approval'),
    maxChatHeight(short),
  );
  // With the chat closed there is nothing to make room for; chat only already fills the room.
  assert.equal(restingChatHeight('page', false, 500, WINDOW, 'approval'), 0);
  assert.equal(
    restingChatHeight('chat', false, 500, WINDOW, 'approval'),
    restingChatHeight('chat', false, 500, WINDOW, 'none'),
  );
});
