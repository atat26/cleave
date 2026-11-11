import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import { SIDEBAR_WIDTH, TOOLBAR_HEIGHT } from './layout';
import type { TabsState } from './types';
import { resolveInput } from './url';

// What a new tab shows. Later this could become an AI chat / search page.
export const NEW_TAB_URL = 'https://duckduckgo.com';

interface Tab {
  id: number;
  view: WebContentsView;
  favicon: string | null;
}

const isWebUrl = (url: string) => /^https?:\/\//i.test(url);
const isId = (value: unknown): value is number => Number.isInteger(value);

// Manage all the web page tabs of one window: create, close, switch, keep them
// sized to the window, and tell the toolbar/sidebar UI what changed.
export function createTabs(win: BrowserWindow): void {
  const tabs: Tab[] = [];
  let activeId = -1;
  let nextId = 1;

  const activeTab = () => tabs.find((tab) => tab.id === activeId);

  const sendState = () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return;
    const history = activeTab()?.view.webContents.navigationHistory;
    const state: TabsState = {
      tabs: tabs.map((tab) => ({
        id: tab.id,
        title: tab.view.webContents.getTitle(),
        url: tab.view.webContents.getURL(),
        favicon: tab.favicon,
      })),
      activeId,
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
    };
    win.webContents.send('tabs:state', state);
  };

  // Every tab's view gets the same area: right of the sidebar, below the toolbar.
  const fitToWindow = () => {
    const [width, height] = win.getContentSize();
    const bounds = {
      x: SIDEBAR_WIDTH,
      y: TOOLBAR_HEIGHT,
      width: Math.max(0, width - SIDEBAR_WIDTH),
      height: Math.max(0, height - TOOLBAR_HEIGHT),
    };
    for (const tab of tabs) tab.view.setBounds(bounds);
  };

  const switchTo = (id: number) => {
    const target = tabs.find((tab) => tab.id === id);
    if (!target) return;
    activeId = id;
    // Only the active tab's view is visible; the others keep running hidden.
    for (const tab of tabs) tab.view.setVisible(tab.id === id);
    fitToWindow();
    target.view.webContents.focus();
    sendState();
  };

  // Keyboard shortcuts: Ctrl+T new tab, Ctrl+W close, Ctrl+Tab / Ctrl+Shift+Tab
  // next / previous. Attached to the toolbar page and to every web page.
  const handleShortcut = (
    event: { preventDefault: () => void },
    input: Electron.Input,
  ) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta)
      return;
    const key = input.key.toLowerCase();
    if (key === 't') {
      event.preventDefault();
      addTab(NEW_TAB_URL);
    } else if (key === 'w') {
      event.preventDefault();
      closeTab(activeId);
    } else if (key === 'tab') {
      event.preventDefault();
      const index = tabs.findIndex((tab) => tab.id === activeId);
      const step = input.shift ? -1 : 1;
      const next = tabs[(index + step + tabs.length) % tabs.length];
      if (next) switchTo(next.id);
    }
  };

  const addTab = (url: string) => {
    const view = new WebContentsView({
      // Web content is untrusted: no Node.js, no preload bridge, fully sandboxed.
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const tab: Tab = { id: nextId++, view, favicon: null };
    tabs.push(tab);
    win.contentView.addChildView(view);

    const contents = view.webContents;
    // Links that want a new window (target="_blank") open as a new tab.
    // Only normal web addresses are allowed.
    contents.setWindowOpenHandler(({ url: linkUrl }) => {
      if (isWebUrl(linkUrl)) addTab(linkUrl);
      return { action: 'deny' };
    });
    contents.on('before-input-event', handleShortcut);
    contents.on('page-title-updated', sendState);
    contents.on('page-favicon-updated', (_event, favicons) => {
      tab.favicon = favicons.find(isWebUrl) ?? null;
      sendState();
    });
    contents.on('did-navigate', () => {
      tab.favicon = null; // The new page will report its own icon.
      sendState();
    });
    contents.on('did-navigate-in-page', sendState);

    switchTo(tab.id);
    void contents.loadURL(url);
  };

  const closeTab = (id: number) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const [closed] = tabs.splice(index, 1);
    win.contentView.removeChildView(closed.view);
    closed.view.webContents.close();

    if (tabs.length === 0) {
      addTab(NEW_TAB_URL); // The window is never left without a tab.
    } else if (id === activeId) {
      switchTo(tabs[Math.min(index, tabs.length - 1)].id);
    } else {
      sendState();
    }
  };

  // Requests from the toolbar/sidebar. We only accept messages that come from
  // our own UI page, and we check the type of everything they send.
  const requests: Record<string, (...args: unknown[]) => void> = {
    'tab:navigate': (input) => {
      if (typeof input !== 'string') return;
      const url = resolveInput(input);
      if (url !== '') void activeTab()?.view.webContents.loadURL(url);
    },
    'tab:back': () => {
      const history = activeTab()?.view.webContents.navigationHistory;
      if (history?.canGoBack()) history.goBack();
    },
    'tab:forward': () => {
      const history = activeTab()?.view.webContents.navigationHistory;
      if (history?.canGoForward()) history.goForward();
    },
    'tab:new': () => addTab(NEW_TAB_URL),
    'tab:close': (id) => {
      if (isId(id)) closeTab(id);
    },
    'tab:switch': (id) => {
      if (isId(id)) switchTo(id);
    },
  };
  const listeners = Object.entries(requests).map(([channel, handle]) => {
    const listener = (event: Electron.IpcMainEvent, ...args: unknown[]) => {
      if (event.sender === win.webContents) handle(...args);
    };
    ipcMain.on(channel, listener);
    return { channel, listener };
  });
  win.on('closed', () => {
    for (const { channel, listener } of listeners)
      ipcMain.removeListener(channel, listener);
  });

  win.on('resize', fitToWindow);
  win.webContents.on('before-input-event', handleShortcut);
  // Send the first state once the UI page is ready to listen.
  win.webContents.on('did-finish-load', sendState);

  addTab(NEW_TAB_URL);
}
