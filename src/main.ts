// Must come first: it picks the data folder (installed app or development copy).
import './useDataFolder';
import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  CONTROLS_SYMBOL,
  CONTROLS_SYMBOL_DARK,
  FRAME_COLOR,
  FRAME_COLOR_DARK,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  TOOLBAR_HEIGHT,
} from './layout';
import { registerAppInfo } from './appInfo';
import { registerUpdates } from './updater';
import { openSecretStore } from './electronSecrets';
import { registerLlm } from './llm';
import { registerSearch } from './search';
import { createTabs } from './tabs';
import { guardPreviewFrames } from './previewGuard';
import { loadUi } from './ui';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const dark = nativeTheme.shouldUseDarkColors;
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // Never so small that the frame's panels leave no room for the page.
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    // The frame's colour, so there is no white flash before the UI paints.
    backgroundColor: dark ? FRAME_COLOR_DARK : FRAME_COLOR,
    // No title bar and no menu bar: the toolbar is the top of the window. Windows
    // still draws its own minimize / maximize / close buttons over the top right
    // (so snapping and the maximize pop-up keep working), in the theme's colours.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: dark ? FRAME_COLOR_DARK : FRAME_COLOR,
      symbolColor: dark ? CONTROLS_SYMBOL_DARK : CONTROLS_SYMBOL,
      height: TOOLBAR_HEIGHT,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // Security: the UI page is isolated from Node.js and from Electron
      // internals. It can only use what preload.ts exposes via contextBridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The name Windows shows on the taskbar. A copy started from the project folder says so, to tell it
  // apart from the installed app.
  const windowTitle = app.isPackaged ? 'Cleave' : 'Cleave (development copy)';
  mainWindow.setTitle(windowTitle);
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(windowTitle);
  });

  // Security: our own UI window never opens new windows or navigates away.
  // (Websites will live in their own tab views, added later in M1.)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  // HTML artifacts run scripts in a frame inside this window: it may go nowhere.
  guardPreviewFrames(mainWindow);

  // Load the app's UI page (the toolbar).
  void loadUi(mainWindow.webContents);

  // The update button in Settings > About (looks for an update only when pressed).
  registerUpdates(mainWindow);

  // The AI provider connection (key storage, model choice, network calls).
  // One shared store of secrets (API keys) for the AI connection and web search.
  const secrets = openSecretStore();
  const llm = registerLlm(mainWindow, secrets);
  llm.catch((error) =>
    console.error('Failed to start the AI connection:', error),
  );

  // Web search (provider choice, key, the search itself).
  const search = registerSearch(mainWindow, secrets);
  search.catch((error) => console.error('Failed to start web search:', error));

  // The sidebar, the web page tabs and the chat.
  createTabs(mainWindow, llm, search).catch((error) =>
    console.error('Failed to start tabs:', error),
  );

  // Open the DevTools only while developing, never in a packaged app.
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // No menu bar (our own right-click menus and shortcuts replace it).
  Menu.setApplicationMenu(null);
  registerAppInfo();
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
