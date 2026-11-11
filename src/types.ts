// Shape of the API the preload script exposes to the UI as window.browserApi.
export interface BrowserApi {
  platform: string;
}

declare global {
  interface Window {
    browserApi: BrowserApi;
  }
}
