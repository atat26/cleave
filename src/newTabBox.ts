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

// ---- "@" in the box --------------------------------------------------------------
// Typing "@" and a few letters opens the same list the chat has (open tabs, Spaces,
// artifacts). What you pick becomes a chip under the box ("The assistant can see")
// instead of text, and goes with the request when you Ask.

// The "@..." just before the cursor, if there is one: where it starts and what has
// been typed after the "@".
export function findMention(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\s@]*)$/.exec(before);
  return m ? { start: before.length - m[2].length - 1, query: m[2] } : null;
}

// The text with the "@..." that was being typed taken out (the pick replaces it).
export function withoutMention(
  text: string,
  start: number,
  caret: number,
): string {
  return (text.slice(0, start) + text.slice(caret)).replace(/ {2,}/g, ' ');
}

export interface MentionChip {
  kind: 'tab' | 'space' | 'artifact';
  id: number;
  // What it is called in the message ("@Route planning").
  tag: string;
}

// The "@name" tag for something picked.
export const mentionTag = (label: string): string =>
  `@${label.replace(/\s+/g, ' ').trim().slice(0, 60)}`;

// The text sent when you Ask: the tags of the chips, then what was typed, so each
// chip is in the message the way a pill is in the chat.
export function askText(chips: readonly MentionChip[], typed: string): string {
  return [...chips.map((c) => c.tag), typed.trim()].filter(Boolean).join(' ');
}
