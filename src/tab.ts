import { BrowserWindow, WebContentsView } from 'electron';
import { TOOLBAR_HEIGHT } from './layout';

export const DEFAULT_URL = 'https://duckduckgo.com';

// Create the single web page tab and keep it sized to the window.
export function createTab(win: BrowserWindow): WebContentsView {
  const view = new WebContentsView({
    // Web content is untrusted: no Node.js, no preload bridge, fully sandboxed.
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links that want a new window (target="_blank") open in this same tab for
  // now. Only normal web addresses are allowed.
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void view.webContents.loadURL(url);
    }
    return { action: 'deny' };
  });

  win.contentView.addChildView(view);

  const fitToWindow = () => {
    const [width, height] = win.getContentSize();
    view.setBounds({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width,
      height: Math.max(0, height - TOOLBAR_HEIGHT),
    });
  };
  fitToWindow();
  win.on('resize', fitToWindow);

  void view.webContents.loadURL(DEFAULT_URL);
  return view;
}
