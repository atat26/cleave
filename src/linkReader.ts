// Reads the text of a web page for the assistant WITHOUT opening a tab or leaving the
// page you are on. The page is loaded in a hidden window that is locked down:
//
//   - It is private. The window uses its own throwaway browser session (nothing from
//     your logins, cookies or saved data goes in, and nothing is kept afterwards), so
//     a page is read the way an anonymous visitor would see it.
//   - It stays off your own network. Every address is checked: the first one, every
//     redirect, and every file the page asks for. Names are looked up first and must
//     point to public internet addresses; and the address a server actually answered
//     from is checked again afterwards, so a name that secretly points inside your
//     network is caught and its content thrown away.
//   - It is quiet. Images, video, fonts and similar are not loaded, pop-ups and
//     downloads are refused, permission requests (camera, location...) are refused,
//     and JavaScript dialogs are dismissed.
//   - It is limited. One page at a time, a time limit, and it is closed afterwards.
//
// Whatever it reads is untrusted text; agentTools.ts cleans it, cuts it to size and
// marks it as data before the assistant sees it.
import { BrowserWindow, session } from 'electron';
import { checkPublicAddress, isPublicIp } from './addressSafety.ts';
import type { AddressCheck } from './addressSafety.ts';
import { readPageTextVia } from './pageReader.ts';
import type { PageText } from './pageReader.ts';

export type LinkRead =
  | { ok: true; title: string; url: string; text: string }
  | { ok: false; reason: 'blocked' | 'timeout' | 'unavailable' };

// What can be changed, for tests. The defaults are the strict rules.
export interface LinkReaderOptions {
  checkAddress?: (raw: string) => AddressCheck;
  isAllowedIp?: (ip: string) => boolean;
  // Look names up before the request (on by default). A test turns it off to check
  // the second line of defence on its own.
  lookUpFirst?: boolean;
  loadLimitMs?: number;
  settleMs?: number;
}

const PARTITION = 'read-link'; // no "persist:" in front: kept in memory only
const LOAD_LIMIT_MS = 15_000;
const SETTLE_MS = 800;

// Kinds of request that are never made (they only slow things down or track).
const NEVER_LOADED = new Set([
  'image',
  'media',
  'font',
  'webSocket',
  'ping',
  'cspReport',
  'object',
]);

// One page at a time.
let queue: Promise<unknown> = Promise.resolve();

interface ReadState {
  // The page itself was refused (a private address, at the start or by redirect).
  blocked: boolean;
  // Something answered from a private address.
  leaked: boolean;
  // Names already looked up during this read.
  looked: Map<string, boolean>;
  options: Required<LinkReaderOptions>;
}

let current: ReadState | null = null;
let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (event) => event.preventDefault());

  ses.webRequest.onBeforeRequest((details, callback) => {
    const state = current;
    const cancel = () => callback({ cancel: true });
    if (state === null) return cancel();
    const isPage = details.resourceType === 'mainFrame';

    let url: URL;
    try {
      url = new URL(details.url);
    } catch {
      return cancel();
    }
    // Inline content a page makes for itself is fine; nothing else but web addresses.
    if (url.protocol === 'data:' || url.protocol === 'blob:') {
      return NEVER_LOADED.has(details.resourceType) ? cancel() : callback({});
    }
    if (NEVER_LOADED.has(details.resourceType)) return cancel();

    const checked = state.options.checkAddress(details.url);
    if (!checked.ok) {
      if (isPage) state.blocked = true;
      return cancel();
    }
    if (!state.options.lookUpFirst) return callback({});

    // The name must point to public addresses only.
    const host = checked.url.hostname;
    const known = state.looked.get(host);
    if (known !== undefined) {
      if (!known && isPage) state.blocked = true;
      return known ? callback({}) : cancel();
    }
    session
      .fromPartition(PARTITION)
      .resolveHost(host)
      .then((resolved) => {
        const addresses = resolved.endpoints.map((e) => e.address);
        const allowed =
          addresses.length > 0 &&
          addresses.every((a) => state.options.isAllowedIp(a));
        state.looked.set(host, allowed);
        if (!allowed && isPage) state.blocked = true;
        if (allowed) callback({});
        else cancel();
      })
      .catch(() => {
        state.looked.set(host, false);
        if (isPage) state.blocked = true;
        cancel();
      });
  });
}

function strict(options: LinkReaderOptions): Required<LinkReaderOptions> {
  return {
    checkAddress: options.checkAddress ?? checkPublicAddress,
    isAllowedIp: options.isAllowedIp ?? isPublicIp,
    lookUpFirst: options.lookUpFirst ?? true,
    loadLimitMs: options.loadLimitMs ?? LOAD_LIMIT_MS,
    settleMs: options.settleMs ?? SETTLE_MS,
  };
}

async function readOnce(
  address: string,
  signal: AbortSignal,
  options: Required<LinkReaderOptions>,
): Promise<LinkRead> {
  const first = options.checkAddress(address);
  if (!first.ok) return { ok: false, reason: 'blocked' };
  if (signal.aborted) return { ok: false, reason: 'unavailable' };

  configure();
  const state: ReadState = {
    blocked: false,
    leaked: false,
    looked: new Map(),
    options,
  };
  current = state;

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      // A page's alert() or confirm() would wait for someone to click it, in a window
      // nobody can see: refuse them all.
      disableDialogs: true,
    },
  });
  const contents = win.webContents;
  contents.setAudioMuted(true);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // A redirect to somewhere not allowed is stopped as it happens.
  contents.on('will-redirect', (event, redirectUrl) => {
    if (!options.checkAddress(redirectUrl).ok) {
      state.blocked = true;
      event.preventDefault();
    }
  });

  const debuggerApi = contents.debugger;
  try {
    // A window that has never shown anything has no page process yet, so give it a
    // blank page first; only then can the debugger talk to it.
    await contents.loadURL('about:blank');
    debuggerApi.attach('1.3');
    // JavaScript dialogs (alert, confirm...) would wait for someone to click them:
    // dismiss them.
    debuggerApi.on('message', (_event, method, params: unknown) => {
      if (method === 'Page.javascriptDialogOpening') {
        void debuggerApi
          .sendCommand('Page.handleJavaScriptDialog', { accept: false })
          .catch(() => undefined);
      }
      // The address a server REALLY answered from, checked as each answer arrives
      // (this catches a name that points somewhere private after all).
      if (method === 'Network.responseReceived') {
        const response = (
          params as { response?: { remoteIPAddress?: unknown } }
        )?.response;
        const ip = response?.remoteIPAddress;
        if (typeof ip === 'string' && !options.isAllowedIp(ip)) {
          state.leaked = true;
          state.blocked = true;
        }
      }
    });
    await debuggerApi.sendCommand('Page.enable');
    await debuggerApi.sendCommand('Network.enable');

    // Load, and wait until it finishes, fails, is stopped, or runs out of time.
    const loaded = await new Promise<'done' | 'failed' | 'timeout' | 'stopped'>(
      (resolve) => {
        const finish = (outcome: 'done' | 'failed' | 'timeout' | 'stopped') => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          contents.removeListener('did-finish-load', onDone);
          contents.removeListener('did-fail-load', onFail);
          resolve(outcome);
        };
        const onDone = () => finish('done');
        const onFail = (
          _event: unknown,
          _code: number,
          _description: string,
          _url: string,
          isMainFrame: boolean,
        ) => {
          if (isMainFrame) finish('failed');
        };
        const onAbort = () => finish('stopped');
        const timer = setTimeout(() => finish('timeout'), options.loadLimitMs);
        contents.on('did-finish-load', onDone);
        contents.on('did-fail-load', onFail);
        signal.addEventListener('abort', onAbort);
        void contents.loadURL(address).catch(() => undefined);
      },
    );

    if (state.blocked) return { ok: false, reason: 'blocked' };
    if (loaded === 'timeout') return { ok: false, reason: 'timeout' };
    if (loaded !== 'done') return { ok: false, reason: 'unavailable' };

    // Give a page that builds itself with JavaScript a moment to do so.
    await new Promise((resolve) => setTimeout(resolve, options.settleMs));
    if (state.blocked || state.leaked) return { ok: false, reason: 'blocked' };

    const page: PageText = await readPageTextVia({
      send: (method, params) => debuggerApi.sendCommand(method, params),
    });
    // Where it really ended up must also be an allowed address.
    const finalUrl = contents.getURL();
    if (!options.checkAddress(finalUrl).ok || state.blocked || state.leaked) {
      return { ok: false, reason: 'blocked' };
    }
    return { ok: true, title: page.title, url: finalUrl, text: page.text };
  } catch {
    return { ok: false, reason: state.blocked ? 'blocked' : 'unavailable' };
  } finally {
    current = null;
    try {
      if (debuggerApi.isAttached()) debuggerApi.detach();
    } catch {
      // Already gone.
    }
    if (!win.isDestroyed()) win.destroy();
    // Nothing is kept: cookies, storage and cache are wiped.
    const ses = session.fromPartition(PARTITION);
    await ses.clearStorageData().catch(() => undefined);
    await ses.clearCache().catch(() => undefined);
  }
}

// Read a page, one at a time (a second request waits for the first to finish).
export function readLinkText(
  address: string,
  signal: AbortSignal,
  options: LinkReaderOptions = {},
): Promise<LinkRead> {
  const settings = strict(options);
  const run = queue.then(() => readOnce(address, signal, settings));
  queue = run.catch(() => undefined);
  return run;
}
