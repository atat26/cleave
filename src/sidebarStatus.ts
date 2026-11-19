// What the sidebar shows of the assistant's work: a dot on each tab (blue while it works there,
// amber while it waits for you, red when it got stuck, green when it finished while you were
// elsewhere, until you open the tab), a count on each Space, and one line at the top while a
// run is going. Pure code with no Electron and no React, so it is easy to test. The drawing is
// in Sidebar.tsx; the facts come from the same run the pill and the run bar use (runModel.ts).
import type { RunView } from './runModel.ts';

export type TabStatus = 'working' | 'waiting' | 'stuck' | 'finished';

// A tab's mark that stays until you open the tab.
export type Unseen = 'finished' | 'stuck';

// Most urgent first: what a collapsed Space shows when several of its tabs have a dot.
export const STATUS_ORDER: readonly TabStatus[] = [
  'stuck',
  'waiting',
  'working',
  'finished',
];

export interface StatusInput {
  run: RunView | null;
  // The tabs the assistant is working in right now.
  working: ReadonlySet<number>;
  // Tabs where its work finished or got stuck while you were elsewhere.
  unseen: ReadonlyMap<number, Unseen>;
  // The tab on screen, if a web tab is.
  activeTab: number | null;
}

// The dot of each tab that has one. Work in progress shows blue (amber for the tab of the step
// waiting for you); what is left over from a finished run shows green or red, except on the tab
// you are looking at (there is nothing to tell you about a tab you are in).
export function tabStatuses(input: StatusInput): Map<number, TabStatus> {
  const { run, working, unseen, activeTab } = input;
  const result = new Map<number, TabStatus>();
  for (const [tab, mark] of unseen) {
    if (tab !== activeTab) result.set(tab, mark);
  }
  if (run !== null && (run.word === 'working' || run.word === 'waiting')) {
    for (const tab of working) result.set(tab, 'working');
    if (run.word === 'waiting' && run.tabId !== null) {
      result.set(run.tabId, 'waiting');
    }
  }
  return result;
}

// What is left to see when a run has ended: green on each tab it worked in (other than the one
// you are in) if it finished, red on the tab it got stuck in. Nothing if you stopped it.
export function unseenAfterRun(
  run: RunView | null,
  ranIn: ReadonlySet<number>,
  activeTab: number | null,
): Map<number, Unseen> {
  const result = new Map<number, Unseen>();
  if (run === null) return result;
  if (run.word === 'finished') {
    for (const tab of ranIn) {
      if (tab !== activeTab) result.set(tab, 'finished');
    }
  } else if (run.word === 'stuck') {
    if (run.tabId !== null && run.tabId !== activeTab) {
      result.set(run.tabId, 'stuck');
    }
  }
  return result;
}

export interface SpaceSummary {
  // How many of its tabs the assistant is working in.
  working: number;
  // The most urgent dot among its tabs, or null.
  urgent: TabStatus | null;
}

export function spaceSummary(
  statuses: readonly (TabStatus | null)[],
): SpaceSummary {
  let working = 0;
  let urgent: TabStatus | null = null;
  for (const status of statuses) {
    if (status === null) continue;
    if (status === 'working') working++;
    if (
      urgent === null ||
      STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf(urgent)
    ) {
      urgent = status;
    }
  }
  return { working, urgent };
}

// The line at the top of the sidebar while a run is going.
export interface RunChip {
  tone: 'working' | 'waiting' | 'stuck';
  text: string;
}

export interface ChipInput {
  run: RunView | null;
  // How many tabs it is working in now.
  workingTabs: number;
  // For a batch waiting for you, how many tabs it would change (0: not a batch).
  changes: number;
  // Some tab is marked stuck.
  stuck: boolean;
}

// "Assistant is working in 3 tabs", "...is waiting for you · 2 changes", "...is stuck · needs
// you". Null when no run is active (a stuck one stays only while its tab is marked).
export function runChip(input: ChipInput): RunChip | null {
  const { run, workingTabs, changes, stuck } = input;
  if (run === null) return null;
  if (run.word === 'working') {
    return {
      tone: 'working',
      text:
        workingTabs > 0
          ? `Assistant is working in ${workingTabs} tab${workingTabs === 1 ? '' : 's'}`
          : 'Assistant is working',
    };
  }
  if (run.word === 'waiting') {
    return {
      tone: 'waiting',
      text:
        changes > 1
          ? `Assistant is waiting for you · ${changes} changes`
          : 'Assistant is waiting for you',
    };
  }
  if (run.word === 'stuck' && stuck) {
    return { tone: 'stuck', text: 'Assistant is stuck · needs you' };
  }
  return null;
}

// What the status words say to someone who cannot see the colour.
export const STATUS_WORDS: Record<TabStatus, string> = {
  working: 'The assistant is working in this tab',
  waiting: 'The assistant is waiting for you in this tab',
  stuck: 'The assistant got stuck in this tab',
  finished: 'The assistant finished its work in this tab',
};
