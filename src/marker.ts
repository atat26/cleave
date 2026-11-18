// The marker: a ring and a short label on the exact element the assistant is about to click,
// type in or choose from, so you can see what it is doing without reading. This file works
// out where it goes and what it says. Pure code with no Electron and no React, so it is easy
// to test. The measuring is in pageActions.ts (locateControl), the drawing in OverlayApp.tsx.
import type { StepState } from './runModel.ts';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The element a step is about: which tab, the browser's own id for the element, and its name
// (cleaned, never anything typed into it).
export interface StepTarget {
  tabId: number;
  backendNodeId: number;
  name: string;
}

export type MarkerTone = 'acting' | 'waiting' | 'blocked' | 'done';
export type LabelPlacement = 'above' | 'below' | 'inside';

// What the overlay draws.
export interface MarkerView {
  // Where, in the overlay's own pixels.
  rect: Rect;
  tone: MarkerTone;
  label: string;
  placement: LabelPlacement;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

// The box of an element from the browser's answer to "where is it" (a list of four-cornered
// shapes, as eight numbers each): the first one with a real size, as a rectangle. Null if
// there is none (the element is hidden or gone).
export function rectFromQuads(answer: unknown): Rect | null {
  const quads =
    isRecord(answer) && Array.isArray(answer.quads) ? answer.quads : [];
  for (const quad of quads) {
    if (!Array.isArray(quad) || quad.length < 8) continue;
    const nums = quad.slice(0, 8);
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n)))
      continue;
    const xs = [nums[0], nums[2], nums[4], nums[6]] as number[];
    const ys = [nums[1], nums[3], nums[5], nums[7]] as number[];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width < 1 || height < 1) continue;
    return { x, y, width, height };
  }
  return null;
}

// A page's box (in its own CSS pixels, from its top left) as the overlay sees it: scaled by
// the page's zoom and kept inside the page. Null if none of it is on screen.
export function toOverlayRect(
  css: Rect,
  zoom: number,
  viewport: { width: number; height: number },
): Rect | null {
  if (!(zoom > 0) || !Number.isFinite(zoom)) return null;
  const left = Math.max(0, css.x * zoom);
  const top = Math.max(0, css.y * zoom);
  const right = Math.min(viewport.width, (css.x + css.width) * zoom);
  const bottom = Math.min(viewport.height, (css.y + css.height) * zoom);
  if (right - left < 1 || bottom - top < 1) return null;
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

// What the marker's colour says, from how the step is going (none for a step that is not
// being shown: queued, declined by you, cut off).
export function markerTone(state: StepState): MarkerTone | null {
  switch (state) {
    case 'running':
      return 'acting';
    case 'waiting':
      return 'waiting';
    case 'blocked':
    case 'failed':
      return 'blocked';
    case 'done':
      return 'done';
    default:
      return null;
  }
}

const NOW_WORD: Record<string, string> = {
  click: 'Clicking',
  type_text: 'Typing',
  select_option: 'Choosing',
};
const DONE_WORD: Record<string, string> = {
  click: 'Clicked',
  type_text: 'Typed',
  select_option: 'Chose',
};
export const MAX_MARKER_NAME = 40;

// The short words on the ring: "Clicking · Add to cart", "Waiting for you · Search",
// "Typed · Search", "Not done · Search". Only the tool's own wording and the element's name.
export function markerLabel(
  toolName: string,
  tone: MarkerTone,
  name: string,
): string {
  const shown = name.replace(/\s+/g, ' ').trim().slice(0, MAX_MARKER_NAME);
  const word =
    tone === 'waiting'
      ? 'Waiting for you'
      : tone === 'blocked'
        ? 'Not done'
        : tone === 'done'
          ? (DONE_WORD[toolName] ?? 'Done')
          : (NOW_WORD[toolName] ?? 'Working');
  return shown === '' ? word : `${word} · ${shown}`;
}

export const LABEL_HEIGHT = 22;
const LABEL_GAP = 6;

// Where the label goes: above the ring, or below it when there is no room above (or the pill
// hangs there), or inside its top corner when there is no room either way.
export function labelPlacement(
  rect: Rect,
  viewport: { width: number; height: number },
  pill: { x: number; width: number; height: number } | null,
): LabelPlacement {
  const needed = LABEL_HEIGHT + LABEL_GAP;
  const underPill =
    pill !== null &&
    rect.y - needed < pill.height &&
    rect.x < pill.x + pill.width &&
    rect.x + Math.min(rect.width, 240) > pill.x;
  if (rect.y >= needed && !underPill) return 'above';
  if (rect.y + rect.height + needed <= viewport.height) return 'below';
  return 'inside';
}
