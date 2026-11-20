// How the assistant's work is shown on the page itself: a glow round the page while it
// works in the page, a small pill at the top with its state and Stop, a ring on the element
// it acts on, and a card that pops out over the page when it needs your approval. This file is
// the settings for that and the rule for what to show right now. Pure code with no Electron and
// no React, so it is easy to test. The drawing is in OverlayApp.tsx; the view that holds it,
// above the page, is managed in tabs.ts.
import type { CardDetails } from './approvalCard.ts';
import type { CursorView } from './cursor.ts';
import type { MadeItem } from './chats.ts';
import type { MarkerView, Rect } from './marker.ts';
import { stepSite } from './runModel.ts';
import type {
  RecentStep,
  RunView,
  RunWord,
  StepSite,
  ToolPartView,
} from './runModel.ts';
import type { ChatMessage } from './chats.ts';

export type ShowWork = 'glow-marker' | 'glow' | 'off';
export const SHOW_WORK_OPTIONS: readonly ShowWork[] = [
  'glow-marker',
  'glow',
  'off',
];

export interface AgentVisualSettings {
  version: 1;
  // Show the assistant's work on pages: the glow and the marker, the glow only, or not.
  // (An approval card always pops out, whatever this says: it is a question, not decoration.)
  showWork: ShowWork;
  // The "Finished" or "Stopped" pill stays on the page until you dismiss it.
  keepFinished: boolean;
  // The assistant's cursor is drawn on the page while it clicks, types, chooses or scrolls.
  showCursor: boolean;
  // A small picture in the step row of a screenshot the assistant took (kept for this session only).
  showThumbnails: boolean;
}

export const defaultAgentVisualSettings = (): AgentVisualSettings => ({
  version: 1,
  showWork: 'glow-marker',
  keepFinished: true,
  showCursor: true,
  showThumbnails: true,
});

// Turn whatever is on disk into valid settings; anything odd gets its default. Never throws.
export function parseAgentVisualSettings(raw: unknown): AgentVisualSettings {
  const settings = defaultAgentVisualSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const r = raw as Record<string, unknown>;
  const show = SHOW_WORK_OPTIONS.find((o) => o === r.showWork);
  if (show) settings.showWork = show;
  if (typeof r.keepFinished === 'boolean')
    settings.keepFinished = r.keepFinished;
  if (typeof r.showCursor === 'boolean') settings.showCursor = r.showCursor;
  if (typeof r.showThumbnails === 'boolean')
    settings.showThumbnails = r.showThumbnails;
  return settings;
}

// ---- The approval card that pops out over the page ---------------------------------------

// What the pop-out card needs: the waiting step, as the app wrote it (never anything a page
// supplied beyond the cleaned words the plan already holds).
export interface PopoutCard {
  messageId: number;
  partId: number;
  toolName: string;
  // The question, as the app wrote it.
  ask: string;
  risky: boolean;
  card: CardDetails | null;
  // Where it happens, if the step names a tab.
  site: StepSite | null;
}

// The waiting step of a reply as a pop-out card, or null if nothing is waiting for you.
export function popoutOf(
  message: ChatMessage | undefined,
  tabs: readonly { id: number; url: string; favicon: string | null }[],
): PopoutCard | null {
  if (
    !message ||
    message.role !== 'assistant' ||
    message.status !== 'streaming'
  ) {
    return null;
  }
  const part = message.parts.find(
    (p): p is ToolPartView => p.type === 'tool' && p.status === 'waiting',
  );
  if (!part) return null;
  return {
    messageId: message.id,
    partId: part.id,
    toolName: part.name,
    ask: part.ask,
    risky: part.risky,
    card: part.card ?? null,
    site: stepSite(part, tabs),
  };
}

// Which side of the page the card goes: the bottom, unless the element being marked is down
// there (then the top, under the pill), so the card never covers what it asks about.
export function cardSide(
  marker: Rect | null,
  viewport: { height: number },
  cardHeight: number,
): 'bottom' | 'top' {
  if (marker === null) return 'bottom';
  const margin = 16;
  const bottomBand = viewport.height - cardHeight - margin;
  return marker.y + marker.height > bottomBand ? 'top' : 'bottom';
}

// ---- What the overlay shows --------------------------------------------------------------

export type OverlayTone =
  | 'working'
  | 'waiting'
  | 'stuck'
  | 'finished'
  | 'stopped';

export interface OverlayState {
  // "frame": the overlay covers the whole page (a glow, the marker or a card on it); "pill":
  // only the strip at the top.
  mode: 'frame' | 'pill';
  // The glow round the page (while it works in this page).
  glow: boolean;
  // The pill at the top.
  pill: boolean;
  // A softer glow: it is only reading.
  soft: boolean;
  word: RunWord;
  tone: OverlayTone;
  // What it is doing: "Clicking" and "Add to cart".
  verb: string;
  target: string | null;
  step: number;
  // It has finished, stopped or got stuck (the pill then has a way to dismiss it).
  ended: boolean;
  // The ring on the element it is acting on, if there is one to show.
  marker: MarkerView | null;
  // Its cursor, if there is one to show.
  cursor: CursorView | null;
  // The approval card popped out over the page.
  card: PopoutCard | null;
  // The last few steps, shown when the pill is hovered or focused (empty: nothing to show).
  recent: RecentStep[];
  // The card was minimized: only its strip is shown (what it asks, Review, Go to tab, Stop),
  // and the page is yours to use meanwhile.
  minimized: boolean;
  // The step's tab is open but not the one on screen, so there is a "Go to tab" button.
  goToTab: boolean;
  // The question's first line (for the minimized strip), or null.
  askLine: string | null;
  // What a finished run made last, for the pill's Open button.
  made?: MadeItem | null;
}

// What the chat needs to know of the overlay, so each fact is shown in one place: while the
// pill is on the page the chat leaves out its own run bar, and while a card is popped out (or
// minimized) the chat shows a note instead of the card.
export interface OverlayFlags {
  pill: boolean;
  card: boolean;
}

export const noOverlayFlags = (): OverlayFlags => ({
  pill: false,
  card: false,
});

export function overlayFlags(state: OverlayState | null): OverlayFlags {
  if (state === null) return noOverlayFlags();
  return {
    pill: state.pill,
    card: state.card !== null || state.minimized,
  };
}

export interface OverlayInput {
  run: RunView | null;
  // The tab on screen when it is a web page (null: something else is on screen, such as a
  // Space's overview or an artifact), and whether the page area is on screen at all.
  activeTab: number | null;
  pageShown: boolean;
  // You dismissed the pill of this run.
  dismissed: boolean;
  settings: AgentVisualSettings;
  // The marker worked out by the app (only shown with the glow, and when the setting says).
  marker?: MarkerView | null;
  // The cursor worked out by the app (only shown with the glow, and when the setting says).
  cursor?: CursorView | null;
  // The last few steps of the run, for the pill's hover list.
  recent?: readonly RecentStep[];
  // The step waiting for your approval, if any.
  approval?: PopoutCard | null;
  // You minimized that card.
  minimized?: boolean;
  // The step's tab is open and is not the one on screen.
  goToTab?: boolean;
}

// What to show now, or null for nothing. While the assistant works on the page that is on
// screen, the page glows (strongly when it is waiting for you). A step waiting for your
// approval pops its card out over the page whatever is on screen there. When the run has
// finished, stopped or got stuck, a pill stays until you dismiss it. Nothing is drawn for a
// step that is not on this page (tabs, your history, artifacts...) unless it needs an answer:
// those speak in the chat.
export function overlayFor(input: OverlayInput): OverlayState | null {
  const { run, activeTab, pageShown, dismissed, settings, marker, approval } =
    input;
  if (run === null || !pageShown) return null;
  const showWork = settings.showWork !== 'off';
  const base = {
    word: run.word,
    verb: run.verb,
    target: run.target,
    step: run.stepNumber,
  };
  if (run.word === 'working' || run.word === 'waiting') {
    const onPage =
      run.touchesPage && activeTab !== null && run.tabId === activeTab;
    const glow = showWork && onPage;
    const card = run.word === 'waiting' ? (approval ?? null) : null;
    if (!glow && !card) return null;
    // Minimized: just the strip, so the page below it is yours (a question is never hidden
    // away completely, whatever the display setting says).
    if (card && input.minimized) {
      return {
        ...base,
        mode: 'pill',
        glow: false,
        pill: true,
        soft: false,
        tone: 'waiting',
        ended: false,
        marker: null,
        cursor: null,
        card: null,
        recent: [],
        minimized: true,
        goToTab: input.goToTab === true,
        askLine: card.ask.split('\n')[0],
      };
    }
    return {
      ...base,
      mode: 'frame',
      glow,
      pill: showWork,
      soft: run.reading && run.word === 'working',
      tone: run.word,
      ended: false,
      marker:
        glow && settings.showWork === 'glow-marker' ? (marker ?? null) : null,
      cursor: glow && settings.showCursor ? (input.cursor ?? null) : null,
      card,
      recent: showWork ? [...(input.recent ?? [])] : [],
      minimized: false,
      goToTab: card !== null && input.goToTab === true,
      askLine: null,
    };
  }
  if (!showWork || !settings.keepFinished || dismissed) return null;
  return {
    ...base,
    mode: 'pill',
    glow: false,
    pill: true,
    soft: false,
    tone: run.word,
    ended: true,
    marker: null,
    cursor: null,
    card: null,
    recent: [...(input.recent ?? [])],
    minimized: false,
    goToTab: false,
    askLine: null,
    made: run.word === 'finished' ? (run.made ?? null) : null,
  };
}

// Where the overlay's view goes: the whole page for the glow, the marker or the card, or a
// strip at the top for the pill alone (so the page below it stays usable).
export const PILL_HEIGHT = 34;
export const PILL_MAX_WIDTH = 560;
// The room under the strip for the pill's hover list (three lines and its padding).
export const PEEK_EXTRA = 112;

// `peek`: the hover list is open, so the strip is taller for as long as it is.
export function overlayBounds(
  mode: 'frame' | 'pill',
  page: { x: number; y: number; width: number; height: number },
  peek = false,
): { x: number; y: number; width: number; height: number } {
  if (mode === 'frame') return page;
  const width = Math.max(0, Math.min(PILL_MAX_WIDTH, page.width - 24));
  return {
    x: Math.round(page.x + (page.width - width) / 2),
    y: page.y,
    width: Math.round(width),
    height: Math.min(PILL_HEIGHT + (peek ? PEEK_EXTRA : 0), page.height),
  };
}
