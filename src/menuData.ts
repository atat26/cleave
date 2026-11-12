// The context menus, as data (see menuTypes.ts), built from the current state, and
// the reading of a chosen item's id back into what to do. Pure code with no
// Electron, so it is easy to test. The actions themselves live in tabs.ts.
import type { MenuItem } from './menuTypes.ts';
import * as model from './model.ts';
import type { SavedState } from './model.ts';

// ---- The tab menu --------------------------------------------------------------

export type TabChoice =
  | { action: 'new-below' }
  | { action: 'reload' }
  | { action: 'duplicate' }
  | { action: 'add-to-chat' }
  | { action: 'move'; spaceId: number | null }
  | { action: 'move-new-space' }
  | { action: 'copy-link' }
  | { action: 'close-others' }
  | { action: 'close' }
  | { action: 'delete' };

// The menu for a tab (in the sidebar, or on a card on a Space's overview). Null
// if there is no such tab.
export function tabMenuItems(
  state: SavedState,
  tabId: number,
): MenuItem[] | null {
  const tab = model.findTab(state, tabId);
  if (!tab) return null;

  const otherSpaces = state.spaces.filter((space) => space.id !== tab.spaceId);
  const moveItems: MenuItem[] = [
    ...otherSpaces.map(
      (space): MenuItem => ({
        type: 'item',
        id: `tab.move:${space.id}`,
        label: space.name,
      }),
    ),
    ...(tab.spaceId !== null
      ? [
          {
            type: 'item',
            id: 'tab.move:none',
            label: 'No Space',
          } as MenuItem,
        ]
      : []),
  ];
  if (moveItems.length > 0) moveItems.push({ type: 'separator' });
  moveItems.push({
    type: 'item',
    id: 'tab.move-new-space',
    label: 'New Space…',
    icon: 'plus',
  });

  // How many other open tabs share this one's group (the same Space, or none).
  const others = state.tabs.filter(
    (t) => t.id !== tab.id && t.spaceId === tab.spaceId && !t.closed,
  ).length;

  const items: MenuItem[] = [
    { type: 'item', id: 'tab.new-below', label: 'New tab below', icon: 'plus' },
    {
      type: 'item',
      id: 'tab.reload',
      label: 'Reload',
      icon: 'reload',
      disabled: tab.closed,
    },
    {
      type: 'item',
      id: 'tab.duplicate',
      label: 'Duplicate',
      icon: 'copy',
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'tab.add-to-chat',
      label: 'Add to chat',
      icon: 'chat',
    },
    {
      type: 'item',
      id: 'tab.move',
      label: 'Move to Space',
      icon: 'move',
      submenu: moveItems,
    },
    { type: 'item', id: 'tab.copy-link', label: 'Copy link', icon: 'link' },
    { type: 'separator' },
    {
      type: 'item',
      id: 'tab.close-others',
      label: 'Close other tabs',
      icon: 'x',
      disabled: others === 0,
    },
    {
      type: 'item',
      id: 'tab.close',
      label: tab.closed
        ? 'Close tab'
        : tab.spaceId === null
          ? 'Close tab'
          : 'Close tab (keep in Space)',
      icon: 'x',
      shortcut: 'Ctrl+W',
      disabled: tab.closed,
    },
  ];
  if (tab.spaceId !== null) {
    items.push({
      type: 'item',
      id: 'tab.delete',
      label: 'Delete tab',
      icon: 'trash',
      danger: true,
    });
  }
  return items;
}

// What a chosen id from the tab menu means, or null if it is not one of its ids.
export function parseTabChoice(id: string): TabChoice | null {
  switch (id) {
    case 'tab.new-below':
      return { action: 'new-below' };
    case 'tab.reload':
      return { action: 'reload' };
    case 'tab.duplicate':
      return { action: 'duplicate' };
    case 'tab.add-to-chat':
      return { action: 'add-to-chat' };
    case 'tab.move-new-space':
      return { action: 'move-new-space' };
    case 'tab.copy-link':
      return { action: 'copy-link' };
    case 'tab.close-others':
      return { action: 'close-others' };
    case 'tab.close':
      return { action: 'close' };
    case 'tab.delete':
      return { action: 'delete' };
    case 'tab.move:none':
      return { action: 'move', spaceId: null };
  }
  const moved = /^tab\.move:(\d+)$/.exec(id);
  if (moved) return { action: 'move', spaceId: Number(moved[1]) };
  return null;
}
