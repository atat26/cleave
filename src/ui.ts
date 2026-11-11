// Loads our own UI page (the React app) into a window or view. The same page is
// used for the main window (toolbar) and the sidebar view; the URL hash tells
// it which one it is.
import path from 'node:path';
import type { WebContents } from 'electron';

export function loadUi(contents: WebContents, hash = ''): Promise<void> {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return contents.loadURL(
      MAIN_WINDOW_VITE_DEV_SERVER_URL + (hash ? `#${hash}` : ''),
    );
  }
  return contents.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    hash ? { hash } : undefined,
  );
}
