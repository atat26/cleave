// Turns a page's accessibility tree (what the browser reports to screen readers)
// into a short numbered outline of what is on the page that a person can use:
//
//   main:
//     heading (level 1): "Pricing"
//     [1] text field "Search"  (empty)
//     [2] button "Search"
//     [3] link "Plans" → shop.example
//
// The assistant picks things by their number. In this step (M6a) the outline is
// only for looking; later steps use the numbers to act.
//
// The tree comes from the web page, so it is untrusted:
//   - every name is cleaned (one line, no quotes, no hidden or text-reordering
//     characters) and cut short
//   - what is typed into a field is never shown, only whether it has text
//   - fields that look like passwords, card numbers or one-time codes are marked
//     "sensitive" (the assistant never types in those)
//   - the size is capped, so a huge page cannot flood the model
// Pure code: it never throws on odd input and has no Electron or network.
import { cleanLabel, sanitizeUrl } from './chatLinks.ts';

export const MAX_OUTLINE_ELEMENTS = 300;
export const MAX_OUTLINE_CHARS = 12_000;
const MAX_NODES = 20_000;
const MAX_DEPTH = 80;
const MAX_NAME = 100;

export interface OutlineElement {
  // The number the assistant uses.
  id: number;
  // The browser's own id for the element (used later, when acting on it).
  backendNodeId: number;
  role: string;
  name: string;
  sensitive: boolean;
}

export interface Outline {
  lines: string[];
  elements: OutlineElement[];
  // True if the page had more than the limits allow.
  truncated: boolean;
}

// What the assistant can use, and how it is described.
const CONTROL_LABELS: Record<string, string> = {
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
  menuitemcheckbox: 'menu item (checkbox)',
  menuitemradio: 'menu item (radio)',
  tab: 'tab',
  option: 'option',
  treeitem: 'tree item',
};
const TEXT_FIELDS = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

// Areas of a page, shown as headings that indent what is inside them.
const REGIONS = new Set([
  'banner',
  'navigation',
  'main',
  'contentinfo',
  'complementary',
  'form',
  'search',
  'region',
  'dialog',
  'alertdialog',
]);

const SENSITIVE_NAME =
  /password|passcode|passphrase|card number|credit card|security code|\bcvv\b|\bcvc\b|\bssn\b|social security|one[- ]time code|verification code/i;
const SENSITIVE_AUTOCOMPLETE = /password|cc-|one-time-code/i;

interface RawNode {
  id: string;
  ignored: boolean;
  role: string;
  name: string;
  hasValue: boolean;
  props: Map<string, unknown>;
  children: string[];
  parent: string | null;
  backendNodeId: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// The `value` inside a { type, value } wrapper (how the browser reports things).
const inner = (wrapper: unknown): unknown =>
  isRecord(wrapper) ? wrapper.value : undefined;

function parseNodes(raw: unknown): Map<string, RawNode> {
  const nodes = new Map<string, RawNode>();
  if (!Array.isArray(raw)) return nodes;
  for (const item of raw) {
    if (nodes.size >= MAX_NODES) break;
    if (!isRecord(item) || typeof item.nodeId !== 'string') continue;
    const props = new Map<string, unknown>();
    if (Array.isArray(item.properties)) {
      for (const p of item.properties) {
        if (isRecord(p) && typeof p.name === 'string') {
          props.set(p.name, inner(p.value));
        }
      }
    }
    const value = inner(item.value);
    nodes.set(item.nodeId, {
      id: item.nodeId,
      ignored: item.ignored === true,
      role:
        typeof inner(item.role) === 'string'
          ? (inner(item.role) as string)
          : '',
      name: cleanLabel(inner(item.name), MAX_NAME),
      hasValue: typeof value === 'string' ? value !== '' : value != null,
      props,
      children: Array.isArray(item.childIds)
        ? item.childIds.filter((c): c is string => typeof c === 'string')
        : [],
      parent: typeof item.parentId === 'string' ? item.parentId : null,
      backendNodeId:
        typeof item.backendDOMNodeId === 'number'
          ? item.backendDOMNodeId
          : null,
    });
  }
  return nodes;
}

const truthy = (value: unknown) => value === true || value === 'true';

// The short notes after a control: "(checked, disabled)".
function stateNotes(node: RawNode, sensitive: boolean): string {
  const notes: string[] = [];
  if (sensitive) notes.push('sensitive');
  if (TEXT_FIELDS.has(node.role) && node.role !== 'combobox') {
    notes.push(node.hasValue ? 'has text' : 'empty');
  }
  const checked = node.props.get('checked');
  if (checked === 'mixed') notes.push('partly checked');
  else if (checked !== undefined && node.role !== 'button') {
    notes.push(truthy(checked) ? 'checked' : 'not checked');
  }
  const pressed = node.props.get('pressed');
  if (pressed !== undefined && truthy(pressed)) notes.push('pressed');
  const expanded = node.props.get('expanded');
  if (expanded !== undefined)
    notes.push(truthy(expanded) ? 'expanded' : 'collapsed');
  if (truthy(node.props.get('selected'))) notes.push('selected');
  if (truthy(node.props.get('required'))) notes.push('required');
  if (truthy(node.props.get('disabled'))) notes.push('disabled');
  if (truthy(node.props.get('readonly'))) notes.push('read-only');
  return notes.length > 0 ? `  (${notes.join(', ')})` : '';
}

export function buildOutline(raw: unknown): Outline {
  const nodes = parseNodes(raw);
  const lines: string[] = [];
  const elements: OutlineElement[] = [];
  let truncated = false;
  let chars = 0;

  // Start from the nodes that have no parent (normally one root).
  const roots = [...nodes.values()].filter(
    (n) => n.parent === null || !nodes.has(n.parent),
  );

  const add = (indent: number, text: string): boolean => {
    const line = `${'  '.repeat(Math.min(indent, 6))}${text}`;
    if (chars + line.length > MAX_OUTLINE_CHARS) {
      truncated = true;
      return false;
    }
    chars += line.length + 1;
    lines.push(line);
    return true;
  };

  const seen = new Set<string>();
  // Depth-first, in page order, without recursion.
  const stack: { id: string; depth: number; indent: number }[] = [];
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ id: roots[i].id, depth: 0, indent: 0 });
  }

  while (stack.length > 0 && !truncated) {
    const { id, depth, indent } = stack.pop()!;
    if (seen.has(id) || depth > MAX_DEPTH) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (!node) continue;

    let childIndent = indent;
    if (!node.ignored) {
      const label = CONTROL_LABELS[node.role];
      if (label && node.backendNodeId !== null) {
        if (elements.length >= MAX_OUTLINE_ELEMENTS) {
          truncated = true;
          break;
        }
        const autocomplete = node.props.get('autocomplete');
        const sensitive =
          TEXT_FIELDS.has(node.role) &&
          (SENSITIVE_NAME.test(node.name) ||
            (typeof autocomplete === 'string' &&
              SENSITIVE_AUTOCOMPLETE.test(autocomplete)));
        const number = elements.length + 1;
        const url =
          node.role === 'link' && typeof node.props.get('url') === 'string'
            ? sanitizeUrl(node.props.get('url'))
            : null;
        const host = url ? ` → ${new URL(url).host}` : '';
        const name = node.name === '' ? '(no name)' : `"${node.name}"`;
        if (
          !add(
            indent,
            `[${number}] ${label} ${name}${host}${stateNotes(node, sensitive)}`,
          )
        ) {
          break;
        }
        elements.push({
          id: number,
          backendNodeId: node.backendNodeId,
          role: node.role,
          name: node.name,
          sensitive,
        });
      } else if (node.role === 'heading' && node.name !== '') {
        const level = node.props.get('level');
        const shown = typeof level === 'number' ? ` (level ${level})` : '';
        if (!add(indent, `heading${shown}: "${node.name}"`)) break;
      } else if (REGIONS.has(node.role)) {
        const title = node.name === '' ? '' : ` "${node.name}"`;
        if (!add(indent, `${node.role}${title}:`)) break;
        childIndent = indent + 1;
      }
    }

    // Children are visited in order (pushed in reverse onto the stack).
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push({
        id: node.children[i],
        depth: depth + 1,
        indent: childIndent,
      });
    }
  }

  return { lines, elements, truncated };
}
