// The context menus, as data (see menuTypes.ts), built from the current state, and
// the reading of a chosen item's id back into what to do. Pure code with no
// Electron, so it is easy to test. The actions themselves live in tabs.ts.
import type { MenuItem } from './menuTypes.ts';
import type { IconName } from './ui/iconData.ts';
import { ASK_KINDS, askText } from './permissions.ts';
import type { Answer, AskKind } from './permissions.ts';
import * as model from './model.ts';
import type { SavedState } from './model.ts';
import { ARTIFACT_KINDS, findArtifact } from './artifacts.ts';
import type { ArtifactKind, ArtifactsState } from './artifacts.ts';
import { byRecency } from './chats.ts';
import type { ChatRef, ChatsState } from './chats.ts';
import { resolveLink } from './chatLinks.ts';
import type { Workspace } from './chatLinks.ts';
import { SPACE_COLOR_HEX } from './colors.ts';
import {
  cleanEmoji,
  DEFAULT_CHAT_EMOJI,
  DEFAULT_SPACE_EMOJI,
  defaultArtifactEmoji,
  EMOJI_GROUPS,
  emojiOr,
} from './emoji.ts';

// What each thing shows as its picture in a menu.
const spaceEmoji = (space: { emoji: string | null }) =>
  emojiOr(space.emoji, DEFAULT_SPACE_EMOJI);
const chatEmoji = (chat: { emoji: string | null }) =>
  emojiOr(chat.emoji, DEFAULT_CHAT_EMOJI);
const artifactEmoji = (artifact: { emoji: string | null; kind: string }) =>
  emojiOr(artifact.emoji, defaultArtifactEmoji(artifact.kind));

// ---- The tab menu --------------------------------------------------------------

export type TabChoice =
  | { action: 'open' }
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
        emoji: spaceEmoji(space),
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
    // A page kept in a Space with no tab open: the first thing to do is open it.
    ...(tab.closed
      ? [
          {
            type: 'item',
            id: 'tab.open',
            label: 'Open',
            icon: 'page',
          } as MenuItem,
          { type: 'separator' } as MenuItem,
        ]
      : []),
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
    case 'tab.open':
      return { action: 'open' };
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
  | { action: 'icon' }
  | { action: 'name-ai' }
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
    { type: 'item', id: 'space.icon', label: 'Change icon…', icon: 'sparkle' },
    {
      type: 'item',
      id: 'space.name-ai',
      label: 'Name with AI',
      icon: 'sparkle',
    },
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
    case 'space.icon':
      return { action: 'icon' };
    case 'space.name-ai':
      return { action: 'name-ai' };
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
  | { action: 'icon'; chatId: number }
  | { action: 'name-ai'; chatId: number }
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
    {
      type: 'item',
      id: `chat.icon:${chatId}`,
      label: 'Change icon…',
      icon: 'sparkle',
    },
    {
      type: 'item',
      id: `chat.name-ai:${chatId}`,
      label: 'Name with AI',
      icon: 'sparkle',
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

// The menu under the chat's name: new, rename and delete at the top, then the
// chats to switch to (newest first).
export function chatSwitchMenuItems(chats: ChatsState): MenuItem[] {
  const active = chats.activeId;
  return [
    // The things you do to chats come first; the list of chats to switch to follows.
    { type: 'item', id: 'chat.new', label: 'New chat', icon: 'plus' },
    {
      type: 'item',
      id: `chat.rename:${active}`,
      label: 'Rename',
      icon: 'pencil',
    },
    {
      type: 'item',
      id: `chat.icon:${active}`,
      label: 'Change icon…',
      icon: 'sparkle',
    },
    {
      type: 'item',
      id: `chat.name-ai:${active}`,
      label: 'Name with AI',
      icon: 'sparkle',
    },
    {
      type: 'item',
      id: `chat.delete:${active}`,
      label: 'Delete chat',
      icon: 'trash',
      danger: true,
    },
    { type: 'separator' },
    { type: 'header', label: 'Switch chat' },
    ...byRecency(chats.conversations).map(
      (chat): MenuItem => ({
        type: 'item',
        id: `chat.select:${chat.id}`,
        label: shortTitle(chat.title),
        emoji: chatEmoji(chat),
        checked: chat.id === active,
        anchor: chat.id === active,
      }),
    ),
  ];
}

export function parseChatChoice(id: string): ChatChoice | null {
  if (id === 'chat.new') return { action: 'new' };
  const m = /^chat\.(select|rename|icon|name-ai|delete):(\d+)$/.exec(id);
  if (!m) return null;
  return {
    action: m[1] as 'select' | 'rename' | 'icon' | 'name-ai' | 'delete',
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

// ---- The artifact menu --------------------------------------------------------

export type ArtifactChoice =
  | { action: 'open' }
  | { action: 'close' }
  | { action: 'rename' }
  | { action: 'icon' }
  | { action: 'name-ai' }
  | { action: 'add-to-chat' }
  | { action: 'move'; spaceId: number }
  | { action: 'move-new-space' }
  | { action: 'take-out' }
  | { action: 'delete' };

// The menu for an artifact (a sidebar row, a card on a Space's overview, or a row
// in the Artifacts panel). Null if there is no such artifact.
export function artifactMenuItems(
  state: SavedState,
  artifacts: ArtifactsState,
  artifactId: number,
): MenuItem[] | null {
  const artifact = findArtifact(artifacts, artifactId);
  if (!artifact) return null;
  const open = state.artifactTabs.some((t) => t.artifactId === artifactId);
  const places = state.spaces.filter((space) => space.id !== artifact.spaceId);
  const moveItems: MenuItem[] = places.map(
    (space): MenuItem => ({
      type: 'item',
      id: `artifact.move:${space.id}`,
      label: space.name,
      emoji: spaceEmoji(space),
    }),
  );
  if (moveItems.length > 0) moveItems.push({ type: 'separator' });
  moveItems.push({
    type: 'item',
    id: 'artifact.move-new-space',
    label: 'New Space…',
    icon: 'plus',
  });
  return [
    { type: 'item', id: 'artifact.open', label: 'Open', icon: 'doc' },
    {
      type: 'item',
      id: 'artifact.close',
      label: 'Close',
      icon: 'x',
      disabled: !open,
    },
    { type: 'item', id: 'artifact.rename', label: 'Rename', icon: 'pencil' },
    {
      type: 'item',
      id: 'artifact.icon',
      label: 'Change icon…',
      icon: 'sparkle',
    },
    {
      type: 'item',
      id: 'artifact.name-ai',
      label: 'Name with AI',
      icon: 'sparkle',
    },
    {
      type: 'item',
      id: 'artifact.add-to-chat',
      label: 'Add to chat',
      icon: 'chat',
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'artifact.move',
      label: 'Move to Space',
      icon: 'move',
      submenu: moveItems,
    },
    ...(artifact.spaceId !== null
      ? [
          {
            type: 'item',
            id: 'artifact.take-out',
            label: 'Take out of Space',
            icon: 'arrow-right',
          } as MenuItem,
        ]
      : []),
    { type: 'separator' },
    {
      type: 'item',
      id: 'artifact.delete',
      label: 'Delete',
      icon: 'trash',
      danger: true,
    },
  ];
}

export function parseArtifactChoice(id: string): ArtifactChoice | null {
  switch (id) {
    case 'artifact.open':
      return { action: 'open' };
    case 'artifact.close':
      return { action: 'close' };
    case 'artifact.rename':
      return { action: 'rename' };
    case 'artifact.icon':
      return { action: 'icon' };
    case 'artifact.name-ai':
      return { action: 'name-ai' };
    case 'artifact.add-to-chat':
      return { action: 'add-to-chat' };
    case 'artifact.move-new-space':
      return { action: 'move-new-space' };
    case 'artifact.take-out':
      return { action: 'take-out' };
    case 'artifact.delete':
      return { action: 'delete' };
  }
  const moved = /^artifact\.move:(\d+)$/.exec(id);
  return moved ? { action: 'move', spaceId: Number(moved[1]) } : null;
}

// ---- The "Add" menu on a Space's overview -------------------------------------

export type AddChoice =
  | { action: 'page' }
  | { action: 'new-artifact'; kind: ArtifactKind }
  | { action: 'move'; artifactId: number }
  | { action: 'copy'; artifactId: number };

const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: 'Markdown',
  text: 'Plain text',
  html: 'HTML',
  code: 'Code',
};

// The menu behind the overview's Add button: a new page, a new artifact (by kind)
// or an artifact from another Space (moved here, or copied here).
export function addMenuItems(
  state: SavedState,
  artifacts: ArtifactsState,
  spaceId: number,
): MenuItem[] | null {
  if (!model.findSpace(state, spaceId)) return null;
  const spaceName = (id: number | null) =>
    id === null ? 'No Space' : (model.findSpace(state, id)?.name ?? 'No Space');
  const others = artifacts.artifacts.filter((a) => a.spaceId !== spaceId);
  return [
    { type: 'item', id: 'add.page', label: 'New page', icon: 'globe' },
    {
      type: 'item',
      id: 'add.artifact',
      label: 'New artifact',
      icon: 'doc',
      submenu: ARTIFACT_KINDS.map(
        (kind): MenuItem => ({
          type: 'item',
          id: `add.artifact:${kind}`,
          label: KIND_LABELS[kind],
        }),
      ),
    },
    { type: 'separator' },
    { type: 'header', label: 'From another Space' },
    {
      type: 'item',
      id: 'add.existing',
      label: 'Existing artifact',
      icon: 'file',
      disabled: others.length === 0,
      submenu: others.map(
        (a): MenuItem => ({
          type: 'item',
          id: `add.pick:${a.id}`,
          label: `${shortTitle(a.title)} · ${shortTitle(spaceName(a.spaceId))}`,
          emoji: artifactEmoji(a),
          submenu: [
            {
              type: 'item',
              id: `add.move:${a.id}`,
              label: 'Move here',
              icon: 'move',
            },
            {
              type: 'item',
              id: `add.copy:${a.id}`,
              label: 'Copy here',
              icon: 'copy',
            },
          ],
        }),
      ),
    },
  ];
}

export function parseAddChoice(id: string): AddChoice | null {
  if (id === 'add.page') return { action: 'page' };
  const created = /^add\.artifact:([a-z]+)$/.exec(id);
  if (created) {
    const kind = ARTIFACT_KINDS.find((k) => k === created[1]);
    return kind ? { action: 'new-artifact', kind } : null;
  }
  const other = /^add\.(move|copy):(\d+)$/.exec(id);
  if (other) {
    return {
      action: other[1] as 'move' | 'copy',
      artifactId: Number(other[2]),
    };
  }
  return null;
}

// ---- The menu of a link in a chat ---------------------------------------------

export type LinkChoice =
  | { action: 'open' }
  | { action: 'reopen' }
  | { action: 'show-in-space' }
  | { action: 'remove' };

// The menu of a link chip, or of an @name in a sent message. `removable` is true
// for a chip (the link can be taken off the chat), false for a token in a message.
export function linkMenuItems(
  ref: ChatRef,
  workspace: Workspace,
  removable: boolean,
): MenuItem[] {
  const link = resolveLink(ref, workspace);
  // A page that was closed all the way (not just kept in its Space) can come back
  // from the address that was remembered.
  const canReopen = ref.kind === 'tab' && !link.open && Boolean(ref.url);
  const spaceId =
    ref.kind === 'tab'
      ? (workspace.tabs.find((t) => t.id === ref.id)?.spaceId ?? null)
      : ref.kind === 'artifact'
        ? ((workspace.artifacts ?? []).find((a) => a.id === ref.id)?.spaceId ??
          null)
        : null;
  return [
    {
      type: 'item',
      id: 'link.open',
      label: 'Open',
      icon: 'ext-link',
      disabled: !link.open,
    },
    ...(canReopen
      ? [
          {
            type: 'item',
            id: 'link.reopen',
            label: 'Reopen',
            icon: 'retry',
          } as MenuItem,
        ]
      : []),
    ...(ref.kind !== 'space'
      ? [
          {
            type: 'item',
            id: 'link.show-in-space',
            label: 'Show in Space',
            icon: 'layers',
            disabled: spaceId === null,
          } as MenuItem,
        ]
      : []),
    ...(removable
      ? [
          { type: 'separator' } as MenuItem,
          {
            type: 'item',
            id: 'link.remove',
            label: 'Remove from chat',
            icon: 'x',
            danger: true,
          } as MenuItem,
        ]
      : []),
  ];
}

export function parseLinkChoice(id: string): LinkChoice | null {
  switch (id) {
    case 'link.open':
      return { action: 'open' };
    case 'link.reopen':
      return { action: 'reopen' };
    case 'link.show-in-space':
      return { action: 'show-in-space' };
    case 'link.remove':
      return { action: 'remove' };
  }
  return null;
}

// ---- The menu of a chat message ---------------------------------------------------

export type MessageChoice =
  | { action: 'copy' }
  | { action: 'retry' }
  | { action: 'branch' };

// Copy (the selected text, else the whole message), and for one of your own
// messages Retry (only the newest, when no reply is being written) and Branch
// (any of them).
export function messageMenuItems(options: {
  role: 'user' | 'assistant';
  hasSelection: boolean;
  isNewestUser: boolean;
  busy: boolean;
}): MenuItem[] {
  const items: MenuItem[] = [
    {
      type: 'item',
      id: 'msg.copy',
      label: options.hasSelection ? 'Copy selection' : 'Copy message',
      icon: 'copy',
      shortcut: 'Ctrl+C',
    },
  ];
  if (options.role === 'user') {
    items.push(
      { type: 'separator' },
      {
        type: 'item',
        id: 'msg.retry',
        label: 'Retry',
        icon: 'retry',
        disabled: !options.isNewestUser || options.busy,
      },
      {
        type: 'item',
        id: 'msg.branch',
        label: 'Branch from here',
        icon: 'branch',
      },
    );
  }
  return items;
}

export function parseMessageChoice(id: string): MessageChoice | null {
  switch (id) {
    case 'msg.copy':
      return { action: 'copy' };
    case 'msg.retry':
      return { action: 'retry' };
    case 'msg.branch':
      return { action: 'branch' };
  }
  return null;
}

// ---- Editing menus: the address bar and the message box ----------------------------

export type EditChoice =
  | { action: 'undo' }
  | { action: 'cut' }
  | { action: 'copy' }
  | { action: 'paste' }
  | { action: 'paste-and-go' }
  | { action: 'select-all' }
  | { action: 'add-to-chat' };

// Cut, copy, paste and select all for a text box. `pasteAndGo` adds the address
// bar's "Paste and go".
export function editMenuItems(options: {
  hasSelection: boolean;
  canPaste: boolean;
  pasteAndGo: boolean;
  // Adds "Add selection to chat" (for the artifact editor).
  addToChat?: boolean;
}): MenuItem[] {
  return [
    {
      type: 'item',
      id: 'edit.undo',
      label: 'Undo',
      icon: 'undo',
      shortcut: 'Ctrl+Z',
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'edit.cut',
      label: 'Cut',
      icon: 'cut',
      shortcut: 'Ctrl+X',
      disabled: !options.hasSelection,
    },
    {
      type: 'item',
      id: 'edit.copy',
      label: 'Copy',
      icon: 'copy',
      shortcut: 'Ctrl+C',
      disabled: !options.hasSelection,
    },
    {
      type: 'item',
      id: 'edit.paste',
      label: 'Paste',
      icon: 'paste',
      shortcut: 'Ctrl+V',
      disabled: !options.canPaste,
    },
    ...(options.pasteAndGo
      ? [
          {
            type: 'item',
            id: 'edit.paste-and-go',
            label: 'Paste and go',
            icon: 'arrow-right',
            disabled: !options.canPaste,
          } as MenuItem,
        ]
      : []),
    { type: 'separator' },
    {
      type: 'item',
      id: 'edit.select-all',
      label: 'Select all',
      icon: 'select-all',
      shortcut: 'Ctrl+A',
    },
    ...(options.addToChat
      ? [
          { type: 'separator' } as MenuItem,
          {
            type: 'item',
            id: 'edit.add-to-chat',
            label: 'Add selection to chat',
            icon: 'chat',
            disabled: !options.hasSelection,
          } as MenuItem,
        ]
      : []),
  ];
}

export function parseEditChoice(id: string): EditChoice | null {
  switch (id) {
    case 'edit.undo':
      return { action: 'undo' };
    case 'edit.cut':
      return { action: 'cut' };
    case 'edit.copy':
      return { action: 'copy' };
    case 'edit.paste':
      return { action: 'paste' };
    case 'edit.paste-and-go':
      return { action: 'paste-and-go' };
    case 'edit.select-all':
      return { action: 'select-all' };
    case 'edit.add-to-chat':
      return { action: 'add-to-chat' };
  }
  return null;
}

// ---- Menus inside a web page ---------------------------------------------------

export type PageChoice =
  | { action: 'back' }
  | { action: 'forward' }
  | { action: 'reload' }
  | { action: 'find' }
  | { action: 'bookmark' }
  | { action: 'save-to-space'; spaceId: number }
  | { action: 'save-to-new-space' }
  | { action: 'zoom-in' }
  | { action: 'zoom-out' }
  | { action: 'zoom-reset' }
  | { action: 'print' }
  | { action: 'save-page-as' }
  | { action: 'inspect' }
  | { action: 'add-page-to-chat' }
  | { action: 'open-link' }
  | { action: 'open-link-in'; spaceId: number }
  | { action: 'open-link-in-new-space' }
  | { action: 'add-link-to-chat' }
  | { action: 'copy-link' }
  | { action: 'save-link-as' }
  | { action: 'open-image' }
  | { action: 'save-image-as' }
  | { action: 'copy-image' }
  | { action: 'copy-image-address' }
  | { action: 'copy-selection' }
  | { action: 'search-selection' }
  | { action: 'add-selection-to-chat' };

// Right-click on an empty part of a page.
export function pageMenuItems(options: {
  canGoBack: boolean;
  canGoForward: boolean;
  // The page is bookmarked (the entry then says "Remove bookmark").
  bookmarked?: boolean;
  // The Spaces the page can be saved into.
  spaces?: StarSpace[];
}): MenuItem[] {
  return [
    {
      type: 'item',
      id: 'page.back',
      label: 'Back',
      icon: 'arrow-left',
      disabled: !options.canGoBack,
    },
    {
      type: 'item',
      id: 'page.forward',
      label: 'Forward',
      icon: 'arrow-right',
      disabled: !options.canGoForward,
    },
    { type: 'item', id: 'page.reload', label: 'Reload', icon: 'reload' },
    {
      type: 'item',
      id: 'page.find',
      label: 'Find in page',
      icon: 'search',
      shortcut: 'Ctrl+F',
    },
    {
      type: 'item',
      id: 'page.zoom',
      label: 'Zoom',
      icon: 'zoom',
      submenu: zoomItems('page'),
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'page.add-to-chat',
      label: 'Add page to chat',
      icon: 'chat',
    },
    {
      type: 'item',
      id: 'page.bookmark',
      label: options.bookmarked ? 'Remove bookmark' : 'Bookmark this page',
      icon: 'star',
      shortcut: 'Ctrl+D',
    },
    {
      type: 'item',
      id: 'page.save-to-space',
      label: 'Save to Space',
      icon: 'folder',
      submenu: saveToSpaceItems(
        options.spaces ?? [],
        (id) => `page.save-space:${id}`,
        'page.save-new-space',
      ),
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'page.save-as',
      label: 'Save page as…',
      icon: 'download',
      shortcut: 'Ctrl+S',
    },
    {
      type: 'item',
      id: 'page.print',
      label: 'Print…',
      icon: 'print',
      shortcut: 'Ctrl+P',
    },
    { type: 'item', id: 'page.inspect', label: 'Inspect', icon: 'code' },
  ];
}

// Right-click on a link.
// `here` is the Space of the page the link is on (null if it is in none). When
// it is in one, "Open in new tab in this Space" can be clicked itself, and hovering
// it offers the other Spaces.
export function pageLinkMenuItems(
  state: SavedState,
  here: number | null = null,
): MenuItem[] {
  const spaces: MenuItem[] = state.spaces
    .filter((space) => space.id !== here)
    .map(
      (space): MenuItem => ({
        type: 'item',
        id: `page.open-link-in:${space.id}`,
        label: space.name,
        emoji: spaceEmoji(space),
      }),
    );
  if (spaces.length > 0) spaces.push({ type: 'separator' });
  spaces.push({
    type: 'item',
    id: 'page.open-link-in-new-space',
    label: 'New Space…',
    icon: 'plus',
  });
  return [
    {
      type: 'item',
      id: 'page.open-link',
      label: 'Open in new tab',
      icon: 'ext-link',
    },
    {
      type: 'item',
      id: 'page.open-link-in',
      label:
        here !== null
          ? 'Open in new tab in this Space'
          : 'Open in new tab in Space',
      icon: 'layers',
      submenu: spaces,
      choosable: here !== null,
    },
    {
      type: 'item',
      id: 'page.add-link-to-chat',
      label: 'Add link to chat',
      icon: 'chat',
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'page.copy-link',
      label: 'Copy link address',
      icon: 'link',
    },
    {
      type: 'item',
      id: 'page.save-link-as',
      label: 'Save link as…',
      icon: 'download',
    },
  ];
}

// Right-click on an image.
export function pageImageMenuItems(): MenuItem[] {
  return [
    {
      type: 'item',
      id: 'page.open-image',
      label: 'Open image in new tab',
      icon: 'ext-link',
    },
    { type: 'item', id: 'page.copy-image', label: 'Copy image', icon: 'image' },
    {
      type: 'item',
      id: 'page.copy-image-address',
      label: 'Copy image address',
      icon: 'link',
    },
    {
      type: 'item',
      id: 'page.save-image-as',
      label: 'Save image as…',
      icon: 'download',
    },
  ];
}

const shortSelection = (text: string) => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 24 ? `${oneLine.slice(0, 24)}…` : oneLine;
};

// Right-click on selected text.
export function pageSelectionMenuItems(selection: string): MenuItem[] {
  return [
    {
      type: 'item',
      id: 'page.copy-selection',
      label: 'Copy',
      icon: 'copy',
      shortcut: 'Ctrl+C',
    },
    {
      type: 'item',
      id: 'page.search-selection',
      label: `Search the web for “${shortSelection(selection)}”`,
      icon: 'search',
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'page.add-selection-to-chat',
      label: 'Add selection to chat',
      icon: 'chat',
    },
  ];
}

export function parsePageChoice(id: string): PageChoice | null {
  switch (id) {
    case 'page.back':
      return { action: 'back' };
    case 'page.forward':
      return { action: 'forward' };
    case 'page.reload':
      return { action: 'reload' };
    case 'page.find':
      return { action: 'find' };
    case 'page.bookmark':
      return { action: 'bookmark' };
    case 'page.save-new-space':
      return { action: 'save-to-new-space' };
    case 'page.zoom-in':
      return { action: 'zoom-in' };
    case 'page.zoom-out':
      return { action: 'zoom-out' };
    case 'page.zoom-reset':
      return { action: 'zoom-reset' };
    case 'page.print':
      return { action: 'print' };
    case 'page.save-as':
      return { action: 'save-page-as' };
    case 'page.save-link-as':
      return { action: 'save-link-as' };
    case 'page.save-image-as':
      return { action: 'save-image-as' };
    case 'page.inspect':
      return { action: 'inspect' };
    case 'page.add-to-chat':
      return { action: 'add-page-to-chat' };
    case 'page.open-link':
    case 'page.open-link-in':
      return { action: 'open-link' };
    case 'page.open-link-in-new-space':
      return { action: 'open-link-in-new-space' };
    case 'page.add-link-to-chat':
      return { action: 'add-link-to-chat' };
    case 'page.copy-link':
      return { action: 'copy-link' };
    case 'page.open-image':
      return { action: 'open-image' };
    case 'page.copy-image':
      return { action: 'copy-image' };
    case 'page.copy-image-address':
      return { action: 'copy-image-address' };
    case 'page.copy-selection':
      return { action: 'copy-selection' };
    case 'page.search-selection':
      return { action: 'search-selection' };
    case 'page.add-selection-to-chat':
      return { action: 'add-selection-to-chat' };
  }
  const inSpace = /^page\.open-link-in:(\d+)$/.exec(id);
  if (inSpace) return { action: 'open-link-in', spaceId: Number(inSpace[1]) };
  const saveTo = /^page\.save-space:(\d+)$/.exec(id);
  return saveTo
    ? { action: 'save-to-space', spaceId: Number(saveTo[1]) }
    : null;
}

// ---- The emoji picker ----------------------------------------------------------
// Drawn as a grid by the popup layer (ui/EmojiPicker.tsx), but described like a
// menu so a choice is checked against what was sent, the same as every menu.

export type EmojiChoice = { emoji: string } | { reset: true };

export function emojiPickerItems(current: string | null): MenuItem[] {
  return [
    { type: 'item', id: 'emoji:default', label: 'Use the default' },
    ...EMOJI_GROUPS.flatMap((group): MenuItem[] => [
      { type: 'header', label: group.name },
      ...group.emojis.map(
        (emoji): MenuItem => ({
          type: 'item',
          id: `emoji:${emoji}`,
          label: emoji,
          checked: emoji === current,
        }),
      ),
    ]),
  ];
}

export function parseEmojiChoice(id: string): EmojiChoice | null {
  if (id === 'emoji:default') return { reset: true };
  if (!id.startsWith('emoji:')) return null;
  const emoji = cleanEmoji(id.slice('emoji:'.length));
  return emoji === null ? null : { emoji };
}

// ---- The toolbar "…" menu (browser tools) -------------------------------------
// One menu button for the browser's tools. More go in here as they are built
// (downloads, history...).

export type ToolsChoice =
  | { action: 'find' }
  | { action: 'zoom-in' }
  | { action: 'zoom-out' }
  | { action: 'zoom-reset' }
  | { action: 'print' }
  | { action: 'devtools' };

// The three zoom choices (in the "…" menu's Zoom submenu, the page's right-click
// menu, and the zoom chip's menu).
export function zoomItems(idPrefix: 'tools' | 'page'): MenuItem[] {
  return [
    {
      type: 'item',
      id: `${idPrefix}.zoom-in`,
      label: 'Zoom in',
      icon: 'plus',
      shortcut: 'Ctrl++',
    },
    {
      type: 'item',
      id: `${idPrefix}.zoom-out`,
      label: 'Zoom out',
      icon: 'minus',
      shortcut: 'Ctrl+-',
    },
    {
      type: 'item',
      id: `${idPrefix}.zoom-reset`,
      label: 'Reset (100%)',
      shortcut: 'Ctrl+0',
    },
  ];
}

export function toolsMenuItems(options: {
  hasPage: boolean;
  // The current page's zoom, as text like "125%" (shown in the Zoom entry).
  zoomText?: string;
}): MenuItem[] {
  const off = !options.hasPage;
  return [
    {
      type: 'item',
      id: 'tools.find',
      label: 'Find in page',
      icon: 'search',
      shortcut: 'Ctrl+F',
      disabled: off,
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'tools.zoom',
      label: options.zoomText ? `Zoom (${options.zoomText})` : 'Zoom',
      icon: 'zoom',
      disabled: off,
      submenu: zoomItems('tools'),
    },
    {
      type: 'item',
      id: 'tools.print',
      label: 'Print…',
      icon: 'print',
      shortcut: 'Ctrl+P',
      disabled: off,
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'tools.devtools',
      label: 'Developer tools',
      icon: 'code',
      shortcut: 'F12',
      disabled: off,
    },
  ];
}

// The little menu behind the zoom chip in the address bar.
export function zoomChipMenuItems(): MenuItem[] {
  return zoomItems('tools');
}

export function parseToolsChoice(id: string): ToolsChoice | null {
  switch (id) {
    case 'tools.find':
      return { action: 'find' };
    case 'tools.zoom-in':
      return { action: 'zoom-in' };
    case 'tools.zoom-out':
      return { action: 'zoom-out' };
    case 'tools.zoom-reset':
      return { action: 'zoom-reset' };
    case 'tools.print':
      return { action: 'print' };
    case 'tools.devtools':
      return { action: 'devtools' };
  }
  return null;
}

// ---- The Library's "…" menu --------------------------------------------------------

export type LibraryChoice =
  | { action: 'clear-history'; range: 'hour' | 'day' | 'all' }
  | { action: 'clear-closed' }
  | { action: 'clear-downloads' }
  | { action: 'empty-deleted' };

// What the "…" next to the Library's search box offers, for the list shown.
export function libraryMenuItems(
  list: 'history' | 'closed' | 'deleted' | 'downloads',
): MenuItem[] {
  if (list === 'downloads') {
    return [
      {
        type: 'item',
        id: 'library.clear-downloads',
        label: 'Clear finished downloads',
        icon: 'trash',
      },
    ];
  }
  if (list === 'deleted') {
    return [
      {
        type: 'item',
        id: 'library.empty-deleted',
        label: 'Empty Recently deleted…',
        icon: 'trash',
        danger: true,
      },
    ];
  }
  if (list === 'closed') {
    return [
      {
        type: 'item',
        id: 'library.clear-closed',
        label: 'Clear this list',
        icon: 'trash',
      },
    ];
  }
  return [
    {
      type: 'item',
      id: 'library.clear-hour',
      label: 'Clear the last hour',
      icon: 'clock',
    },
    {
      type: 'item',
      id: 'library.clear-day',
      label: 'Clear the last 24 hours',
      icon: 'clock',
    },
    { type: 'separator' },
    {
      type: 'item',
      id: 'library.clear-all',
      label: 'Clear all history…',
      icon: 'trash',
      danger: true,
    },
  ];
}

export function parseLibraryChoice(id: string): LibraryChoice | null {
  switch (id) {
    case 'library.clear-hour':
      return { action: 'clear-history', range: 'hour' };
    case 'library.clear-day':
      return { action: 'clear-history', range: 'day' };
    case 'library.clear-all':
      return { action: 'clear-history', range: 'all' };
    case 'library.clear-closed':
      return { action: 'clear-closed' };
    case 'library.empty-deleted':
      return { action: 'empty-deleted' };
    case 'library.clear-downloads':
      return { action: 'clear-downloads' };
  }
  return null;
}

// ---- The star: bookmark a page, or save it into a Space ---------------------------

// A Space as the star's menu lists it.
export interface StarSpace {
  id: number;
  name: string;
  emoji: string;
  // The page is already in this Space.
  saved: boolean;
}

export type StarChoice =
  | { action: 'bookmark' }
  | { action: 'space'; spaceId: number }
  | { action: 'new-space' };

// The Spaces to save a page into (ticked and greyed where it already is), and
// "New Space…". Used by the star's menu and the page's right-click menu.
function saveToSpaceItems(
  spaces: StarSpace[],
  idFor: (spaceId: number) => string,
  newSpaceId: string,
): MenuItem[] {
  return [
    ...spaces.map(
      (space): MenuItem => ({
        type: 'item',
        id: idFor(space.id),
        label: space.name,
        emoji: space.emoji,
        checked: space.saved,
        disabled: space.saved,
      }),
    ),
    ...(spaces.length > 0 ? [{ type: 'separator' } as MenuItem] : []),
    { type: 'item', id: newSpaceId, label: 'New Space…', icon: 'plus' },
  ];
}

// The menu under the star in the address bar.
export function starMenuItems(options: {
  bookmarked: boolean;
  spaces: StarSpace[];
}): MenuItem[] {
  return [
    {
      type: 'item',
      id: 'star.bookmark',
      label: options.bookmarked ? 'Remove bookmark' : 'Bookmark this page',
      icon: 'star',
      shortcut: 'Ctrl+D',
    },
    { type: 'separator' },
    { type: 'header', label: 'Save to a Space' },
    ...saveToSpaceItems(
      options.spaces,
      (id) => `star.space:${id}`,
      'star.new-space',
    ),
  ];
}

export function parseStarChoice(id: string): StarChoice | null {
  if (id === 'star.bookmark') return { action: 'bookmark' };
  if (id === 'star.new-space') return { action: 'new-space' };
  const m = /^star\.space:(\d+)$/.exec(id);
  return m ? { action: 'space', spaceId: Number(m[1]) } : null;
}

// ---- A download's right-click menu, and the Library's "…" for downloads ----------

export type DownloadChoice =
  | { action: 'open' }
  | { action: 'show' }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'cancel' }
  | { action: 'remove' };

// What can be done with a download, by how it stands.
export function downloadMenuItems(download: {
  state: 'downloading' | 'paused' | 'done' | 'cancelled' | 'failed' | 'blocked';
}): MenuItem[] {
  const items: MenuItem[] = [];
  if (download.state === 'done') {
    items.push(
      { type: 'item', id: 'download.open', label: 'Open', icon: 'file' },
      {
        type: 'item',
        id: 'download.show',
        label: 'Show in folder',
        icon: 'folder',
      },
      { type: 'separator' },
    );
  }
  if (download.state === 'downloading') {
    items.push({
      type: 'item',
      id: 'download.pause',
      label: 'Pause',
      icon: 'stop',
    });
  }
  if (download.state === 'paused') {
    items.push({
      type: 'item',
      id: 'download.resume',
      label: 'Resume',
      icon: 'play',
    });
  }
  if (download.state === 'downloading' || download.state === 'paused') {
    items.push({
      type: 'item',
      id: 'download.cancel',
      label: 'Cancel download',
      icon: 'x',
    });
  }
  items.push({
    type: 'item',
    id: 'download.remove',
    label: 'Remove from list',
    icon: 'trash',
  });
  return items;
}

export function parseDownloadChoice(id: string): DownloadChoice | null {
  switch (id) {
    case 'download.open':
      return { action: 'open' };
    case 'download.show':
      return { action: 'show' };
    case 'download.pause':
      return { action: 'pause' };
    case 'download.resume':
      return { action: 'resume' };
    case 'download.cancel':
      return { action: 'cancel' };
    case 'download.remove':
      return { action: 'remove' };
  }
  return null;
}

// ---- The question a site asks (camera, location...) ---------------------------
// Shown in the popup layer under the address bar. Closing it without answering
// refuses this once and remembers nothing.

const PERMISSION_ICONS: Record<AskKind, IconName> = {
  camera: 'camera',
  microphone: 'mic',
  location: 'pin',
  notifications: 'bell',
  clipboard: 'paste',
};

export type PermissionChoice = 'allow' | 'once' | 'block';

export function permissionPromptItems(
  host: string,
  kinds: AskKind[],
): MenuItem[] {
  return [
    {
      type: 'header',
      label: askText(host, kinds),
      icon: PERMISSION_ICONS[kinds[0]] ?? 'globe',
    },
    {
      type: 'item',
      id: 'permission.allow',
      label: 'Allow while visiting the site',
    },
    { type: 'item', id: 'permission.once', label: 'Allow this time' },
    { type: 'item', id: 'permission.block', label: 'Never allow' },
  ];
}

export function parsePermissionChoice(id: string): PermissionChoice | null {
  switch (id) {
    case 'permission.allow':
      return 'allow';
    case 'permission.once':
      return 'once';
    case 'permission.block':
      return 'block';
  }
  return null;
}

// ---- The site chip's menu (what this site may do) -----------------------------
// Opened from the lock at the start of the address bar. Each kind of thing a site
// can ask for has a small menu: Ask (the default), Allow, Block.

export type SiteChoice =
  | { action: 'set'; kind: AskKind; answer: Answer | null }
  | { action: 'reset' };

const SITE_KINDS: { kind: AskKind; label: string; icon: IconName }[] = [
  { kind: 'camera', label: 'Camera', icon: 'camera' },
  { kind: 'microphone', label: 'Microphone', icon: 'mic' },
  { kind: 'location', label: 'Location', icon: 'pin' },
  { kind: 'notifications', label: 'Notifications', icon: 'bell' },
  { kind: 'clipboard', label: 'Clipboard', icon: 'paste' },
];

export function siteMenuItems(options: {
  host: string;
  secure: boolean;
  // The site can ask for permissions (https, or this computer).
  canAsk: boolean;
  // What is remembered for the site, by kind (empty if nothing).
  answers: Partial<Record<AskKind, Answer>>;
}): MenuItem[] {
  const header: MenuItem = {
    type: 'header',
    label: options.host,
    icon: options.secure ? 'lock' : 'warn',
    detail: options.secure
      ? 'Connection is secure'
      : 'Connection is not secure',
  };
  if (!options.canAsk) {
    return [
      header,
      {
        type: 'item',
        id: 'site.insecure',
        label: 'A site that is not secure cannot ask for permissions',
        disabled: true,
      },
    ];
  }
  // Like Chrome, only what you have changed for this site is listed; the rest is
  // simply "ask".
  const changed = SITE_KINDS.filter(({ kind }) => options.answers[kind]);
  if (changed.length === 0) {
    return [
      header,
      {
        type: 'item',
        id: 'site.none',
        label:
          'No saved permissions. This site asks before using your camera, location and so on.',
        disabled: true,
      },
    ];
  }
  return [
    header,
    ...changed.map(
      ({ kind, label, icon }): MenuItem => ({
        type: 'item',
        id: `site.kind:${kind}`,
        label,
        icon,
        submenu: (['ask', 'allow', 'block'] as const).map(
          (answer): MenuItem => ({
            type: 'item',
            id: `site.set:${kind}:${answer}`,
            label:
              answer === 'ask' ? 'Ask' : answer === 'allow' ? 'Allow' : 'Block',
            checked: (options.answers[kind] ?? 'ask') === answer,
          }),
        ),
      }),
    ),
    {
      type: 'item',
      id: 'site.reset',
      label: 'Reset permissions for this site',
      icon: 'undo',
    },
  ];
}

export function parseSiteChoice(id: string): SiteChoice | null {
  if (id === 'site.reset') return { action: 'reset' };
  const m = /^site\.set:([a-z]+):(ask|allow|block)$/.exec(id);
  if (!m) return null;
  const kind = ASK_KINDS.find((k) => k === m[1]);
  if (!kind) return null;
  return {
    action: 'set',
    kind,
    answer: m[2] === 'ask' ? null : (m[2] as Answer),
  };
}
