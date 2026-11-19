// Which tabs a waiting request would change, so the sidebar can tint their rows before you
// answer: blue with "→ Space name" for a move, red with "Close" for a close. Pure code with no
// Electron and no React, so it is easy to test. The drawing is in Sidebar.tsx.
//
// The request's numbers were written by the assistant, so each one is checked against the real
// tabs and Spaces, and the words shown are only ever our own ("→", "Close") and the name of
// one of your own Spaces: nothing the assistant wrote is displayed.

export interface PendingChange {
  kind: 'move' | 'close';
  // The short tag on the row: "→ Reading" or "Close".
  tag: string;
  // The same in words, for the pointer and for screen readers.
  words: string;
}

export interface PendingTab {
  id: number;
  spaceId: number | null;
  // A closed link kept in a Space (no tab is open, so there is no row to tint).
  closed: boolean;
}

export interface PendingSpace {
  id: number;
  name: string;
}

// The part of a step this needs.
export interface PendingStep {
  name: string;
  arguments: string;
  status: string;
}

export const MAX_SPACE_NAME_SHOWN = 24;

const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;

const shortName = (name: string): string => {
  const clean = name.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_SPACE_NAME_SHOWN
    ? `${clean.slice(0, MAX_SPACE_NAME_SHOWN - 1)}…`
    : clean;
};

function parseArgs(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// The tabs the step (if it is waiting for you) would move or close, by tab number. A move that
// would leave a tab where it is, a tab or Space that does not exist, and a closed link are left
// out.
export function pendingChanges(
  step: PendingStep | null,
  tabs: readonly PendingTab[],
  spaces: readonly PendingSpace[],
): Map<number, PendingChange> {
  const result = new Map<number, PendingChange>();
  if (step === null || step.status !== 'waiting') return result;
  const args = parseArgs(step.arguments);
  if (args === null) return result;
  const openTab = (id: unknown) =>
    isId(id) ? tabs.find((t) => t.id === id && !t.closed) : undefined;

  if (step.name === 'close_tab') {
    const tab = openTab(args.tab);
    if (tab) {
      result.set(tab.id, {
        kind: 'close',
        tag: 'Close',
        words: 'Will be closed',
      });
    }
  } else if (step.name === 'move_tabs' && Array.isArray(args.moves)) {
    for (const move of args.moves) {
      if (typeof move !== 'object' || move === null) continue;
      const { tab: tabId, space: spaceId } = move as Record<string, unknown>;
      const tab = openTab(tabId);
      if (!tab) continue;
      if (spaceId === null) {
        if (tab.spaceId === null) continue;
        result.set(tab.id, {
          kind: 'move',
          tag: '→ No Space',
          words: 'Will move out of its Space',
        });
        continue;
      }
      if (!isId(spaceId) || spaceId === tab.spaceId) continue;
      const space = spaces.find((s) => s.id === spaceId);
      if (!space) continue;
      const name = shortName(space.name);
      result.set(tab.id, {
        kind: 'move',
        tag: `→ ${name}`,
        words: `Will move to ${name}`,
      });
    }
  }
  return result;
}

// How many of these tabs have a pending change (for a collapsed Space's header).
export function countPending(
  tabs: readonly { pending: PendingChange | null }[],
): number {
  return tabs.filter((t) => t.pending !== null).length;
}
