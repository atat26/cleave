// The assistant's tools as you see them (plain names and descriptions), how much
// each may do without asking, and the rule that combines your choice with the
// safety rules. Pure code, easy to test.
//
// Four levels, chosen per tool:
//   always  - goes ahead with no question (the hard "never" rules still apply)
//   if-safe - goes ahead unless the app judges it risky (buying, sending,
//             deleting, Enter, another website...); risky ones still ask
//   ask     - an approval card every time
//   never   - the tool is not offered to the assistant at all
//
// Some things are refused whatever you choose (typing in password or card fields,
// accepting terms or cookies, tabs that are not linked): those refusals are made
// before this file is asked anything, and nothing here can undo them.
import type { Plan } from './agentActions.ts';

export const APPROVAL_LEVELS = ['always', 'if-safe', 'ask', 'never'] as const;
export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];

export const isApprovalLevel = (value: unknown): value is ApprovalLevel =>
  typeof value === 'string' &&
  (APPROVAL_LEVELS as readonly string[]).includes(value);

// How each level is worded in the Tools panel.
export const LEVEL_WORDS: Record<ApprovalLevel, string> = {
  always: 'Always allow',
  'if-safe': 'Allow if safe',
  ask: 'Ask first',
  never: 'Never allow',
};

export type ToolGroup = 'look' | 'act' | 'chat';

export const GROUP_TITLES: Record<ToolGroup, string> = {
  look: 'Looking and reading',
  act: 'Acting in tabs',
  chat: 'Talking to you',
};

export interface ToolInfo {
  // The name the assistant calls it by.
  name: string;
  group: ToolGroup;
  // What you see in the panel.
  title: string;
  summary: string;
  defaultLevel: ApprovalLevel;
  // Does it change anything (a page, your tabs)? "Always allow" then gets a
  // warning when you choose it.
  changesThings: boolean;
}

// In the order they are shown.
export const TOOL_CATALOG: readonly ToolInfo[] = [
  {
    name: 'list_linked_tabs',
    group: 'look',
    title: 'List linked tabs',
    summary: 'See which tabs are linked to the chat.',
    defaultLevel: 'always',
    changesThings: false,
  },
  {
    name: 'look_at_page',
    group: 'look',
    title: 'Look at a page',
    summary: "See a page's buttons, links and fields.",
    defaultLevel: 'always',
    changesThings: false,
  },
  {
    name: 'read_page',
    group: 'look',
    title: 'Read a page',
    summary: "Read a page's text.",
    defaultLevel: 'always',
    changesThings: false,
  },
  {
    name: 'click',
    group: 'act',
    title: 'Click',
    summary: 'Click a button, link or checkbox.',
    defaultLevel: 'ask',
    changesThings: true,
  },
  {
    name: 'type_text',
    group: 'act',
    title: 'Type',
    summary: 'Type into a text field (never password or card fields).',
    defaultLevel: 'ask',
    changesThings: true,
  },
  {
    name: 'press_key',
    group: 'act',
    title: 'Press a key',
    summary: 'Press Enter, Tab, Escape or an arrow key.',
    defaultLevel: 'ask',
    changesThings: true,
  },
  {
    name: 'scroll',
    group: 'act',
    title: 'Scroll',
    summary: 'Scroll a page up or down.',
    defaultLevel: 'always',
    changesThings: false,
  },
  {
    name: 'select_option',
    group: 'act',
    title: 'Choose from a dropdown',
    summary: 'Pick an option in a dropdown list.',
    defaultLevel: 'ask',
    changesThings: true,
  },
  {
    name: 'go_to',
    group: 'act',
    title: 'Go to an address',
    summary: 'Open a web address in a linked tab.',
    defaultLevel: 'ask',
    changesThings: true,
  },
  {
    name: 'go_back',
    group: 'act',
    title: 'Go back',
    summary: 'Go back one page in a linked tab.',
    defaultLevel: 'ask',
    changesThings: true,
  },
  {
    name: 'open_tab',
    group: 'act',
    title: 'Open a new tab',
    summary:
      'Open a web address in a new tab, which is then linked to the chat.',
    defaultLevel: 'ask',
    changesThings: true,
  },
  {
    name: 'offer_choices',
    group: 'chat',
    title: 'Offer choice buttons',
    summary: 'Show you buttons to pick from.',
    defaultLevel: 'always',
    changesThings: false,
  },
];

const BY_NAME = new Map(TOOL_CATALOG.map((tool) => [tool.name, tool]));

export const toolInfo = (name: string): ToolInfo | undefined =>
  BY_NAME.get(name);

export const defaultLevel = (name: string): ApprovalLevel | undefined =>
  BY_NAME.get(name)?.defaultLevel;

// Combine what a call would do on its own (`plan`, which already includes the
// safety refusals) with your level for that tool. `describe` is the line shown
// on an approval card when a tool that normally just goes ahead is set to ask.
export function applyPolicy(
  plan: Plan,
  level: ApprovalLevel,
  describe: string,
): Plan {
  // A safety refusal stands, whatever the level.
  if (plan.kind === 'refuse') return plan;

  if (level === 'never') {
    return {
      kind: 'refuse',
      label: 'Turned off in Tools',
      note: 'You have turned this tool off in the Tools panel.',
      result:
        'The user has turned this tool off, so it cannot be used. Do not try it again. Tell them briefly, and use offer_choices to suggest another way to go on.',
    };
  }
  if (level === 'always') return { kind: 'auto' };
  if (level === 'if-safe') {
    return plan.kind === 'ask' && plan.risky ? plan : { kind: 'auto' };
  }
  // ask
  return plan.kind === 'auto'
    ? { kind: 'ask', text: describe, risky: false }
    : plan;
}
