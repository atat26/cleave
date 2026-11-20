// The approval card: what the assistant is asking to do, shown so you can answer at a
// glance. The words of the question come from the app (the tool's plan); this adds the
// details worth seeing apart from it (the exact text to be typed, where a link goes, the
// tabs in a batch, the full text of a skill), the risk badges, the line saying what
// happens next, and the keys. Pure code with no Electron and no React, so it is easy to
// test. The look is in StepList.tsx and components.css.

// Extra details for one card. The app fills them in from values it has already checked
// and cleaned, never from the model's raw words, so the card cannot show one thing and
// do another. All of it is optional: a tool with none gets the question alone.
export interface CardDetails {
  // The exact words that will be typed, searched for or written.
  text?: { label: string; value: string };
  // A web address it will go to or read, cleaned (no query string or login).
  destination?: string;
  // One line for each tab, move or change in a batch.
  list?: string[];
  // How many more there were than the lines shown.
  more?: number;
  // A whole text to read before saying yes (a skill).
  full?: { label: string; value: string };
  // It asks even though the tool is set to go ahead, because it read web pages in this
  // same reply.
  askAgain?: boolean;
}

export const MAX_CARD_TEXT = 4000;
export const MAX_CARD_LINE = 300;
export const MAX_CARD_LIST = 20;

const short = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

// Whatever was saved or sent, made safe to show: only the known fields, bounded.
export function cleanCard(raw: unknown): CardDetails | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: CardDetails = {};
  const labelled = (
    v: unknown,
  ): { label: string; value: string } | undefined => {
    if (typeof v !== 'object' || v === null) return undefined;
    const o = v as Record<string, unknown>;
    const value = short(o.value, MAX_CARD_TEXT);
    return value === '' ? undefined : { label: short(o.label, 60), value };
  };
  const text = labelled(r.text);
  if (text) out.text = text;
  const full = labelled(r.full);
  if (full) out.full = full;
  const destination = short(r.destination, MAX_CARD_LINE);
  if (destination !== '') out.destination = destination;
  if (Array.isArray(r.list)) {
    const list = r.list
      .filter((l): l is string => typeof l === 'string')
      .slice(0, MAX_CARD_LIST)
      .map((l) => l.slice(0, MAX_CARD_LINE));
    if (list.length > 0) out.list = list;
  }
  if (typeof r.more === 'number' && Number.isInteger(r.more) && r.more > 0) {
    out.more = Math.min(r.more, 1000);
  }
  if (r.askAgain === true) out.askAgain = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---- The risk badges -------------------------------------------------------------------

// What kind of thing a tool does to you: the plain label for its badge, and (when the
// action is one that always asks) the extra label for why.
const WHAT: Record<string, string> = {
  click: 'Changes a page',
  type_text: 'Changes a page',
  fill_fields: 'Changes a page',
  press_key: 'Changes a page',
  select_option: 'Changes a page',
  go_to: 'Changes a page',
  go_back: 'Changes a page',
  open_tab: 'Opens a tab',
  read_link: 'Reads a page',
  web_search: 'Searches the web',
  screenshot_page: 'Sees everything on the page',
  list_all_tabs: 'Your own data',
  move_tabs: 'Changes your tabs',
  close_tab: 'Closes a tab',
  sleep_tab: 'Changes your tabs',
  reopen_tab: 'Changes your tabs',
  edit_space_note: "Changes a Space's note",
  search_history: 'Your own data',
  search_bookmarks: 'Your own data',
  search_chats: 'Your own data',
  earlier_in_this_chat: 'Your own data',
  read_chat: 'Your own data',
  bookmark_page: 'Adds a bookmark',
  save_page_as_artifact: 'Makes an artifact',
  create_artifact: 'Makes an artifact',
  create_artifact_in_space: 'Makes an artifact',
  edit_artifact: 'Changes an artifact',
  create_space: 'Makes a Space',
  create_skill: 'Makes a skill',
  edit_skill: 'Changes a skill',
  set_plan: 'Plans the task',
};

// Why a risky one always asks, by tool.
const WHY: Record<string, string> = {
  click: "Can't be undone",
  press_key: 'Might submit a form',
  select_option: "Can't be undone",
  go_to: 'A different website',
  open_tab: 'A different website',
  read_link: 'An address that did not come from your tabs',
  web_search: 'Might include private details',
  screenshot_page: 'Looks like a sign-in or payment page',
  close_tab: 'Closes something you have open',
};

// The badges for a card, most important first: why it is risky, what kind of thing it
// is, and whether it is asking again after reading web pages.
export function badgesFor(
  toolName: string,
  risky: boolean,
  card?: CardDetails,
): string[] {
  const badges: string[] = [];
  if (risky && WHY[toolName]) badges.push(WHY[toolName]);
  if (WHAT[toolName]) badges.push(WHAT[toolName]);
  if (card?.askAgain) badges.push('Asks again: it read web pages');
  return badges;
}

// One line saying what happens once you allow it.
export function nextLine(toolName: string): string {
  if (WHAT[toolName] === undefined) return 'It does this, then carries on.';
  switch (toolName) {
    case 'click':
    case 'type_text':
    case 'fill_fields':
    case 'press_key':
    case 'select_option':
    case 'go_to':
    case 'go_back':
      return 'It does this in the page, then looks again and carries on.';
    case 'open_tab':
      return 'It opens the tab, links it to this chat, then carries on.';
    case 'read_link':
    case 'web_search':
      return 'It reads the result, then carries on.';
    case 'screenshot_page':
      return 'It takes the picture and looks at it, then carries on.';
    case 'set_plan':
      return 'Nothing is done by the plan itself: it then starts on the first step, and every action still asks as usual.';
    case 'close_tab':
      return 'The tab closes. You can open it again from the Space or Recently closed.';
    case 'move_tabs':
    case 'sleep_tab':
    case 'reopen_tab':
      return 'It changes your tabs, then carries on.';
    case 'list_all_tabs':
    case 'search_history':
    case 'search_bookmarks':
    case 'search_chats':
    case 'read_chat':
    case 'earlier_in_this_chat':
      return 'What it finds goes to your chosen model, then it carries on.';
    default:
      return 'It saves this, then carries on.';
  }
}

// ---- The keys ----------------------------------------------------------------------------

export type Answer = 'allow' | 'allow-rest' | 'deny';

// What a key means on a card, or null for none. Enter allows and Shift+Enter allows the
// rest of the reply; Esc does not allow. A risky card cannot be allowed by Enter alone
// (a stray Enter must never do something that cannot be undone): it needs Ctrl+Enter, and
// has no "allow the rest".
export function answerFor(
  key: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  },
  risky: boolean,
): Answer | null {
  if (key.altKey) return null;
  if (key.key === 'Escape') return 'deny';
  if (key.key !== 'Enter') return null;
  if (key.ctrlKey || key.metaKey) return 'allow';
  if (risky) return null;
  return key.shiftKey ? 'allow-rest' : 'allow';
}

// Should a new card take the keyboard? Only when you are not typing: if the focus is in
// a text box (your message, say), an Enter you are about to press for something else must
// not answer the card.
export function cardMayTakeFocus(
  active: {
    tagName?: string;
    isContentEditable?: boolean;
    type?: string;
  } | null,
): boolean {
  if (!active) return true;
  const tag = (active.tagName ?? '').toUpperCase();
  if (active.isContentEditable) return false;
  if (tag === 'TEXTAREA') return false;
  if (tag === 'INPUT') {
    const type = (active.type ?? 'text').toLowerCase();
    return ['button', 'checkbox', 'radio', 'submit', 'range'].includes(type);
  }
  return true;
}
