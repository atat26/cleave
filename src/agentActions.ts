// The actions the assistant may take in a linked tab (M6b), and the rules around
// them. This file decides WHAT an action is, whether it needs your approval, and
// what is refused outright. Doing it in the page is pageActions.ts / tabs.ts.
//
// The rules:
//   - Only linked tabs. Page elements are chosen by the numbers from the last
//     look_at_page of that tab, and that list is thrown away after anything that
//     could change the page, so a number can never point at the wrong thing.
//   - Never typed into: password, card, one-time-code fields.
//   - Never done for you: accepting terms, privacy policies or cookie banners.
//   - Everything except scrolling asks first. The words on the approval card are
//     written here from the real element, never taken from the model's own text.
//   - Some things are "risky" and ask every time, even after "Allow the rest of
//     this reply": buying, paying, sending, posting, deleting and the like, the
//     Enter key (it may submit a form), links to another website, and going to
//     another website.
//   - At most MAX_ACTIONS actions per reply.
// Pure code with no Electron, so every rule can be tested.
import type { CardDetails } from './approvalCard.ts';
import { MAX_MARKER_NAME } from './marker.ts';
import type { StepTarget } from './marker.ts';
import { cleanLabel, sanitizeUrl } from './chatLinks.ts';
import type { WorkspaceTab } from './chatLinks.ts';
import type { OutlineElement } from './pageOutline.ts';
import type { ToolCall, ToolDefinition } from './openrouter.ts';

export const MAX_ACTIONS = 25;
// New tabs the assistant may open in one reply.
export const MAX_NEW_TABS = 5;
export const MAX_TYPED_CHARS = 1000;
// Fields one fill_fields step may fill (each counts as one action).
export const MAX_FILL_FIELDS = 10;
const MAX_SHOWN_TEXT = 120;
const MAX_URL_CHARS = 2000;

// ---- What the assistant can ask for -------------------------------------------------------

export const ACTION_NAMES = [
  'click',
  'type_text',
  'fill_fields',
  'press_key',
  'scroll',
  'select_option',
  'go_to',
  'go_back',
  'open_tab',
] as const;
export type ActionName = (typeof ACTION_NAMES)[number];
export const isActionName = (name: string): name is ActionName =>
  (ACTION_NAMES as readonly string[]).includes(name);

// Keys it may press, and how they are shown.
export const ALLOWED_KEYS = [
  'Enter',
  'Tab',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
] as const;

const tabNumber = {
  type: 'integer',
  description: 'The tab number, as shown in the list of linked tabs.',
};
const elementNumber = {
  type: 'integer',
  description:
    'The control number from the latest look_at_page of this tab (the number in [brackets]).',
};

export const ACTION_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'click',
    description:
      'Click a button, checkbox or other control in a linked tab. Do not click a link just to read where it goes or to read its page: that takes the tab away from the page you were on. Use read_link to read a page, or open_tab to show it in a new tab. First use look_at_page on the tab to get the control numbers. The user must approve it. After a click the page may change: look at it again before the next action.',
    parameters: {
      type: 'object',
      properties: { tab: tabNumber, element: elementNumber },
      required: ['tab', 'element'],
      additionalProperties: false,
    },
  },
  {
    name: 'type_text',
    description:
      'Type text into a text field in a linked tab, replacing what is in it. Use look_at_page first for the control number. You can never type into password, card or one-time-code fields: ask the user to do that themselves. The user must approve it.',
    parameters: {
      type: 'object',
      properties: {
        tab: tabNumber,
        element: elementNumber,
        text: { type: 'string', description: 'The text to type.' },
      },
      required: ['tab', 'element', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'fill_fields',
    description: `Fill in several text fields of ONE form in a linked tab at once (up to ${MAX_FILL_FIELDS}), replacing what is in them. Use it instead of several type_text steps: the user then approves the whole form with one question. Use look_at_page first for the control numbers. You can never fill password, card or one-time-code fields: if the form has one, fill the others and ask the user to do that field themselves. It does not press Submit.`,
    parameters: {
      type: 'object',
      properties: {
        tab: tabNumber,
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              element: elementNumber,
              text: { type: 'string', description: 'The text to type.' },
            },
            required: ['element', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['tab', 'fields'],
      additionalProperties: false,
    },
  },
  {
    name: 'press_key',
    description:
      'Press a key in a linked tab (for example Enter to run a search, Tab, Escape, or an arrow key). Enter may submit a form, so it always needs the user to approve it.',
    parameters: {
      type: 'object',
      properties: {
        tab: tabNumber,
        key: { type: 'string', enum: [...ALLOWED_KEYS] },
      },
      required: ['tab', 'key'],
      additionalProperties: false,
    },
  },
  {
    name: 'scroll',
    description:
      'Scroll a linked tab up or down by about one screen. This changes nothing on the page.',
    parameters: {
      type: 'object',
      properties: {
        tab: tabNumber,
        direction: { type: 'string', enum: ['up', 'down'] },
      },
      required: ['tab', 'direction'],
      additionalProperties: false,
    },
  },
  {
    name: 'select_option',
    description:
      'Choose an option by its visible text in a dropdown (a select list) in a linked tab. Use look_at_page first for the control number. For other kinds of menus, click instead. The user must approve it.',
    parameters: {
      type: 'object',
      properties: {
        tab: tabNumber,
        element: elementNumber,
        option: {
          type: 'string',
          description: 'The visible text of the option.',
        },
      },
      required: ['tab', 'element', 'option'],
      additionalProperties: false,
    },
  },
  {
    name: 'go_to',
    description:
      'Open a web address (http or https) in a linked tab. Going to a different website than the tab is on always needs the user to approve it.',
    parameters: {
      type: 'object',
      properties: {
        tab: tabNumber,
        url: { type: 'string', description: 'The full web address.' },
      },
      required: ['tab', 'url'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_tab',
    description:
      'Open a web address (http or https) in a NEW tab, which is then linked to this conversation so you can look at it and act in it. Use it when you need a different website than the linked tabs. Opening a site that none of the linked tabs is on always needs the user to approve it.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full web address.' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'go_back',
    description: 'Go back one page in a linked tab. The user must approve it.',
    parameters: {
      type: 'object',
      properties: { tab: tabNumber },
      required: ['tab'],
      additionalProperties: false,
    },
  },
];

// ---- Plans: what an action is, and whether it may go ahead --------------------------------

export type Plan =
  // Goes ahead with no question (only things that change nothing).
  | { kind: 'auto'; target?: StepTarget }
  // Waits for the user. `text` is what the card says.
  | {
      kind: 'ask';
      text: string;
      risky: boolean;
      card?: CardDetails;
      // The element it acts on (for the marker on the page).
      target?: StepTarget;
      // Asks even after "Allow the rest of this reply" (without the risky look and keys): for what
      // the user should always see before it takes effect, like the plan of a task.
      always?: boolean;
      // What the model is told when the user says no, instead of the usual "try another way".
      declinedResult?: string;
    }
  // Not done at all, and the model is told why.
  | { kind: 'refuse'; label: string; note: string; result: string };

// What the planner needs to know about the world.
export interface ActionContext {
  linkedTabs(): WorkspaceTab[];
  // The tab's address right now, or null if it is closed.
  tabUrl(tabId: number): string | null;
  // The controls from the latest look at this tab, or undefined if there is none
  // (or it was thrown away).
  controls(tabId: number): OutlineElement[] | undefined;
  // How many actions have been done in this reply, and how many tabs opened.
  actionsDone(): number;
  tabsOpened(): number;
}

// Buttons and links that do something that is hard to undo or that other people
// see. Matched on the control's name. (A list like this can only ever be a
// helper: every action still asks, these ones ask every time.)
const RISKY_NAME =
  /\b(buy|purchase|pay|checkout|check out|place (?:your )?order|order|send|submit|post|publish|delete|remove|erase|confirm|transfer|withdraw|donate|subscribe|unsubscribe|sign out|log out|logout|reserve|book|cancel|deactivate|close (?:my )?account|install|download|upload|share|invite|accept|authorize|approve|agree)\b/i;

// Terms, privacy policies and cookie banners are for you to accept yourself.
const CONSENT_NAME =
  /(accept|agree|allow|consent|i understand).*(cookie|terms|privacy|policy|conditions|all)\b|\b(accept all|allow all|i agree|agree (?:and|&) continue|accept (?:and|&) continue)\b/i;

const hostOf = (url: string | null): string => {
  try {
    return url ? new URL(url).host : '';
  } catch {
    return '';
  }
};

const ROLE_WORDS: Record<string, string> = {
  button: 'button',
  link: 'link',
  textbox: 'text field',
  searchbox: 'search field',
  combobox: 'dropdown',
  listbox: 'list box',
  checkbox: 'checkbox',
  radio: 'radio button',
  switch: 'switch',
  slider: 'slider',
  spinbutton: 'number field',
  menuitem: 'menu item',
  menuitemcheckbox: 'menu item',
  menuitemradio: 'menu item',
  tab: 'tab',
  option: 'option',
  treeitem: 'tree item',
};

const describeControl = (control: OutlineElement) =>
  `${ROLE_WORDS[control.role] ?? 'control'}${control.name === '' ? '' : ` "${cleanLabel(control.name, 100)}"`}`;

const refuse = (label: string, note: string, result: string): Plan => ({
  kind: 'refuse',
  label,
  note,
  result,
});

// Pull the whole-number argument `key` out of the call, or null.
function whole(args: Record<string, unknown>, key: string): number | null {
  const value = args[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function parseArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// A web address the assistant may open: http or https, no username or password.
// Returns it tidied, or null.
export function parseWebAddress(raw: unknown): URL | null {
  if (
    typeof raw !== 'string' ||
    raw.length === 0 ||
    raw.length > MAX_URL_CHARS
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  return url;
}

// The fields of a fill_fields call: [{ element, text }], or null if the list is missing, empty,
// longer than MAX_FILL_FIELDS, or has an entry that is not a whole element number with a text.
export function fillList(
  args: Record<string, unknown>,
): { element: number; text: string }[] | null {
  const raw = args.fields;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILL_FIELDS) {
    return null;
  }
  const out: { element: number; text: string }[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { element, text } = entry as Record<string, unknown>;
    if (typeof element !== 'number' || !Number.isInteger(element)) return null;
    if (typeof text !== 'string') return null;
    out.push({ element, text });
  }
  return out;
}

// Several fields of one form at once: one question for all of them. All or nothing: if any
// field is missing, repeated, too long or sensitive, nothing is typed anywhere.
function planFill(
  args: Record<string, unknown>,
  tabId: number,
  site: string,
  controls: OutlineElement[],
  actionsDone: number,
): Plan {
  const fields = fillList(args);
  if (fields === null) {
    return refuse(
      "Couldn't fill that (bad request)",
      `The fields were missing, or there were more than ${MAX_FILL_FIELDS}.`,
      `fields must be a list of 1 to ${MAX_FILL_FIELDS} entries, each with an element number and a text.`,
    );
  }
  if (actionsDone + fields.length > MAX_ACTIONS) {
    return refuse(
      'Action limit reached',
      `Filling ${fields.length} fields would go over the limit of ${MAX_ACTIONS} actions in this reply. Nothing was typed.`,
      `Each field counts as one action, and ${actionsDone} of ${MAX_ACTIONS} are used. Fill fewer fields, or stop and tell the user where things stand.`,
    );
  }
  const seen = new Set<number>();
  const lines: string[] = [];
  let first: OutlineElement | null = null;
  for (const { element, text } of fields) {
    const control = controls.find((c) => c.id === element);
    if (!control) {
      return refuse(
        "Couldn't find that control",
        `There is no control [${element}] in the last look. Nothing was typed.`,
        `There is no control numbered ${element} in the latest look at tab ${tabId}. Nothing was typed. Use look_at_page again.`,
      );
    }
    if (seen.has(element)) {
      return refuse(
        "Couldn't fill that (same field twice)",
        `Field [${element}] was listed twice. Nothing was typed.`,
        `Control ${element} is listed twice. List each field once. Nothing was typed.`,
      );
    }
    seen.add(element);
    if (text.length > MAX_TYPED_CHARS) {
      return refuse(
        "Couldn't type that",
        `A text was longer than ${MAX_TYPED_CHARS} characters. Nothing was typed.`,
        `Each text must be at most ${MAX_TYPED_CHARS} characters. Nothing was typed.`,
      );
    }
    if (control.sensitive) {
      return refuse(
        'Not typing into a sensitive field',
        'One of the fields looks like a password, card or code field. Nothing was typed.',
        `Control ${element} is a password, card or code field. You must never type into it: ask the user to fill it in themselves. Nothing was typed, so fill the other fields again without it.`,
      );
    }
    first ??= control;
    const label = cleanLabel(control.name, 60) || describeControl(control);
    lines.push(`${label}: ${cleanLabel(text, MAX_SHOWN_TEXT)}`);
  }
  return {
    kind: 'ask',
    text: `Fill in ${fields.length} field${fields.length === 1 ? '' : 's'} on ${site}`,
    risky: false,
    card: { list: lines },
    target: {
      tabId,
      backendNodeId: first!.backendNodeId,
      name: cleanLabel(first!.name, MAX_MARKER_NAME),
    },
  };
}

export function planAction(call: ToolCall, context: ActionContext): Plan {
  const name = call.name;
  if (!isActionName(name)) {
    return refuse(
      'Ignored an unknown request',
      'There is no such action.',
      `There is no action called "${cleanLabel(name, 40)}".`,
    );
  }
  const args = parseArguments(call.arguments);
  if (args === null) {
    return refuse(
      "Couldn't do that (bad request)",
      'The request could not be understood.',
      'The arguments were not valid.',
    );
  }

  // Opening a new tab is not in any one tab.
  if (name === 'open_tab') {
    if (context.actionsDone() >= MAX_ACTIONS) {
      return refuse(
        'Action limit reached',
        `Already took ${MAX_ACTIONS} actions in this reply.`,
        `You have already taken ${MAX_ACTIONS} actions in this reply. Stop and tell the user where things stand.`,
      );
    }
    if (context.tabsOpened() >= MAX_NEW_TABS) {
      return refuse(
        'New tab limit reached',
        `Already opened ${MAX_NEW_TABS} tabs in this reply.`,
        `You have already opened ${MAX_NEW_TABS} tabs in this reply. Use one of those.`,
      );
    }
    const url = parseWebAddress(args.url);
    if (!url) {
      return refuse(
        "Couldn't open that address",
        'Only web addresses (http or https) without a username or password can be opened.',
        'That is not an address that can be opened: it must be an http or https web address with no username or password.',
      );
    }
    const shown = cleanLabel(url.href, 300);
    // A site one of the linked tabs is already on is not a new place to go.
    const known = context.linkedTabs().some((t) => hostOf(t.url) === url.host);
    const card = { destination: shown };
    return known
      ? { kind: 'ask', text: `Open a new tab at ${shown}`, risky: false, card }
      : {
          kind: 'ask',
          text: `Open a new tab at a different website: ${shown}`,
          risky: true,
          card,
        };
  }

  const tabId = whole(args, 'tab');
  const tab = context.linkedTabs().find((t) => t.id === tabId);
  if (tabId === null || !tab) {
    return refuse(
      "Couldn't act there (not linked)",
      `Tab ${tabId ?? '?'} is not linked to this chat, or is closed. Nothing was done.`,
      `Tab ${tabId ?? '?'} is not linked to this conversation, or it has been closed. Use list_linked_tabs to see where you can act.`,
    );
  }
  const address = context.tabUrl(tabId);
  if (address === null) {
    return refuse(
      "Couldn't act there (closed)",
      'The tab was closed. Nothing was done.',
      `Tab ${tabId} has been closed.`,
    );
  }
  const site = hostOf(address) || 'this page';

  if (context.actionsDone() >= MAX_ACTIONS) {
    return refuse(
      'Action limit reached',
      `Already took ${MAX_ACTIONS} actions in this reply.`,
      `You have already taken ${MAX_ACTIONS} actions in this reply. Stop and tell the user where things stand.`,
    );
  }

  // ---- Actions that need no control number ----
  if (name === 'scroll') {
    return args.direction === 'up' || args.direction === 'down'
      ? { kind: 'auto' }
      : refuse(
          "Couldn't scroll (bad request)",
          'The direction was not up or down.',
          'direction must be "up" or "down".',
        );
  }

  if (name === 'press_key') {
    const key = args.key;
    if (
      typeof key !== 'string' ||
      !(ALLOWED_KEYS as readonly string[]).includes(key)
    ) {
      return refuse(
        "Couldn't press that key",
        'That key is not allowed.',
        `Only these keys can be pressed: ${ALLOWED_KEYS.join(', ')}.`,
      );
    }
    return key === 'Enter'
      ? {
          kind: 'ask',
          text: `Press Enter on ${site} (this may submit a form)`,
          risky: true,
        }
      : { kind: 'ask', text: `Press ${key} on ${site}`, risky: false };
  }

  if (name === 'go_back') {
    return { kind: 'ask', text: `Go back one page on ${site}`, risky: false };
  }

  if (name === 'go_to') {
    const url = parseWebAddress(args.url);
    if (!url) {
      return refuse(
        "Couldn't open that address",
        'Only web addresses (http or https) without a username or password can be opened.',
        'That is not an address that can be opened: it must be an http or https web address with no username or password.',
      );
    }
    // The whole address is shown: an address can carry information in it, so you
    // see exactly where it would go.
    const shown = cleanLabel(url.href, 300);
    const card = { destination: shown };
    return url.host === hostOf(address)
      ? { kind: 'ask', text: `Go to ${shown}`, risky: false, card }
      : {
          kind: 'ask',
          text: `Go to a different website: ${shown}`,
          risky: true,
          card,
        };
  }

  // ---- Actions on a numbered control ----
  const number = whole(args, 'element');
  const controls = context.controls(tabId);
  if (controls === undefined) {
    return refuse(
      'Look at the page first',
      'The page has to be looked at before acting on it.',
      `Use look_at_page on tab ${tabId} first (and again after the page changes): the control numbers come from it.`,
    );
  }
  if (name === 'fill_fields') {
    return planFill(args, tabId, site, controls, context.actionsDone());
  }
  const control = controls.find((c) => c.id === number);
  if (number === null || !control) {
    return refuse(
      "Couldn't find that control",
      `There is no control [${number ?? '?'}] in the last look.`,
      `There is no control numbered ${number ?? '?'} in the latest look at tab ${tabId}. Use look_at_page again.`,
    );
  }
  const what = describeControl(control);
  const target: StepTarget = {
    tabId,
    backendNodeId: control.backendNodeId,
    name: cleanLabel(control.name, MAX_MARKER_NAME),
  };

  if (name === 'type_text') {
    const text = args.text;
    if (typeof text !== 'string' || text.length > MAX_TYPED_CHARS) {
      return refuse(
        "Couldn't type that",
        `The text was missing or longer than ${MAX_TYPED_CHARS} characters.`,
        `text must be a string of at most ${MAX_TYPED_CHARS} characters.`,
      );
    }
    if (control.sensitive) {
      return refuse(
        'Not typing into a sensitive field',
        'That field looks like a password, card or code field. Nothing was typed.',
        'That is a password, card or code field. You must never type into it: ask the user to fill it in themselves.',
      );
    }
    const shown = cleanLabel(text, MAX_SHOWN_TEXT);
    return {
      kind: 'ask',
      text: `Type "${shown}" into the ${what} on ${site}`,
      risky: false,
      card: { text: { label: 'Text to type', value: shown } },
      target,
    };
  }

  if (name === 'select_option') {
    const option = args.option;
    if (typeof option !== 'string' || option === '' || option.length > 200) {
      return refuse(
        "Couldn't choose that option",
        'The option text was missing or too long.',
        'option must be the visible text of an option.',
      );
    }
    return {
      kind: 'ask',
      text: `Choose "${cleanLabel(option, MAX_SHOWN_TEXT)}" in the ${what} on ${site}`,
      risky: false,
      card: {
        text: {
          label: 'Option to choose',
          value: cleanLabel(option, MAX_SHOWN_TEXT),
        },
      },
      target,
    };
  }

  // click
  if (CONSENT_NAME.test(control.name)) {
    return refuse(
      'Not accepting terms or cookies for you',
      'This looks like accepting terms or cookies. Nothing was clicked.',
      'That looks like accepting terms, a policy or cookies. Never do that for the user: ask them to do it themselves.',
    );
  }
  const goesElsewhere =
    control.role === 'link' &&
    control.url !== null &&
    hostOf(control.url) !== hostOf(address);
  const risky = RISKY_NAME.test(control.name) || goesElsewhere;
  const text = goesElsewhere
    ? `Click the ${what} on ${site}, which goes to a different website (${hostOf(control.url)})`
    : `Click the ${what} on ${site}`;
  return { kind: 'ask', text, risky, target };
}

// What makes the page change, so the numbered list of controls must be thrown away.
export const CHANGES_PAGE: ReadonlySet<ActionName> = new Set([
  'click',
  'press_key',
  'select_option',
  'go_to',
  'go_back',
]);

// The address as the model is told it afterwards (no query, no username).
export const shownAddress = (url: string): string => sanitizeUrl(url) ?? '';
