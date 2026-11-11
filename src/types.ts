// Shape of the API the preload script exposes to the UI as window.browserApi.
export interface BrowserApi {
  platform: string;
  // Load whatever the user typed in the address bar (a URL or search text).
  navigate: (input: string) => void;
  // Called whenever the tab's address changes. Returns a function to unsubscribe.
  onUrlChange: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    browserApi: BrowserApi;
  }
}
