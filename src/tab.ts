import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import { TOOLBAR_HEIGHT } from './layout';
import { resolveInput } from './url';

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

  // Tell the toolbar UI whenever the tab's address changes.
  const sendUrl = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('tab:url', view.webContents.getURL());
    }
  };
  view.webContents.on('did-navigate', sendUrl);
  view.webContents.on('did-navigate-in-page', sendUrl);
  // Also send it once the toolbar page itself has loaded, in case the tab
  // finished loading first.
  win.webContents.on('did-finish-load', sendUrl);

  // The address bar asks us to load something. Only accept requests that come
  // from our own toolbar page, and only strings.
  const onNavigate = (event: Electron.IpcMainEvent, input: unknown) => {
    if (event.sender !== win.webContents || typeof input !== 'string') return;
    const url = resolveInput(input);
    if (url !== '') void view.webContents.loadURL(url);
  };
  ipcMain.on('tab:navigate', onNavigate);
  win.on('closed', () => ipcMain.removeListener('tab:navigate', onNavigate));

  void view.webContents.loadURL(DEFAULT_URL);
  return view;
}
