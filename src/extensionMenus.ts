// Extension items in the page's right-click menu. An extension's menu arrives as
// Electron menu objects (with functions); our menus are plain data (see
// menuTypes.ts). This turns one into the other and hands each clickable row an id
// ("ext:3") so the app can later find what to run. Pure, so it is easy to test.
import type { MenuItem } from './menuTypes';

// The parts of an Electron menu item that are used (so no Electron import here).
export interface ExtensionMenuNode {
  type?: string;
  label?: string;
  enabled?: boolean;
  visible?: boolean;
  checked?: boolean;
  submenu?: { items: ExtensionMenuNode[] } | null;
}

const MAX_ROWS = 60;
const MAX_DEPTH = 3;
const MAX_LABEL = 100;

// `register` is given each clickable node and returns the id for its row.
export function convertExtensionMenu(
  nodes: ExtensionMenuNode[],
  register: (node: ExtensionMenuNode) => string,
): MenuItem[] {
  let rows = 0;
  const convert = (list: ExtensionMenuNode[], depth: number): MenuItem[] => {
    const out: MenuItem[] = [];
    for (const node of list) {
      if (rows >= MAX_ROWS) break;
      if (node.visible === false) continue;
      if (node.type === 'separator') {
        out.push({ type: 'separator' });
        continue;
      }
      const label = (node.label ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_LABEL);
      if (label === '') continue;
      const children = node.submenu?.items;
      if (Array.isArray(children) && depth < MAX_DEPTH) {
        const inside = tidy(convert(children, depth + 1));
        if (inside.length === 0) continue;
        rows += 1;
        out.push({
          type: 'item',
          id: `ext-group:${rows}:${label}`,
          label,
          disabled: node.enabled === false,
          submenu: inside,
        });
        continue;
      }
      if (Array.isArray(children)) continue;
      rows += 1;
      out.push({
        type: 'item',
        id: register(node),
        label,
        disabled: node.enabled === false,
        ...(node.checked === true ? { checked: true } : {}),
      });
    }
    return tidy(out);
  };
  return convert(nodes, 0);
}

// No separator first, last, or twice in a row.
export function tidy(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    if (item.type === 'separator') {
      if (out.length === 0 || out[out.length - 1].type === 'separator')
        continue;
    }
    out.push(item);
  }
  while (out.length > 0 && out[out.length - 1].type === 'separator') out.pop();
  return out;
}
