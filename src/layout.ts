// Window layout, in pixels. The tab sidebar is on the left, the toolbar is
// along the top (to the right of the sidebar), and web pages fill the rest.
//
// The sidebar is a narrow icon strip by default. Hovering it slides it open
// OVER the page; pinning it keeps it open and the page makes room. You can drag
// its right edge to resize it (see model.ts for the min/max/default widths).
export const SIDEBAR_COLLAPSED_WIDTH = 48;
export const TOOLBAR_HEIGHT = 48;

// Drag the sidebar narrower than this and, on release, it snaps to the icon
// strip. Release it wider and it pins open at that width.
export const SIDEBAR_SNAP_WIDTH = 100;

// While the sidebar is narrower than this it draws icons only (this is also
// what you see while it is sliding open or closed).
export const SIDEBAR_FULL_MIN_WIDTH = 120;

// A sidebar opened by hovering closes only once the mouse is this far past its
// right edge, so a small slip of the mouse does not close it.
export const SIDEBAR_CLOSE_MARGIN = 80;

// How long the sidebar takes to slide open, closed or pinned.
export const SIDEBAR_ANIMATION_MS = 160;
