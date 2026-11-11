import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import { TOOLBAR_HEIGHT } from './layout';
import type { TabState } from './types';
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

  // Tell the toolbar UI whenever the tab's address or history changes.
  const history = view.webContents.navigationHistory;
  const sendState = () => {
    if (win.isDestroyed()) return;
    const state: TabState = {
      url: view.webContents.getURL(),
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    };
    win.webContents.send('tab:state', state);
  };
  view.webContents.on('did-navigate', sendState);
  view.webContents.on('did-navigate-in-page', sendState);
  // Also send it once the toolbar page itself has loaded, in case the tab
  // finished loading first.
  win.webContents.on('did-finish-load', sendState);

  // The toolbar asks us to do things. Only accept requests that come from our
  // own toolbar page.
  const fromToolbar = (event: Electron.IpcMainEvent) =>
    event.sender === win.webContents;

  const onNavigate = (event: Electron.IpcMainEvent, input: unknown) => {
    if (!fromToolbar(event) || typeof input !== 'string') return;
    const url = resolveInput(input);
    if (url !== '') void view.webContents.loadURL(url);
  };
  const onBack = (event: Electron.IpcMainEvent) => {
    if (fromToolbar(event) && history.canGoBack()) history.goBack();
  };
  const onForward = (event: Electron.IpcMainEvent) => {
    if (fromToolbar(event) && history.canGoForward()) history.goForward();
  };

  ipcMain.on('tab:navigate', onNavigate);
  ipcMain.on('tab:back', onBack);
  ipcMain.on('tab:forward', onForward);
  win.on('closed', () => {
    ipcMain.removeListener('tab:navigate', onNavigate);
    ipcMain.removeListener('tab:back', onBack);
    ipcMain.removeListener('tab:forward', onForward);
  });

  void view.webContents.loadURL(DEFAULT_URL);
  return view;
}
