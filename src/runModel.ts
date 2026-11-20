// What the assistant is doing, worked out for the screen: each tool call as a step in
// one of a few states, steps grouped when there are many reads in a row, and one
// summary of the whole run (for the run bar). Pure code with no Electron and no React,
// so it is easy to test. The look is in StepList.tsx and components.css.
import { MAX_ACTIONS } from './agentActions.ts';
import type { ChatMessage, LimitKind, MadeItem, MessagePart } from './chats.ts';
import { TOOL_CATALOG } from './toolPolicy.ts';

export type ToolPartView = Extract<MessagePart, { type: 'tool' }>;

// How a step is going. (A step that is queued behind another is not shown: steps are
// added to the reply one at a time as they start.)
export type StepState =
  | 'running'
  | 'waiting' // for you to approve it
  | 'done'
  | 'declined' // you said no
  | 'blocked' // a safety rule, a limit or a setting stopped it
  | 'failed'
  | 'stopped'; // the reply was stopped before it finished

export const STATE_WORDS: Record<StepState, string> = {
  running: 'Running',
  waiting: 'Waiting for you',
  done: 'Done',
  declined: 'Declined by you',
  blocked: 'Blocked',
  failed: 'Failed',
  stopped: 'Not done',
};

export function stepState(
  part: ToolPartView,
  messageStatus: ChatMessage['status'],
): StepState {
  const live = messageStatus === 'streaming';
  if (part.status === 'waiting') return live ? 'waiting' : 'stopped';
  if (part.status === 'running') return live ? 'running' : 'stopped';
  if (part.status === 'ok') return 'done';
  if (part.status === 'declined') return 'declined';
  // You closed its tab while it ran: it was cut short, not a failure.
  if (part.skipped === true) return 'stopped';
  return part.blocked === true ? 'blocked' : 'failed';
}

// ---- One step ------------------------------------------------------------------------

export type StepKind = 'read' | 'act' | 'tabs' | 'recall' | 'make' | 'talk';

const KIND_OF_GROUP: Record<string, StepKind> = {
  look: 'read',
  act: 'act',
  tabs: 'tabs',
  recall: 'recall',
  skills: 'make',
  artifacts: 'make',
  chat: 'talk',
};

export const stepKind = (toolName: string): StepKind => {
  const tool = TOOL_CATALOG.find((t) => t.name === toolName);
  return tool ? (KIND_OF_GROUP[tool.group] ?? 'read') : 'read';
};

// The page-reading tools: three or more in a row fold into one line.
const READING_TOOLS = new Set([
  'read_page',
  'read_pages',
  'read_link',
  'look_at_page',
  'read_tables',
  'find_in_page',
  'screenshot_page',
]);
export const isReadingTool = (toolName: string): boolean =>
  READING_TOOLS.has(toolName);

// A step's line is written "Verb: target" ("Read: Best Buy Store Locator"). The target
// is drawn bold.
export function splitLabel(label: string): {
  verb: string;
  target: string | null;
} {
  const match = /^([^:]{1,40}): (.+)$/s.exec(label);
  return match
    ? { verb: match[1], target: match[2] }
    : { verb: label, target: null };
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return '';
  }
};

export interface StepSite {
  host: string;
  favicon: string | null;
}

// The site a step is about: the tab it names (from its arguments), or an address it
// was given.
export function stepSite(
  part: ToolPartView,
  tabs: readonly { id: number; url: string; favicon: string | null }[],
): StepSite | null {
  let args: unknown;
  try {
    args = JSON.parse(part.arguments);
  } catch {
    return null;
  }
  if (typeof args !== 'object' || args === null) return null;
  const { tab, url } = args as { tab?: unknown; url?: unknown };
  if (typeof tab === 'number') {
    const found = tabs.find((t) => t.id === tab);
    if (found) {
      const host = hostOf(found.url);
      return host === '' ? null : { host, favicon: found.favicon };
    }
  }
  if (typeof url === 'string') {
    const host = hostOf(url);
    if (host !== '') return { host, favicon: null };
  }
  return null;
}

export interface StepView {
  part: ToolPartView;
  state: StepState;
  verb: string;
  target: string | null;
  // How it ended, in the app's words (empty while it is still going).
  result: string;
  kind: StepKind;
  risky: boolean;
  // You approved it on a card.
  allowed: boolean;
}

export function stepView(
  part: ToolPartView,
  messageStatus: ChatMessage['status'],
): StepView {
  const state = stepState(part, messageStatus);
  const { verb, target } = splitLabel(part.label);
  return {
    part,
    state,
    verb,
    target,
    result: state === 'running' || state === 'waiting' ? '' : part.outcome,
    kind: stepKind(part.name),
    risky: part.risky,
    allowed:
      part.ask !== '' && (part.status === 'ok' || part.status === 'running'),
  };
}

// What a step that is still running is waiting on, told from its tab: "Waiting for Shop D to
// load" while the page loads, and whether the tab was asleep and is being woken for it.
export interface RunningNote {
  line: string;
  asleep: boolean;
}

export function runningNote(
  step: Pick<StepView, 'state' | 'part'>,
  tabs: readonly {
    id: number;
    title: string;
    url: string;
    loading: boolean;
    wokeForAssistant: boolean;
  }[],
): RunningNote | null {
  if (step.state !== 'running') return null;
  const id = stepTabId(step.part);
  const tab = id === null ? undefined : tabs.find((t) => t.id === id);
  if (!tab) return null;
  const asleep = tab.wokeForAssistant;
  if (!tab.loading) return asleep ? { line: '', asleep } : null;
  const name = (tab.title || hostOf(tab.url))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return {
    line:
      name === ''
        ? 'Waiting for the page to load'
        : `Waiting for ${name} to load`,
    asleep,
  };
}

// "Try again" is offered for a step that failed or was cut off, in the newest reply,
// when nothing else is being written. (Not for a refusal, a decline, or a step that
// worked.)
export function canRetry(
  step: Pick<StepView, 'state'>,
  isNewestReply: boolean,
  busy: boolean,
): boolean {
  return (
    isNewestReply &&
    !busy &&
    (step.state === 'failed' || step.state === 'stopped')
  );
}

// The message sent to the assistant for "Try again". Only fixed words and the tool's
// own name: nothing from a web page goes into a message that counts as yours.
export function retryRequest(toolName: string): string {
  const title = TOOL_CATALOG.find((t) => t.name === toolName)?.title;
  return title
    ? `The step "${title}" did not work. Please try it again, or tell me what went wrong.`
    : 'The last step did not work. Please try it again, or tell me what went wrong.';
}

// ---- Groups of reads -------------------------------------------------------------------

export const GROUP_MIN = 3;

export type Block =
  | { type: 'part'; index: number }
  // Consecutive page reads, shown as one line that opens to the steps.
  | { type: 'group'; indexes: number[] };

// Walk a reply's parts: three or more reading steps in a row (none waiting for you)
// become one group; everything else stays as it is.
export function blocksOf(parts: readonly MessagePart[]): Block[] {
  const blocks: Block[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= GROUP_MIN) blocks.push({ type: 'group', indexes: run });
    else for (const index of run) blocks.push({ type: 'part', index });
    run = [];
  };
  parts.forEach((part, index) => {
    if (
      part.type === 'tool' &&
      isReadingTool(part.name) &&
      part.status !== 'waiting'
    ) {
      run.push(index);
      return;
    }
    flush();
    blocks.push({ type: 'part', index });
  });
  flush();
  return blocks;
}

// The line for a group: "Reading 3 pages" while it goes, "Read 3 pages" after.
export function groupTitle(
  steps: readonly Pick<StepView, 'state' | 'part'>[],
): {
  title: string;
  progress: string;
} {
  const n = steps.length;
  const finished = steps.filter((s) => s.state !== 'running').length;
  const everyRead = steps.every(
    (s) => s.part.name === 'read_page' || s.part.name === 'read_link',
  );
  const going = steps.some((s) => s.state === 'running');
  const word = everyRead
    ? going
      ? 'Reading'
      : 'Read'
    : going
      ? 'Looking at'
      : 'Looked at';
  return {
    title: `${word} ${n} pages`,
    progress: going ? `${finished} of ${n} done` : '',
  };
}

// The state a group shows: that of its first step that is not finished, or else the
// worst thing that happened.
export function groupState(
  steps: readonly Pick<StepView, 'state'>[],
): StepState {
  const open = steps.find(
    (s) => s.state === 'running' || s.state === 'waiting',
  );
  if (open) return open.state;
  for (const bad of ['failed', 'blocked', 'stopped', 'declined'] as const) {
    if (steps.some((s) => s.state === bad)) return bad;
  }
  return 'done';
}

// ---- The whole run ---------------------------------------------------------------------

export type RunWord = 'working' | 'waiting' | 'stuck' | 'finished' | 'stopped';

export const RUN_WORDS: Record<RunWord, string> = {
  working: 'Working',
  waiting: 'Waiting for you',
  stuck: 'Stuck',
  finished: 'Finished',
  stopped: 'Stopped by you',
};

// What "Continue" says on your behalf after a Stop or a limit: a new reply in the same chat (which
// gets its own fresh limits), picking up from what the conversation already holds.
export const CONTINUE_TEXT = 'Please carry on where you left off.';

// The banner after a reply used up one of its limits. Neutral: a limit is not an error.
export const LIMIT_WORDS: Record<LimitKind, string> = {
  actions: `This reply reached its limit of ${MAX_ACTIONS} actions.`,
  reads: 'This reply read as many pages as it is allowed to at once.',
};

export interface RunView {
  word: RunWord;
  // What it is doing now (or did last): "Read" and "Best Buy Store Locator".
  verb: string;
  target: string | null;
  // One mark per step so far.
  ticks: StepState[];
  // Which step this is ("Step 4"); the total is not known unless there is a plan.
  stepNumber: number;
  // Which step it is (its number in the reply) and how it is going.
  partId: number;
  state: StepState;
  // The tab the current step is in (from its arguments), if it names one.
  tabId: number | null;
  // The current step reads or acts in that page (not tabs, history, artifacts...).
  touchesPage: boolean;
  // ...and only reads it.
  reading: boolean;
  // The limit the finished reply used up, if any (the chat offers to go on).
  limit?: LimitKind;
  // The last thing the finished reply made (a document, a skill, a Space), for an Open button.
  made?: MadeItem;
}

// What a finished reply made last, if anything: the thing its Open button opens.
export function madeOf(message: ChatMessage | undefined): MadeItem | null {
  if (!message || message.role !== 'assistant' || message.status !== 'done') {
    return null;
  }
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    if (part.type === 'tool' && part.status === 'ok' && part.made) {
      return part.made;
    }
  }
  return null;
}

// The words on the tooltip of an Open button, by what it opens.
export const MADE_WORDS: Record<MadeItem['kind'], string> = {
  artifact: 'Open the document it made',
  skill: 'Open your skills',
  space: 'Go to the Space it made',
};

// The tab a step names in its arguments, or null.
export function stepTabId(
  part: Pick<ToolPartView, 'arguments'>,
): number | null {
  try {
    const args: unknown = JSON.parse(part.arguments);
    if (typeof args !== 'object' || args === null) return null;
    const tab = (args as { tab?: unknown }).tab;
    return typeof tab === 'number' && Number.isInteger(tab) ? tab : null;
  } catch {
    return null;
  }
}

export const MAX_TICKS = 40;

// A step as the pill's hover list shows it: its state, and its line ("Read" and "Shop A").
export interface RecentStep {
  partId: number;
  state: StepState;
  verb: string;
  target: string | null;
}

export const RECENT_STEPS = 3;

// The last few steps of a reply, oldest first (so the newest is at the bottom), in the app's own
// wording. Empty when the reply used no tools.
export function recentSteps(
  message: ChatMessage | undefined,
  count = RECENT_STEPS,
): RecentStep[] {
  if (!message || message.role !== 'assistant') return [];
  return message.parts
    .filter((p): p is ToolPartView => p.type === 'tool')
    .slice(-count)
    .map((p) => {
      const view = stepView(p, message.status);
      return {
        partId: p.id,
        state: view.state,
        verb: view.verb,
        target: view.target,
      };
    });
}

// A summary of a reply's tool use, or null when it used no tools.
export function runOf(message: ChatMessage | undefined): RunView | null {
  if (!message || message.role !== 'assistant') return null;
  const steps = message.parts
    .filter((p): p is ToolPartView => p.type === 'tool')
    .map((p) => stepView(p, message.status));
  if (steps.length === 0) return null;
  const current =
    steps.find((s) => s.state === 'waiting') ??
    [...steps].reverse().find((s) => s.state === 'running') ??
    steps[steps.length - 1];
  const last = steps[steps.length - 1];
  const tabId = stepTabId(current.part);
  const bad = last.state === 'failed' || last.state === 'blocked';
  let word: RunWord;
  if (message.status === 'streaming') {
    word = steps.some((s) => s.state === 'waiting') ? 'waiting' : 'working';
  } else if (message.status === 'stopped') {
    word = 'stopped';
  } else if (message.status === 'error') {
    word = 'stuck';
  } else {
    word = bad ? 'stuck' : 'finished';
  }
  return {
    word,
    verb: current.verb,
    target: current.target,
    ticks: steps.slice(-MAX_TICKS).map((s) => s.state),
    stepNumber: steps.indexOf(current) + 1,
    partId: current.part.id,
    state: current.state,
    tabId,
    touchesPage:
      tabId !== null && (current.kind === 'read' || current.kind === 'act'),
    reading: current.kind === 'read',
    ...(message.status === 'done' && message.limit
      ? { limit: message.limit }
      : {}),
    ...(madeOf(message) ? { made: madeOf(message)! } : {}),
  };
}
