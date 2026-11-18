// Window layout, in pixels.
//
// The window is one connected frame around the web page:
//
//     +---------+-------------------------------+-------+------+
//     |         |  toolbar (address bar)        |       |      |
//     |  left   +-------------------------------+ right | rail |
//     | sidebar |  web page (a rounded card)    | panel |      |
//     |         +-------------------------------+       |      |
//     |         |  chat (compact or expanded)   |       |      |
//     +---------+-------------------------------+-------+------+
//
// Every part can change size, and they all slide together (see frame.ts).

// Left sidebar: a narrow icon strip, opened over the page by hovering, or
// pinned open at a width you choose by dragging its edge.
export const SIDEBAR_COLLAPSED_WIDTH = 48;

// Drag the sidebar narrower than this and, on release, it snaps to the icon
// strip. Release it wider and it pins open at that width.
export const SIDEBAR_SNAP_WIDTH = 100;

// While the sidebar is narrower than this it draws icons only (this is also
// what you see while it is sliding open or closed).
export const SIDEBAR_FULL_MIN_WIDTH = 120;

// A sidebar opened by hovering closes only once the mouse is this far past its
// right edge, so a small slip of the mouse does not close it.
export const SIDEBAR_CLOSE_MARGIN = 80;

// Top: the toolbar with the address bar.
export const TOOLBAR_HEIGHT = 48;

// Right rail: always-visible buttons (Skills, Extensions, Settings).
export const RAIL_WIDTH = 48;

// Right panel: opens left of the rail. Drag it narrower than this and, on
// release, it closes.
export const PANEL_SNAP_WIDTH = 220;

// Bottom chat: a compact bar (one or two lines), or expanded and resizable.
// Drag it shorter than this and, on release, it shrinks back to the compact bar.
export const CHAT_COMPACT_HEIGHT = 64;

// What the chat needs to stay useful even when it is slim:
//   activity: a reply is being written, so the slim bar grows to also show one
//             line of it;
//   approval: an action is waiting for you, so the chat opens up (whatever you had
//             set) until it is answered, so the question is never out of sight.
export type ChatNeed = 'none' | 'activity' | 'approval';
export const CHAT_ACTIVITY_HEIGHT = 96;
export const CHAT_APPROVAL_HEIGHT = 470;
export const CHAT_SNAP_HEIGHT = 110;
// While the chat is shorter than this it draws the compact look.
export const CHAT_FULL_MIN_HEIGHT = 120;

// The web page is a rounded card inset from the frame by this much.
export const PAGE_INSET = 6;
export const PAGE_RADIUS = 10;

// The middle of the window (between the sidebar and the right panel) is never
// narrower than this. If opening the panel or pinning the sidebar would make it
// so, the sidebar goes back to the icon strip first, and then the panel narrows.
export const MIN_CENTRE_WIDTH = 420;

// The window itself is never smaller than this.
export const MIN_WINDOW_WIDTH = 1100;
export const MIN_WINDOW_HEIGHT = 700;

// The expanded chat is never taller than this share of the window.
export const MAX_CHAT_SHARE = 0.7;

// The web page never gets smaller than this, however big the panels are.
export const MIN_PAGE_WIDTH = 240;
export const MIN_PAGE_HEIGHT = 120;

// The colour of the frame itself (all the panels share it, so they read as one).
export const FRAME_COLOR = '#e6e9ef';
// The same, in the dark theme (--c-frame in tokens.css).
export const FRAME_COLOR_DARK = '#121419';
// The window's own minimize / maximize / close buttons are drawn by Windows over
// the top right corner (there is no title bar). They are this wide and as tall as
// the toolbar; nothing of ours may sit under them.
export const WINDOW_CONTROLS_WIDTH = 140;
// The colours of the buttons' icons on each theme.
export const CONTROLS_SYMBOL = '#1f2430';
export const CONTROLS_SYMBOL_DARK = '#e9ecf3';

// How long the frame takes to slide when something opens, closes or snaps.
export const FRAME_ANIMATION_MS = 160;
