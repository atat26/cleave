// Window layout, in pixels. The tab sidebar is on the left, the toolbar is
// along the top (to the right of the sidebar), and web pages fill the rest.
//
// The sidebar is a narrow icon strip by default. Hovering it slides it open
// OVER the page; pinning it keeps it open and the page makes room.
export const SIDEBAR_COLLAPSED_WIDTH = 48;
export const SIDEBAR_EXPANDED_WIDTH = 240;
export const TOOLBAR_HEIGHT = 48;

// How far from the left edge the toolbar and web pages start. A pinned
// sidebar pushes them aside; an unpinned one only reserves its narrow strip.
export const contentLeft = (pinned: boolean) =>
  pinned ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
