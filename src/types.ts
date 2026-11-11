import type { ActiveRef, SpaceColor } from './model';

// A tab as the UI sees it.
export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  // The Space it belongs to, or null if ungrouped.
  spaceId: number | null;
  // False for a "sleeping" tab that has not been opened yet this session.
  loaded: boolean;
}

export interface SpaceInfo {
  id: number;
  name: string;
  color: SpaceColor;
  collapsed: boolean;
}

// Everything the UI needs to draw itself.
export interface UiState {
  spaces: SpaceInfo[];
  tabs: TabInfo[];
  // What is selected: a web tab or a Space's Lead (overview) tab.
  active: ActiveRef | null;
  // Whether the ACTIVE web tab can go back / forward.
  canGoBack: boolean;
  canGoForward: boolean;
  // Pinned: always open, and the page makes room for it.
  sidebarPinned: boolean;
  // Currently showing its full width (pinned, or opened by hovering).
  sidebarExpanded: boolean;
}

// Shape of the API the preload script exposes to the UI as window.browserApi.
export interface BrowserApi {
  platform: string;
  // Load whatever the user typed (a URL or search text) in the active tab.
  navigate: (input: string) => void;
  goBack: () => void;
  goForward: () => void;
  // New tab inside a Space, or ungrouped when spaceId is null.
  newTab: (spaceId: number | null) => void;
  closeTab: (id: number) => void;
  selectTab: (id: number) => void;
  selectLead: (spaceId: number) => void;
  newSpace: () => void;
  setSpaceCollapsed: (id: number, collapsed: boolean) => void;
  renameSpace: (id: number, name: string) => void;
  // The mouse rested on the sidebar's icon strip: please open it. (Closing is
  // decided by the app, by watching how far the mouse has moved away.)
  hoverSidebar: () => void;
  // Dragging the sidebar's edge. The width is where the edge is now, in pixels.
  startSidebarDrag: () => void;
  dragSidebar: (width: number) => void;
  endSidebarDrag: (width: number) => void;
  // Called with how far from the left edge the toolbar and web pages start,
  // including while the sidebar is sliding. Returns an unsubscribe function.
  onLayout: (callback: (contentLeft: number) => void) => () => void;
  // Right-click menus. The app shows a native menu and performs the choice.
  showTabMenu: (id: number) => void;
  showSpaceMenu: (id: number) => void;
  // Called when "Rename Space" is chosen from a menu: show the rename box.
  onRenameRequest: (callback: (spaceId: number) => void) => () => void;
  // Called whenever anything the UI shows changes. Returns an unsubscribe function.
  onState: (callback: (state: UiState) => void) => () => void;
}

declare global {
  interface Window {
    browserApi: BrowserApi;
  }
}
