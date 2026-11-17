// The new-tab page's one box: it takes an address, a search or a request to the
// assistant. This decides which one Enter will do (auto mode) and lets the user
// switch. Pure code with no Electron, so it is easy to test.
import { looksLikeAddress } from './url.ts';

export type BoxMode = 'go' | 'search' | 'ask';

// Text this long (in words) is taken as a request to the assistant. (A single
// number so it is easy to change if short questions are sent to Ask too often.)
export const LONG_WORDS = 15;

export const wordCount = (text: string): number =>
  text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

// What Enter does by default for this text: an address goes to it, a long text asks
// the assistant, anything else is a search.
export function autoMode(text: string): BoxMode {
  const typed = text.trim();
  if (typed === '') return 'search';
  if (looksLikeAddress(typed)) return 'go';
  return wordCount(typed) >= LONG_WORDS ? 'ask' : 'search';
}

export const MODES: readonly BoxMode[] = ['go', 'search', 'ask'];

// The mode after pressing Tab (direction 1) or Shift+Tab (-1), among the ones on
// offer.
export function cycleMode(
  current: BoxMode,
  direction: 1 | -1,
  offered: readonly BoxMode[] = MODES,
): BoxMode {
  const at = offered.indexOf(current);
  const next = (Math.max(0, at) + direction + offered.length) % offered.length;
  return offered[next];
}

// The words for a mode: "Go to", "Search DuckDuckGo", "Ask".
export function modeLabel(mode: BoxMode, engineName: string): string {
  return mode === 'go'
    ? 'Go to'
    : mode === 'search'
      ? `Search ${engineName}`
      : 'Ask';
}
