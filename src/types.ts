// What the toolbar needs to know about the current tab.
export interface TabState {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

// Shape of the API the preload script exposes to the UI as window.browserApi.
export interface BrowserApi {
  platform: string;
  // Load whatever the user typed in the address bar (a URL or search text).
  navigate: (input: string) => void;
  goBack: () => void;
  goForward: () => void;
  // Called whenever the tab's address or back/forward ability changes.
  // Returns a function to unsubscribe.
  onTabState: (callback: (state: TabState) => void) => () => void;
}

declare global {
  interface Window {
    browserApi: BrowserApi;
  }
}
