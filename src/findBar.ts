// Find in page: where the small find bar sits over a page, and what it says about
// the matches. Pure code with no Electron, so it is easy to test.
import type { Rect } from './frame.ts';

export const FIND_BAR_WIDTH = 360;
export const FIND_BAR_HEIGHT = 48;
// The gap between the bar and the page card's edges.
const MARGIN = 8;

const clamp = (min: number, max: number, value: number) =>
  Math.min(max, Math.max(min, value));

// The bar's place: the top right of the page card, a little in from its edges. In
// a page narrower than the bar it shrinks to fit (and never leaves the page).
export function findBarRect(page: Rect): Rect {
  const width = clamp(0, FIND_BAR_WIDTH, page.width - 2 * MARGIN);
  return {
    x: Math.round(page.x + page.width - MARGIN - width),
    y: Math.round(page.y + MARGIN),
    width: Math.round(width),
    height: FIND_BAR_HEIGHT,
  };
}

// What the bar shows next to the box: nothing for an empty search, "No matches" when
// the text is not on the page, otherwise "3 of 12".
export function findLabel(
  query: string,
  active: number,
  total: number,
): { text: string; none: boolean } {
  if (query === '') return { text: '', none: false };
  if (total <= 0) return { text: 'No matches', none: true };
  const shown = clamp(1, total, active);
  return { text: `${shown} of ${total}`, none: false };
}
