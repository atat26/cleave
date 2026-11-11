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
  sidebarPinned: boolean;
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
  // Called whenever anything the UI shows changes. Returns an unsubscribe function.
  onState: (callback: (state: UiState) => void) => () => void;
}

declare global {
  interface Window {
    browserApi: BrowserApi;
  }
}
