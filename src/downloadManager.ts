// Downloads, in the main process: catches what a web page downloads, saves it to
// the folder you chose under a safe file name, follows its progress, and keeps the
// list. The rules (names, the list, settings) are pure code in downloadName.ts,
// downloadList.ts and downloadSettings.ts; this file only connects them to
// Electron.
//
// Safety:
//   - A page never chooses where a file goes or what it is called: the name is
//     cleaned, and the file always lands in your download folder.
//   - A page that starts several downloads at once is blocked after a few.
//   - Nothing is ever opened automatically; opening a program or script asks first.
import { app, shell } from 'electron';
import type {
  DownloadItem as ElectronItem,
  Session,
  WebContents,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { cleanFileName, isRiskyFile, uniqueName } from './downloadName';
import {
  addDownload,
  floodCheck,
  removeDownload,
  updateDownload,
} from './downloadList';
import type { DownloadsState } from './downloadList';
import type { DownloadSettings } from './downloadSettings';
import { historyUrl } from './history';

// How often a download in progress may update the list (it can change many times a
// second).
const PROGRESS_MS = 250;

export interface DownloadManagerDeps {
  session: Session;
  getSettings(): DownloadSettings;
  getList(): DownloadsState;
  setList(next: DownloadsState): void;
  // Is this one of the app's web pages (and not one of its own screens)?
  isPage(contents: WebContents | undefined): boolean;
  // Show the system's save window for a file and return the place you picked (or
  // null if you cancelled).
  chooseSavePath(defaultPath: string): Promise<string | null>;
  // Ask a yes/no question in a native window.
  confirm(options: {
    title: string;
    message: string;
    detail: string;
    button: string;
  }): Promise<boolean>;
}

// The folder downloads go into: the one you chose, or the computer's Downloads
// folder (made if it is missing).
function downloadFolder(settings: DownloadSettings): string {
  const wanted = settings.folder ?? app.getPath('downloads');
  try {
    fs.mkdirSync(wanted, { recursive: true });
    return wanted;
  } catch {
    return app.getPath('downloads');
  }
}

export function registerDownloads(deps: DownloadManagerDeps) {
  // The downloads going on now, by their number in the list.
  const live = new Map<number, ElectronItem>();
  // When each page started its recent downloads (see floodCheck).
  const starts = new Map<number, number[]>();
  // Addresses you asked to "Save … as…": their downloads always show the save window.
  const askFor = new Map<string, number>();
  const ASK_MS = 15_000;

  const change = (
    id: number,
    changes: Parameters<typeof updateDownload>[2],
  ) => {
    deps.setList(updateDownload(deps.getList(), id, changes, Date.now()));
  };

  const onWillDownload = (
    event: Electron.Event,
    item: ElectronItem,
    contents?: WebContents,
  ) => {
    // Only the app's web pages can download; its own screens never do.
    if (!deps.isPage(contents) || !contents) {
      event.preventDefault();
      return;
    }
    const settings = deps.getSettings();
    const name = cleanFileName(item.getFilename());
    const source = historyUrl(item.getURL()) ?? '';

    // Too many at once from one page: note it and stop it.
    const check = floodCheck(starts.get(contents.id) ?? [], Date.now());
    starts.set(contents.id, check.starts);
    if (!check.allowed) {
      event.preventDefault();
      deps.setList(
        addDownload(
          deps.getList(),
          { url: source, name, path: '', totalBytes: 0, state: 'blocked' },
          Date.now(),
        ).state,
      );
      return;
    }

    const folder = downloadFolder(settings);
    const target = path.join(
      folder,
      uniqueName(name, (candidate) =>
        fs.existsSync(path.join(folder, candidate)),
      ),
    );
    // You chose "Save … as…" for this one: the save window always shows.
    const asked = item.getURLChain().some((url) => askFor.delete(url));
    const askNow = settings.askWhere || asked;
    if (askNow) {
      // No path set: Electron shows its save window, starting at the same place.
      item.setSaveDialogOptions({ defaultPath: target });
    } else {
      // Belt and braces: it must be directly inside the folder.
      if (path.dirname(path.resolve(target)) !== path.resolve(folder)) {
        event.preventDefault();
        return;
      }
      item.setSavePath(target);
    }

    const added = addDownload(
      deps.getList(),
      {
        url: source,
        name,
        path: askNow ? '' : target,
        totalBytes: item.getTotalBytes(),
        state: 'downloading',
      },
      Date.now(),
    );
    deps.setList(added.state);
    const id = added.id;
    live.set(id, item);

    let lastUpdate = 0;
    item.on('updated', (_event, state) => {
      const now = Date.now();
      if (state !== 'interrupted' && now - lastUpdate < PROGRESS_MS) return;
      lastUpdate = now;
      change(id, {
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state:
          state === 'interrupted'
            ? 'failed'
            : item.isPaused()
              ? 'paused'
              : 'downloading',
        ...(item.getSavePath() !== '' ? { path: item.getSavePath() } : {}),
      });
    });
    item.once('done', (_event, state) => {
      live.delete(id);
      change(id, {
        state:
          state === 'completed'
            ? 'done'
            : state === 'cancelled'
              ? 'cancelled'
              : 'failed',
        receivedBytes:
          state === 'completed'
            ? item.getTotalBytes()
            : item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        // The place and the name you picked in the save window, if it asked.
        ...(item.getSavePath() !== ''
          ? {
              path: item.getSavePath(),
              name: path.basename(item.getSavePath()),
            }
          : {}),
      });
    });
  };
  deps.session.on('will-download', onWillDownload);

  return {
    // "Save link as…" / "Save image as…": download this address, always through the
    // save window. Only ordinary web addresses are taken.
    saveUrl(contents: WebContents, url: string) {
      if (!deps.isPage(contents) || !/^https?:\/\//i.test(url)) return;
      const now = Date.now();
      for (const [key, when] of askFor) {
        if (now - when > ASK_MS) askFor.delete(key);
      }
      askFor.set(url, now);
      contents.downloadURL(url);
    },
    // "Save page as…": the whole page (its pictures and styles go in a folder next to
    // it) to the place you pick, and it shows in the Downloads list.
    async savePage(contents: WebContents) {
      if (!deps.isPage(contents)) return;
      const source = historyUrl(contents.getURL());
      if (source === null) return;
      const name = cleanFileName(contents.getTitle() || 'page').replace(
        /\.(?:html?|php|aspx?)$/i,
        '',
      );
      const picked = await deps.chooseSavePath(
        path.join(downloadFolder(deps.getSettings()), `${name}.html`),
      );
      if (picked === null || !path.isAbsolute(picked)) return;
      const added = addDownload(
        deps.getList(),
        {
          url: source,
          name: path.basename(picked),
          path: picked,
          totalBytes: 0,
          state: 'downloading',
        },
        Date.now(),
      );
      deps.setList(added.state);
      try {
        await contents.savePage(picked, 'HTMLComplete');
        const size = fs.statSync(picked).size;
        change(added.id, {
          state: 'done',
          receivedBytes: size,
          totalBytes: size,
        });
      } catch {
        change(added.id, { state: 'failed' });
      }
    },
    pause: (id: number) => live.get(id)?.pause(),
    resume: (id: number) => {
      const item = live.get(id);
      if (item?.canResume()) item.resume();
    },
    cancel: (id: number) => live.get(id)?.cancel(),
    // Open a finished download with the program Windows uses for it. A program or
    // script asks first.
    async open(id: number) {
      const found = deps.getList().items.find((i) => i.id === id);
      if (!found || found.state !== 'done' || found.path === '') return;
      if (!fs.existsSync(found.path)) {
        change(id, { state: 'failed' });
        return;
      }
      if (
        isRiskyFile(found.name) &&
        !(await deps.confirm({
          title: 'Open this file?',
          message: `Open “${found.name}”?`,
          detail:
            'This type of file can run a program on your computer. Only open it if you trust where it came from.',
          button: 'Open anyway',
        }))
      ) {
        return;
      }
      void shell.openPath(found.path);
    },
    showInFolder(id: number) {
      const found = deps.getList().items.find((i) => i.id === id);
      if (found && found.path !== '' && fs.existsSync(found.path)) {
        shell.showItemInFolder(found.path);
      }
    },
    // Take it off the list (the file stays where it is). A download still going is
    // stopped first.
    remove(id: number) {
      live.get(id)?.cancel();
      deps.setList(removeDownload(deps.getList(), id));
    },
    dispose() {
      deps.session.removeListener('will-download', onWillDownload);
    },
  };
}
