// The assistant's cursor: a pointer drawn over the page while a step clicks, types, chooses or
// scrolls in it, so you can follow it the way you would follow a colleague's screen share. This
// file works out where it goes, what it looks like and what its tag says. Pure code with no
// Electron and no React, so it is easy to test. The drawing is in OverlayApp.tsx.
//
// It is never your own pointer and never touches the page: it is a picture in the app's own
// layer above the page. It points at the same element the marker names (the box measured for
// the marker), and only while a step is acting there; reading, looking and finding show none.
import type { Rect } from './marker.ts';
import type { StepState } from './runModel.ts';

export type CursorKind = 'arrow' | 'beam';

// What the overlay draws.
export interface CursorView {
  // Where the tip is, in the overlay's own pixels.
  x: number;
  y: number;
  // An arrow, or a text cursor in a field being typed in.
  kind: CursorKind;
  // Blue while it acts; amber while it waits for you.
  tone: 'acting' | 'waiting';
  // A short plain verb: "Clicking", "Typing", "Scrolling ↓", "Waiting for you".
  tag: string;
  // A click has just landed: a soft glow under the tip.
  burst: boolean;
}

export interface CursorInput {
  toolName: string;
  state: StepState;
  // The box of the element the step acts on (null if none, or not measured).
  rect: Rect | null;
  // The page area, in overlay pixels.
  page: { width: number; height: number };
  // For a scroll: which way.
  direction: 'up' | 'down' | null;
  // How long ago the step finished (null while it has not).
  sinceDoneMs: number | null;
}

// A finished step keeps its cursor this long, so a click is seen to land.
export const CURSOR_DONE_MS = 400;

const TAGS: Record<string, string> = {
  click: 'Clicking',
  type_text: 'Typing',
  select_option: 'Choosing',
};

const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));

// Which way a scroll step goes, from the step's arguments as the model wrote them (anything
// but "up" or "down" is no direction, so nothing is drawn for it).
export function scrollDirection(args: string): 'up' | 'down' | null {
  try {
    const parsed: unknown = JSON.parse(args);
    const direction =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>).direction
        : null;
    return direction === 'up' || direction === 'down' ? direction : null;
  } catch {
    return null;
  }
}

// The cursor to draw now, or null. Clicking and choosing show an arrow in the middle of the
// element; typing a text cursor at the start of the field; scrolling an arrow in the middle of
// the page. While you are being asked it rests just above the element, amber, with no click.
// Nothing for a blocked, declined, stopped or failed step, or one with no element to point at.
export function cursorFor(input: CursorInput): CursorView | null {
  const { toolName, state, rect, page, direction, sinceDoneMs } = input;
  const scrolling = toolName === 'scroll';
  if (!scrolling && !(toolName in TAGS)) return null;
  if (scrolling && direction === null) return null;

  let tone: CursorView['tone'];
  if (state === 'running') tone = 'acting';
  else if (state === 'waiting') tone = 'waiting';
  else if (
    state === 'done' &&
    sinceDoneMs !== null &&
    sinceDoneMs <= CURSOR_DONE_MS
  )
    tone = 'acting';
  else return null;

  const burst =
    state === 'done' && (toolName === 'click' || toolName === 'select_option');
  const tag =
    tone === 'waiting'
      ? 'Waiting for you'
      : scrolling
        ? `Scrolling ${direction === 'up' ? '↑' : '↓'}`
        : TAGS[toolName];

  let x: number;
  let y: number;
  if (scrolling) {
    x = page.width / 2;
    y = page.height / 2;
  } else {
    if (rect === null) return null;
    x =
      toolName === 'type_text'
        ? rect.x + Math.min(16, rect.width / 2)
        : rect.x + rect.width / 2;
    y = tone === 'waiting' ? rect.y - 4 : rect.y + rect.height / 2;
  }
  return {
    x: Math.round(clamp(x, 4, Math.max(4, page.width - 4))),
    y: Math.round(clamp(y, 4, Math.max(4, page.height - 4))),
    kind: toolName === 'type_text' ? 'beam' : 'arrow',
    tone,
    tag,
    burst,
  };
}
