// Pop-up blocking. A page may open a new tab or window only when you just clicked
// or pressed a key on it. Otherwise it is blocked (and remembered, so a small chip
// in the address bar can show it and let you open it). A site can be set to always
// allow pop-ups, or to block them quietly: see permissions.ts. Pure code with no
// Electron, so it is easy to test.
import type { Answer } from './permissions.ts';

// How long after a click or key press a page may open a window.
export const GESTURE_MS = 1500;

export type PopupDecision = 'open' | 'block' | 'block-quietly';

// What to do with a page's request to open a window.
export function decidePopup(options: {
  // What is remembered for the site: allow, block, or null (the default).
  answer: Answer | null;
  // How long ago you last clicked or pressed a key on the page (null: never).
  sinceGesture: number | null;
}): PopupDecision {
  // A click or key press just now: it is what you asked for.
  if (options.sinceGesture !== null && options.sinceGesture <= GESTURE_MS) {
    return 'open';
  }
  if (options.answer === 'allow') return 'open';
  return options.answer === 'block' ? 'block-quietly' : 'block';
}

const MAX_BLOCKED = 8;

// Remember a blocked window's address (once, newest last, only web addresses).
export function addBlocked(list: readonly string[], address: string): string[] {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return [...list];
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return [...list];
  const kept = url.toString();
  if (list.includes(kept)) return [...list];
  return [...list, kept].slice(-MAX_BLOCKED);
}

// A short line for a blocked address: "example.com/page".
export function blockedLabel(address: string): string {
  try {
    const url = new URL(address);
    const line =
      url.host.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
    return line.length > 48 ? `${line.slice(0, 47)}…` : line;
  } catch {
    return address.slice(0, 48);
  }
}

// A link clicked with the middle button, or with Ctrl, opens behind the page you are
// on (Electron calls it a "background tab"). Anything else opens and switches to it.
export const opensInBackground = (disposition: string): boolean =>
  disposition === 'background-tab';
