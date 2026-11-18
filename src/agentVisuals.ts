// How the assistant's work is shown on the page itself: a glow round the page while it
// works in the page, and a small pill at the top with its state and Stop. This file is the
// settings for that and the rule for what to show right now. Pure code with no Electron
// and no React, so it is easy to test. The drawing is in OverlayApp.tsx; the view that
// holds it, above the page, is managed in tabs.ts.
import type { MarkerView } from './marker.ts';
import type { RunView, RunWord } from './runModel.ts';

export type ShowWork = 'glow-marker' | 'glow' | 'off';
export const SHOW_WORK_OPTIONS: readonly ShowWork[] = [
  'glow-marker',
  'glow',
  'off',
];

export interface AgentVisualSettings {
  version: 1;
  // Show the assistant's work on pages: the glow and the marker, the glow only, or not.
  showWork: ShowWork;
  // The "Finished" or "Stopped" pill stays on the page until you dismiss it.
  keepFinished: boolean;
}

export const defaultAgentVisualSettings = (): AgentVisualSettings => ({
  version: 1,
  showWork: 'glow-marker',
  keepFinished: true,
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
  return settings;
}

// What the overlay on the page should show.
export type OverlayTone =
  | 'working'
  | 'waiting'
  | 'stuck'
  | 'finished'
  | 'stopped';

export interface OverlayState {
  // "frame": a glow round the whole page (while it works there); "pill": only the pill.
  mode: 'frame' | 'pill';
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
}

export interface OverlayInput {
  run: RunView | null;
  // The tab on screen, and whether the page is on screen at all.
  activeTab: number | null;
  pageShown: boolean;
  // You dismissed the pill of this run.
  dismissed: boolean;
  settings: AgentVisualSettings;
  // The marker worked out by the app (only shown with the glow, and when the setting says).
  marker?: MarkerView | null;
}

// What to show now, or null for nothing. While the assistant works on the page that is on
// screen, the page glows (strongly when it is waiting for you). When it has finished,
// stopped or got stuck, a pill stays until you dismiss it. Nothing is shown for a step that
// is not on this page (tabs, your history, artifacts...): those speak in the chat.
export function overlayFor(input: OverlayInput): OverlayState | null {
  const { run, activeTab, pageShown, dismissed, settings, marker } = input;
  if (settings.showWork === 'off' || run === null) return null;
  if (!pageShown || activeTab === null) return null;
  const base = {
    word: run.word,
    verb: run.verb,
    target: run.target,
    step: run.stepNumber,
  };
  if (run.word === 'working' || run.word === 'waiting') {
    if (!run.touchesPage || run.tabId !== activeTab) return null;
    return {
      ...base,
      mode: 'frame',
      soft: run.reading && run.word === 'working',
      tone: run.word,
      ended: false,
      marker: settings.showWork === 'glow-marker' ? (marker ?? null) : null,
    };
  }
  if (!settings.keepFinished || dismissed) return null;
  return {
    ...base,
    mode: 'pill',
    soft: false,
    tone: run.word,
    ended: true,
    marker: null,
  };
}

// Where the overlay's view goes: the whole page for the glow, or a strip at the top for the
// pill (so the page below it stays usable).
export const PILL_HEIGHT = 34;
export const PILL_MAX_WIDTH = 560;

export function overlayBounds(
  mode: 'frame' | 'pill',
  page: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (mode === 'frame') return page;
  const width = Math.max(0, Math.min(PILL_MAX_WIDTH, page.width - 24));
  return {
    x: Math.round(page.x + (page.width - width) / 2),
    y: page.y,
    width: Math.round(width),
    height: Math.min(PILL_HEIGHT, page.height),
  };
}
