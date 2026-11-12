// The context menus, as data (see menuTypes.ts), built from the current state, and
// the reading of a chosen item's id back into what to do. Pure code with no
// Electron, so it is easy to test. The actions themselves live in tabs.ts.
import type { MenuItem } from './menuTypes.ts';
import * as model from './model.ts';
import type { SavedState } from './model.ts';
import type { ChatsState } from './chats.ts';
import { SPACE_COLOR_HEX } from './colors.ts';

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

// ---- The Space menu ------------------------------------------------------------

export type SpaceChoice =
  | { action: 'open' }
  | { action: 'new-tab' }
  | { action: 'add-to-chat' }
  | { action: 'rename' }
  | { action: 'color'; color: model.SpaceColor }
  | { action: 'toggle-collapse' }
  | { action: 'ungroup' }
  | { action: 'close-all' }
  | { action: 'delete' };

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

// The menu for a Space (its row in the sidebar, or the header of its overview).
export function spaceMenuItems(
  state: SavedState,
  spaceId: number,
): MenuItem[] | null {
  const space = model.findSpace(state, spaceId);
  if (!space) return null;
  const inSpace = state.tabs.filter((tab) => tab.spaceId === spaceId);
  const open = inSpace.filter((tab) => !tab.closed).length;
  return [
    { type: 'item', id: 'space.open', label: 'Open overview', icon: 'layers' },
    {
      type: 'item',
      id: 'space.new-tab',
      label: 'New tab in Space',
      icon: 'plus',
    },
    {
      type: 'item',
      id: 'space.add-to-chat',
      label: 'Add Space to chat',
      icon: 'chat',
    },
    { type: 'separator' },
    { type: 'item', id: 'space.rename', label: 'Rename', icon: 'pencil' },
    {
      type: 'item',
      id: 'space.color',
      label: 'Colour',
      swatch: SPACE_COLOR_HEX[space.color],
      submenu: model.SPACE_COLORS.map(
        (color): MenuItem => ({
          type: 'item',
          id: `space.color:${color}`,
          label: capitalize(color),
          swatch: SPACE_COLOR_HEX[color],
          checked: color === space.color,
        }),
      ),
    },
    {
      type: 'item',
      id: 'space.toggle-collapse',
      label: space.collapsed ? 'Expand' : 'Collapse',
      icon: space.collapsed ? 'chev-d' : 'chev-u',
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'space.ungroup',
      label: 'Ungroup Space (keep tabs)',
      icon: 'move',
    },
    {
      type: 'item',
      id: 'space.close-all',
      label: 'Close all tabs in Space',
      icon: 'x',
      disabled: open === 0,
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'space.delete',
      label:
        inSpace.length > 0
          ? `Delete Space and its ${inSpace.length} tab${inSpace.length === 1 ? '' : 's'}…`
          : 'Delete Space',
      icon: 'trash',
      danger: true,
    },
  ];
}

export function parseSpaceChoice(id: string): SpaceChoice | null {
  switch (id) {
    case 'space.open':
      return { action: 'open' };
    case 'space.new-tab':
      return { action: 'new-tab' };
    case 'space.add-to-chat':
      return { action: 'add-to-chat' };
    case 'space.rename':
      return { action: 'rename' };
    case 'space.toggle-collapse':
      return { action: 'toggle-collapse' };
    case 'space.ungroup':
      return { action: 'ungroup' };
    case 'space.close-all':
      return { action: 'close-all' };
    case 'space.delete':
      return { action: 'delete' };
  }
  const color = /^space\.color:([a-z]+)$/.exec(id)?.[1];
  const found = model.SPACE_COLORS.find((c) => c === color);
  return found ? { action: 'color', color: found } : null;
}

// ---- The chat menus --------------------------------------------------------------

export type ChatChoice =
  | { action: 'select'; chatId: number }
  | { action: 'new' }
  | { action: 'rename'; chatId: number }
  | { action: 'delete'; chatId: number };

const shortTitle = (title: string) =>
  title.length > 40 ? `${title.slice(0, 40)}…` : title;

// Right-click on a chat in the chat list.
export function chatRowMenuItems(
  chats: ChatsState,
  chatId: number,
): MenuItem[] | null {
  if (!chats.conversations.some((c) => c.id === chatId)) return null;
  return [
    { type: 'item', id: `chat.select:${chatId}`, label: 'Open', icon: 'chat' },
    {
      type: 'item',
      id: `chat.rename:${chatId}`,
      label: 'Rename',
      icon: 'pencil',
    },
    { type: 'separator' },
    {
      type: 'item',
      id: `chat.delete:${chatId}`,
      label: 'Delete chat',
      icon: 'trash',
      danger: true,
    },
  ];
}

// The menu under the chat's name: switch chat (newest first), new, rename, delete.
export function chatSwitchMenuItems(chats: ChatsState): MenuItem[] {
  const active = chats.activeId;
  return [
    { type: 'header', label: 'Switch chat' },
    ...[...chats.conversations].reverse().map(
      (chat): MenuItem => ({
        type: 'item',
        id: `chat.select:${chat.id}`,
        label: shortTitle(chat.title),
        icon: chat.id === active ? 'check' : undefined,
      }),
    ),
    { type: 'separator' },
    { type: 'item', id: 'chat.new', label: 'New chat', icon: 'plus' },
    {
      type: 'item',
      id: `chat.rename:${active}`,
      label: 'Rename',
      icon: 'pencil',
    },
    {
      type: 'item',
      id: `chat.delete:${active}`,
      label: 'Delete chat',
      icon: 'trash',
      danger: true,
    },
  ];
}

export function parseChatChoice(id: string): ChatChoice | null {
  if (id === 'chat.new') return { action: 'new' };
  const m = /^chat\.(select|rename|delete):(\d+)$/.exec(id);
  if (!m) return null;
  return {
    action: m[1] as 'select' | 'rename' | 'delete',
    chatId: Number(m[2]),
  };
}

// ---- The model menu --------------------------------------------------------------

export type ModelChoice =
  | { action: 'pick'; model: string }
  | { action: 'settings' };

// Your pinned models with this chat's current one ticked (shown even if it is not
// pinned, so it is clear what is in use).
export function modelMenuItems(
  pinned: string[],
  current: string | null,
): MenuItem[] {
  const choices = [...pinned];
  if (current && !choices.includes(current)) choices.unshift(current);
  return [
    { type: 'header', label: 'Switch model' },
    ...choices.map(
      (modelId): MenuItem => ({
        type: 'item',
        id: `model.pick:${modelId}`,
        label: modelId,
        icon: modelId === current ? 'check' : undefined,
      }),
    ),
    ...(choices.length > 0 ? [{ type: 'separator' } as MenuItem] : []),
    {
      type: 'item',
      id: 'model.settings',
      label: 'Pin more models in Settings…',
      icon: 'settings',
    },
  ];
}

export function parseModelChoice(id: string): ModelChoice | null {
  if (id === 'model.settings') return { action: 'settings' };
  if (id.startsWith('model.pick:') && id.length > 'model.pick:'.length) {
    return { action: 'pick', model: id.slice('model.pick:'.length) };
  }
  return null;
}

// ---- What the menus can make the app do (provided by tabs.ts) ----------------

export interface MenuActions {
  moveTabToNewSpace: (tabId: number) => void;
  renameSpace: (spaceId: number) => void;
  setSpaceColor: (spaceId: number, color: model.SpaceColor) => void;
  setSpaceCollapsed: (spaceId: number, collapsed: boolean) => void;
  ungroupSpace: (spaceId: number) => void;
  deleteSpace: (spaceId: number) => void;
}

export interface ChatMenuActions {
  selectChat: (chatId: number) => void;
  newChat: () => void;
  renameChat: (chatId: number) => void;
  deleteChat: (chatId: number) => void;
}
