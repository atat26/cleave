// Which of the assistant's tools to send with a request. All 39 definitions were sent every time
// (about 79% of all prompt tokens in the first baseline, docs/pipeline/baseline-1.md), although most
// requests use two or three. So the tools are in groups: a small core is always sent, the app adds
// the groups a message points to (and any the chat already used), and the assistant can ask for
// another group with more_tools if a guess was wrong. Pure code with no Electron and no React, so it
// is easy to test.
import type { ToolDefinition } from './openrouter.ts';

export type ToolGroup =
  | 'web'
  | 'act'
  | 'tabs'
  | 'docs'
  | 'skills'
  | 'memory'
  | 'pictures';

export const GROUPS: readonly ToolGroup[] = [
  'web',
  'act',
  'tabs',
  'docs',
  'skills',
  'memory',
  'pictures',
];

// What each group is, in the owner's words (also what the assistant is told).
export const GROUP_HELP: Record<ToolGroup, string> = {
  web: 'search the web and read a link',
  act: 'click, type, scroll, choose, press keys, open a page',
  tabs: 'list, move, close or sleep tabs; make Spaces; read and write Space notes',
  docs: 'read, make, edit and save documents (artifacts), bookmark a page',
  skills: 'make or change skills',
  memory: "search the owner's history, bookmarks and past chats",
  pictures: 'take a screenshot of a page',
};

// The group of every tool that is not in the core. Anything not listed is in the core (always sent).
const GROUP_OF: Record<string, ToolGroup> = {
  web_search: 'web',
  read_link: 'web',
  click: 'act',
  type_text: 'act',
  press_key: 'act',
  scroll: 'act',
  select_option: 'act',
  go_to: 'act',
  open_tab: 'act',
  go_back: 'act',
  list_all_tabs: 'tabs',
  move_tabs: 'tabs',
  close_tab: 'tabs',
  sleep_tab: 'tabs',
  reopen_tab: 'tabs',
  read_space_note: 'tabs',
  edit_space_note: 'tabs',
  create_space: 'tabs',
  read_artifact: 'docs',
  create_artifact: 'docs',
  create_artifact_in_space: 'docs',
  edit_artifact: 'docs',
  save_page_as_artifact: 'docs',
  bookmark_page: 'docs',
  check_artifact: 'docs',
  create_skill: 'skills',
  edit_skill: 'skills',
  search_history: 'memory',
  search_bookmarks: 'memory',
  search_chats: 'memory',
  read_chat: 'memory',
  screenshot_page: 'pictures',
};

// The tool for asking for another group.
export const MORE_TOOLS = 'more_tools';

export const groupOf = (toolName: string): ToolGroup | null =>
  GROUP_OF[toolName] ?? null;

export const isGroup = (value: unknown): value is ToolGroup =>
  typeof value === 'string' && (GROUPS as readonly string[]).includes(value);

// Words in a message that point to a group. Deliberately generous: offering a group that was not
// needed costs a little, and leaving one out costs the model a step (more_tools) or worse.
const HINTS: Record<ToolGroup, RegExp> = {
  web: /\b(search|google|look(ing)? up|find out|news|latest|online|web|website|link|url)\b|https?:\/\//i,
  act: /\b(click|tap|type|typing|fill|enter|press|scroll|select|choose|pick|submit|send|go to|go back|navigate|open|log ?in|sign ?in|buy|purchase|order|book|add to (the )?cart|check ?out|download|accept|dismiss|close the (popup|banner|dialog))\b/i,
  tabs: /\b(tabs?|spaces?|organi[sz]e|tidy|group|sort|move|close|sleep|reopen|note|notes|workspace)\b/i,
  docs: /\b(documents?|artifacts?|save|write|draft|create|make|edit|change|update|rename|add|checklist|report|summary|notes?|bookmark|export|file|heading|list)\b/i,
  skills: /\b(skills?)\b/i,
  memory:
    /\b(history|visited|earlier|before|last (week|month|time)|yesterday|remember|bookmarks?|chats?|conversation|previous|used to|that page|read about)\b/i,
  pictures:
    /\b(screenshots?|pictures?|images?|looks? like|appearance|layout|design|colou?rs?)\b/i,
};

// The groups a message points to.
export function groupsForMessage(text: string): Set<ToolGroup> {
  const found = new Set<ToolGroup>();
  for (const group of GROUPS) {
    if (HINTS[group].test(text)) found.add(group);
  }
  return found;
}

// The groups of the tools already used in earlier replies of the chat, so a follow-up ("do the same
// for the other one") keeps what it had.
export function groupsUsed(toolNames: Iterable<string>): Set<ToolGroup> {
  const found = new Set<ToolGroup>();
  for (const name of toolNames) {
    const group = groupOf(name);
    if (group !== null) found.add(group);
  }
  return found;
}

// The definitions to send: the core, plus the open groups, plus (if any group is closed) the tool
// for asking for more. With `all` true, everything is sent (the old behaviour; for comparing).
export function definitionsFor(
  all: readonly ToolDefinition[],
  open: ReadonlySet<ToolGroup>,
  everything = false,
): ToolDefinition[] {
  if (everything) return [...all];
  const chosen = all.filter((definition) => {
    const group = groupOf(definition.name);
    return group === null || open.has(group);
  });
  return open.size === GROUPS.length
    ? chosen
    : [...chosen, moreToolsDefinition(open)];
}

// The tool the assistant uses to get a group it was not given. It lists only the closed groups.
export function moreToolsDefinition(
  open: ReadonlySet<ToolGroup>,
): ToolDefinition {
  const closed = GROUPS.filter((group) => !open.has(group));
  return {
    name: MORE_TOOLS,
    description: `Get more tools when you need one you do not have. Groups: ${closed
      .map((group) => `${group} (${GROUP_HELP[group]})`)
      .join('; ')}. Ask for the group, then use its tools on your next step.`,
    parameters: {
      type: 'object',
      properties: {
        group: { type: 'string', enum: closed },
      },
      required: ['group'],
      additionalProperties: false,
    },
  };
}
