// Native (Windows) right-click menus for tabs and Spaces. This file only
// describes the menus; the actions themselves live in tabs.ts.
import { Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import * as model from './model';
import type { SavedState, SpaceColor } from './model';

export interface MenuActions {
  moveTab: (tabId: number, spaceId: number | null) => void;
  moveTabToNewSpace: (tabId: number) => void;
  closeTab: (tabId: number) => void;
  renameSpace: (spaceId: number) => void;
  setSpaceColor: (spaceId: number, color: SpaceColor) => void;
  setSpaceCollapsed: (spaceId: number, collapsed: boolean) => void;
  ungroupSpace: (spaceId: number) => void;
  deleteSpace: (spaceId: number) => void;
}

// In Windows menus "&" marks a keyboard shortcut letter, so a literal "&" in a
// name must be doubled. Long names are shortened.
const label = (text: string) => {
  const short = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return short.replace(/&/g, '&&');
};

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export function tabMenu(
  state: SavedState,
  tabId: number,
  actions: MenuActions,
): Menu | null {
  const tab = model.findTab(state, tabId);
  if (!tab) return null;

  const moveItems: MenuItemConstructorOptions[] = state.spaces.map((space) => ({
    label: label(space.name),
    type: 'radio',
    checked: space.id === tab.spaceId,
    click: () => actions.moveTab(tabId, space.id),
  }));

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Move to Space',
      submenu: [
        ...moveItems,
        ...(moveItems.length > 0 ? [{ type: 'separator' as const }] : []),
        { label: 'New Space', click: () => actions.moveTabToNewSpace(tabId) },
      ],
    },
  ];
  if (tab.spaceId !== null) {
    template.push({
      label: 'Remove from Space',
      click: () => actions.moveTab(tabId, null),
    });
  }
  template.push(
    { type: 'separator' },
    { label: 'Close tab', click: () => actions.closeTab(tabId) },
  );

  return Menu.buildFromTemplate(template);
}

export function spaceMenu(
  state: SavedState,
  spaceId: number,
  actions: MenuActions,
): Menu | null {
  const space = model.findSpace(state, spaceId);
  if (!space) return null;
  const tabCount = state.tabs.filter((tab) => tab.spaceId === spaceId).length;

  return Menu.buildFromTemplate([
    { label: 'Rename Space', click: () => actions.renameSpace(spaceId) },
    {
      label: 'Colour',
      submenu: model.SPACE_COLORS.map((color) => ({
        label: capitalize(color),
        type: 'radio' as const,
        checked: color === space.color,
        click: () => actions.setSpaceColor(spaceId, color),
      })),
    },
    {
      label: space.collapsed ? 'Expand' : 'Collapse',
      click: () => actions.setSpaceCollapsed(spaceId, !space.collapsed),
    },
    { type: 'separator' },
    {
      label: 'Ungroup Space (keep tabs)',
      click: () => actions.ungroupSpace(spaceId),
    },
    {
      label:
        tabCount > 0
          ? `Delete Space and close ${tabCount} tab${tabCount === 1 ? '' : 's'}…`
          : 'Delete Space',
      click: () => actions.deleteSpace(spaceId),
    },
  ]);
}
