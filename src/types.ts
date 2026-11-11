// One tab as the toolbar/sidebar UI sees it.
export interface TabInfo {
  id: number;
  title: string;
  url: string;
  // Address of the site's icon (http/https only), or null if there is none.
  favicon: string | null;
}

// Everything the UI needs to draw the sidebar, address bar and buttons.
export interface TabsState {
  tabs: TabInfo[];
  activeId: number;
  // Whether the ACTIVE tab can go back / forward.
  canGoBack: boolean;
  canGoForward: boolean;
}

// Shape of the API the preload script exposes to the UI as window.browserApi.
export interface BrowserApi {
  platform: string;
  // Load whatever the user typed (a URL or search text) in the active tab.
  navigate: (input: string) => void;
  goBack: () => void;
  goForward: () => void;
  newTab: () => void;
  closeTab: (id: number) => void;
  switchTab: (id: number) => void;
  // Called whenever tabs, the active tab, titles or addresses change.
  // Returns a function to unsubscribe.
  onTabsState: (callback: (state: TabsState) => void) => () => void;
}

declare global {
  interface Window {
    browserApi: BrowserApi;
  }
}
