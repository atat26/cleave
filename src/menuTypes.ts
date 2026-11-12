// What a context menu is, as plain data. The app describes a menu this way (in
// menuData.ts), sends it to the popup layer, and the popup layer draws it (see
// ui/ContextMenu.tsx) and says which item was chosen, by its id. No functions are
// sent anywhere: what an id does is decided by the app.
import type { IconName } from './ui/iconData';

export interface MenuEntry {
  type: 'item';
  // What the app is told when this is chosen (also what makes a submenu item
  // unique). Ids are unique within one menu.
  id: string;
  label: string;
  icon?: IconName;
  // Shown on the right, e.g. "Ctrl+W". Only for shortcuts that really work.
  shortcut?: string;
  // Drawn red: this throws something away.
  danger?: boolean;
  // Drawn grey and cannot be chosen.
  disabled?: boolean;
  // Items under it, opened to the side. Choosing the item itself does nothing.
  submenu?: MenuItem[];
}

export interface MenuSeparator {
  type: 'separator';
}

// A small grey heading inside a menu.
export interface MenuHeader {
  type: 'header';
  label: string;
}

export type MenuItem = MenuEntry | MenuSeparator | MenuHeader;

// Every id in a menu, including the ones in submenus.
export function menuIds(items: MenuItem[]): string[] {
  return items.flatMap((item) =>
    item.type !== 'item'
      ? []
      : [item.id, ...(item.submenu ? menuIds(item.submenu) : [])],
  );
}

// Is this id one that can be chosen from the menu? (The app checks what comes
// back from the popup page against the menu it sent.)
export function isChoosable(items: MenuItem[], id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const find = (list: MenuItem[]): MenuEntry | undefined => {
    for (const item of list) {
      if (item.type !== 'item') continue;
      if (item.id === id) return item;
      const inside = item.submenu ? find(item.submenu) : undefined;
      if (inside) return inside;
    }
    return undefined;
  };
  const entry = find(items);
  return entry !== undefined && !entry.disabled && !entry.submenu;
}
