// The rules for the window's connected frame: where the web page goes, how far
// each panel can be dragged, and what happens when you let go. Pure numbers, no
// Electron, so it is easy to test. See layout.ts for the picture.
import {
  CHAT_COMPACT_HEIGHT,
  CHAT_SNAP_HEIGHT,
  MIN_PAGE_HEIGHT,
  MIN_PAGE_WIDTH,
  PAGE_INSET,
  PANEL_SNAP_WIDTH,
  RAIL_WIDTH,
  TOOLBAR_HEIGHT,
} from './layout.ts';
import {
  CHAT_MAX_HEIGHT,
  CHAT_MIN_HEIGHT,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
} from './model.ts';
import type { ViewMode } from './model.ts';

// How big each part of the frame is right now. All of these can be sliding.
export interface FrameSizes {
  // Width of the sidebar view itself (it may float over the page).
  sidebar: number;
  // How much room the sidebar takes from the page: its width when pinned, or
  // just the icon strip when it only opens by hovering.
  left: number;
  // Width of the open right panel (0 when closed), not counting the rail.
  panel: number;
  // Height of the chat at the bottom.
  chat: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

const clamp = (min: number, max: number, value: number) =>
  Math.min(max, Math.max(min, value));

// The rounded card where the web page is drawn.
export function pageRect(sizes: FrameSizes, window: Size): Rect {
  const x = sizes.left + PAGE_INSET;
  const y = TOOLBAR_HEIGHT;
  const rightEdge = window.width - RAIL_WIDTH - sizes.panel - PAGE_INSET;
  const bottomEdge = window.height - sizes.chat - PAGE_INSET;
  return {
    x: Math.round(x),
    y,
    width: Math.max(0, Math.round(rightEdge - x)),
    height: Math.max(0, Math.round(bottomEdge - y)),
  };
}

// Blend two sets of sizes (t = 0 gives `from`, t = 1 gives `to`).
export function blendSizes(
  from: FrameSizes,
  to: FrameSizes,
  t: number,
): FrameSizes {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    sidebar: mix(from.sidebar, to.sidebar),
    left: mix(from.left, to.left),
    panel: mix(from.panel, to.panel),
    chat: mix(from.chat, to.chat),
  };
}

// Starts fast and settles gently.
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// ---- Chat (bottom) --------------------------------------------------------

// The tallest the chat may be, so the web page always keeps some room.
export function maxChatHeight(window: Size): number {
  const room = window.height - TOOLBAR_HEIGHT - PAGE_INSET - MIN_PAGE_HEIGHT;
  return Math.max(CHAT_COMPACT_HEIGHT, Math.min(CHAT_MAX_HEIGHT, room));
}

// The chat's height while you are dragging its edge: anywhere from the compact
// bar to the tallest allowed.
export function chatHeightWhileDragging(height: number, window: Size): number {
  return clamp(CHAT_COMPACT_HEIGHT, maxChatHeight(window), height);
}

// What the chat becomes when you let go: shorter than the snap point goes back
// to the compact bar; otherwise it stays expanded at that height.
export function settleChat(
  height: number,
  window: Size,
): { expanded: false } | { expanded: true; height: number } {
  if (height < CHAT_SNAP_HEIGHT) return { expanded: false };
  const max = maxChatHeight(window);
  return {
    expanded: true,
    height: clamp(Math.min(CHAT_MIN_HEIGHT, max), max, height),
  };
}

// The chat's height at rest, by view mode:
//   page only: no chat at all (0)
//   chat only: all the room below the toolbar (the page is hidden); the sidebar
//              and the rail stay, as they do in every view
//   both:      compact, or expanded (but never so tall that the page would
//              disappear, e.g. after the window gets smaller)
export function restingChatHeight(
  viewMode: ViewMode,
  expanded: boolean,
  savedHeight: number,
  window: Size,
): number {
  if (viewMode === 'page') return 0;
  if (viewMode === 'chat') return Math.max(0, window.height - TOOLBAR_HEIGHT);
  if (!expanded) return CHAT_COMPACT_HEIGHT;
  return clamp(CHAT_COMPACT_HEIGHT, maxChatHeight(window), savedHeight);
}

// ---- Right panel -------------------------------------------------------------

// The widest the right panel may be, so the web page always keeps some room.
export function maxPanelWidth(sizes: { left: number }, window: Size): number {
  const room =
    window.width - sizes.left - RAIL_WIDTH - 2 * PAGE_INSET - MIN_PAGE_WIDTH;
  return Math.max(0, Math.min(PANEL_MAX_WIDTH, room));
}

// The panel's width while you are dragging its edge: from closed up to the
// widest allowed.
export function panelWidthWhileDragging(
  width: number,
  sizes: { left: number },
  window: Size,
): number {
  return clamp(0, maxPanelWidth(sizes, window), width);
}

// What the panel becomes when you let go: narrower than the snap point closes
// it; otherwise it stays open at that width.
export function settlePanel(
  width: number,
  sizes: { left: number },
  window: Size,
): { open: false } | { open: true; width: number } {
  if (width < PANEL_SNAP_WIDTH) return { open: false };
  const max = maxPanelWidth(sizes, window);
  return {
    open: true,
    width: clamp(Math.min(PANEL_MIN_WIDTH, max), max, width),
  };
}

// The panel's width at rest (0 when closed), kept within what fits the window.
export function restingPanelWidth(
  open: boolean,
  savedWidth: number,
  sizes: { left: number },
  window: Size,
): number {
  if (!open) return 0;
  return Math.min(savedWidth, maxPanelWidth(sizes, window));
}
