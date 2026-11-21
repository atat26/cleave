// What a browser extension may do, judged by what its manifest declares (like Chrome does).
//
// The library that gives Cleave its extension support (electron-chrome-extensions) answers almost
// every request, and pushes events (cookie changes, tab addresses, navigation) to every extension,
// whether or not the extension asked for that kind of access. Two small hooks added at build time
// (see libraryPatches.ts) send every call and every event through the functions below first.
//
// Rules, in plain words:
//   - Cookies, notifications, context menus and navigation events need their permission in the
//     manifest. Cookies also need a website permission that covers the cookie's site.
//   - A tab's address, title and icon are only given to an extension with the "tabs" permission or a
//     website permission that covers that tab's address. Everything else about the tab is given.
//   - Tabs and windows can only be sent to http and https addresses (or the extension's own pages).
//   - A call the rules do not know is refused, so a library update that adds one cannot slip through.
// "Optional" permissions are not granted: Cleave never gives an extension extra permissions later.

type Manifest = Record<string, unknown> | undefined;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

const isHostPattern = (p: string): boolean =>
  p === '<all_urls>' || /^(\*|https?|wss?|ftp|file):\/\//.test(p);

export const apiPermissions = (manifest: Manifest): Set<string> =>
  new Set(strings(manifest?.permissions).filter((p) => !isHostPattern(p)));

// Website permissions: "host_permissions" (manifest 3) and the address-like entries of "permissions".
export const hostPatterns = (manifest: Manifest): string[] => [
  ...strings(manifest?.host_permissions),
  ...strings(manifest?.permissions).filter(isHostPattern),
];

const WEB_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);

const escapeRegExp = (text: string): string =>
  text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

// Does a website permission (a Chrome "match pattern") cover this address? Only web addresses ever match.
export function matchesHost(pattern: string, address: string): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (!WEB_SCHEMES.has(url.protocol)) return false;
  if (pattern === '<all_urls>') return true;
  const m = /^(\*|https?|wss?):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!m) return false;
  const [, scheme, host, path] = m;
  if (scheme === '*') {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  } else if (`${scheme}:` !== url.protocol) {
    return false;
  }
  if (host !== '*') {
    const name = url.hostname;
    if (host.startsWith('*.')) {
      const base = host.slice(2);
      if (name !== base && !name.endsWith(`.${base}`)) return false;
    } else if (name !== host.replace(/:\d+$/, '')) {
      return false;
    }
  }
  const glob = new RegExp(`^${path.split('*').map(escapeRegExp).join('.*')}$`);
  return glob.test(url.pathname + url.search);
}

const covers = (manifest: Manifest, address: string): boolean =>
  hostPatterns(manifest).some((p) => matchesHost(p, address));

// A pattern that covers every website.
const coversEverything = (manifest: Manifest): boolean =>
  hostPatterns(manifest).some(
    (p) => p === '<all_urls>' || /^(\*|https?):\/\/\*\/\*$/.test(p),
  );

// The address a cookie belongs to (Chrome judges access by it).
const cookieAddress = (cookie: unknown): string | null => {
  if (!isObject(cookie) || typeof cookie.domain !== 'string') return null;
  const path = typeof cookie.path === 'string' ? cookie.path : '/';
  const host = cookie.domain.replace(/^\./, '');
  return `${cookie.secure === true ? 'https' : 'http'}://${host}${path.startsWith('/') ? path : `/${path}`}`;
};

// May an extension send a tab or window to this address?
function isAllowedTarget(
  address: unknown,
  extensionId: string | undefined,
): boolean {
  if (typeof address !== 'string') return false;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') return true;
  if (address === 'about:blank') return true;
  return (
    url.protocol === 'chrome-extension:' &&
    extensionId !== undefined &&
    url.hostname === extensionId
  );
}

// ---- Calls ------------------------------------------------------------------------------------

// Calls the library answers, and what each needs. "open" = nothing more than being an extension.
const OPEN_CALLS = new Set([
  'crx',
  'commands.getAll',
  'permissions.contains',
  'permissions.getAll',
  'permissions.remove',
  'permissions.request',
  'runtime.openOptionsPage',
  'tabs.get',
  'tabs.getAllInWindow',
  'tabs.getCurrent',
  'tabs.goBack',
  'tabs.goForward',
  'tabs.reload',
  'tabs.remove',
  'windows.get',
  'windows.getAll',
  'windows.getCurrent',
  'windows.getLastFocused',
  'windows.remove',
]);

// The extension's own toolbar button (badge, title, popup, icon), and the observer calls Cleave's own
// toolbar makes: all of it is about the button, none of it about pages or sites.
const isButtonCall = (name: string): boolean =>
  name.startsWith('browserAction.');

// Native messaging is checked by the library itself (the "nativeMessaging" permission).
const NATIVE_CALLS = new Set([
  'runtime.connectNative',
  'runtime.disconnectNative',
  'runtime.sendNativeMessage',
]);

const NEEDS_PERMISSION: Record<string, string> = {
  'contextMenus.create': 'contextMenus',
  'contextMenus.remove': 'contextMenus',
  'contextMenus.removeAll': 'contextMenus',
  'cookies.getAllCookieStores': 'cookies',
  'notifications.clear': 'notifications',
  'notifications.create': 'notifications',
  'notifications.getAll': 'notifications',
  'notifications.getPermissionLevel': 'notifications',
  'notifications.update': 'notifications',
  'webNavigation.getAllFrames': 'webNavigation',
  'webNavigation.getFrame': 'webNavigation',
};

export const KNOWN_CALLS: readonly string[] = [
  ...OPEN_CALLS,
  ...NATIVE_CALLS,
  ...Object.keys(NEEDS_PERMISSION),
  'cookies.get',
  'cookies.getAll',
  'cookies.remove',
  'cookies.set',
  'tabs.create',
  'tabs.insertCSS',
  'tabs.query',
  'tabs.update',
  'windows.create',
  'windows.update',
];

const deny = (what: string): never => {
  throw new Error(
    `${what} is not allowed for this extension (it was not given that permission).`,
  );
};

// Throws if the extension may not make this call. `extensionId` is the extension making it.
export function checkCall(
  name: string,
  manifest: Manifest,
  args: unknown[],
  extensionId?: string,
): void {
  if (OPEN_CALLS.has(name) || NATIVE_CALLS.has(name) || isButtonCall(name))
    return;
  const permissions = apiPermissions(manifest);

  const needed = NEEDS_PERMISSION[name];
  if (needed !== undefined) {
    if (!permissions.has(needed)) deny(name);
    return;
  }

  switch (name) {
    case 'cookies.get':
    case 'cookies.set':
    case 'cookies.remove': {
      if (!permissions.has('cookies')) deny(name);
      const details = args[0];
      const address = isObject(details) ? details.url : undefined;
      if (typeof address !== 'string' || !covers(manifest, address)) {
        deny(`${name} for that site`);
      }
      return;
    }
    case 'cookies.getAll':
      // The list is cut down to the sites the extension covers afterwards (see filterResult).
      if (!permissions.has('cookies')) deny(name);
      if (hostPatterns(manifest).length === 0) deny(name);
      return;
    case 'tabs.query': {
      // Asking by address or title would show which pages are open.
      const query = args[0];
      if (isObject(query) && ('url' in query || 'title' in query)) {
        if (!permissions.has('tabs'))
          deny('searching tabs by address or title');
      }
      return;
    }
    case 'tabs.create': {
      const details = args[0];
      if (isObject(details) && details.url !== undefined) {
        if (!isAllowedTarget(details.url, extensionId))
          deny('opening that address');
      }
      return;
    }
    case 'tabs.update': {
      const props = isObject(args[0]) ? args[0] : args[1];
      if (isObject(props) && props.url !== undefined) {
        if (!isAllowedTarget(props.url, extensionId))
          deny('opening that address');
      }
      return;
    }
    case 'windows.create':
    case 'windows.update': {
      const details = name === 'windows.create' ? args[0] : args[1];
      if (isObject(details) && details.url !== undefined) {
        const urls = Array.isArray(details.url) ? details.url : [details.url];
        if (!urls.every((u) => isAllowedTarget(u, extensionId))) {
          deny('opening that address');
        }
      }
      return;
    }
    case 'tabs.insertCSS':
      // Changing a page needs a permission for that page; we cannot tell which page here, so only
      // an extension that covers every website (or declared activeTab) may.
      if (!coversEverything(manifest) && !permissions.has('activeTab'))
        deny(name);
      return;
    default:
      throw new Error(`${name} is not supported in Cleave.`);
  }
}

// ---- What is shown back ----------------------------------------------------------------------

const SENSITIVE_TAB_FIELDS = ['url', 'pendingUrl', 'title', 'favIconUrl'];

// A tab's address, title and icon only for an extension that may see them (see the top of the file).
function redactTabs(value: unknown, manifest: Manifest, depth = 0): unknown {
  if (Array.isArray(value))
    return value.map((v) => redactTabs(v, manifest, depth));
  if (!isObject(value) || depth > 3) return value;
  const copy: Record<string, unknown> = { ...value };
  const address =
    typeof copy.url === 'string'
      ? copy.url
      : typeof copy.pendingUrl === 'string'
        ? copy.pendingUrl
        : undefined;
  const granted = apiPermissions(manifest);
  // ("activeTab" is treated like "tabs" here: broader than Chrome, which allows it for one tab at a time, but it is a permission the extension had to declare.)
  const mayRead =
    granted.has('tabs') ||
    granted.has('activeTab') ||
    (address !== undefined && covers(manifest, address));
  if (!mayRead) for (const key of SENSITIVE_TAB_FIELDS) delete copy[key];
  if (Array.isArray(copy.tabs))
    copy.tabs = redactTabs(copy.tabs, manifest, depth + 1);
  return copy;
}

const REDACTED_CALLS = /^(tabs|windows)\./;

// The answer to a call, cut down to what the extension may see.
export function filterResult(
  name: string,
  manifest: Manifest,
  _args: unknown[],
  result: unknown,
): unknown {
  if (name === 'cookies.getAll') {
    return Array.isArray(result)
      ? result.filter((cookie) => {
          const address = cookieAddress(cookie);
          return address !== null && covers(manifest, address);
        })
      : result;
  }
  if (name.startsWith('webNavigation.')) {
    return redactFrames(result, manifest);
  }
  if (REDACTED_CALLS.test(name)) return redactTabs(result, manifest);
  return result;
}

// Frames from webNavigation: a frame's address only for a website the extension covers.
function redactFrames(value: unknown, manifest: Manifest): unknown {
  if (Array.isArray(value)) return value.map((v) => redactFrames(v, manifest));
  if (!isObject(value)) return value;
  const copy: Record<string, unknown> = { ...value };
  if (typeof copy.url === 'string' && !covers(manifest, copy.url))
    delete copy.url;
  return copy;
}

// ---- Events ----------------------------------------------------------------------------------

// What to send an extension for an event: the same arguments, a cut-down copy, or null for nothing.
export function filterEvent(
  name: string,
  manifest: Manifest,
  args: unknown[],
): unknown[] | null {
  if (name === 'cookies.onChanged') {
    if (!apiPermissions(manifest).has('cookies')) return null;
    const info = args[0];
    const address = isObject(info) ? cookieAddress(info.cookie) : null;
    return address !== null && covers(manifest, address) ? args : null;
  }
  if (name.startsWith('webNavigation.')) {
    if (!apiPermissions(manifest).has('webNavigation')) return null;
    const details = args[0];
    const address = isObject(details) ? details.url : undefined;
    return typeof address === 'string' && covers(manifest, address)
      ? args
      : null;
  }
  if (REDACTED_CALLS.test(name)) {
    return args.map((arg) => redactTabs(arg, manifest));
  }
  // notifications.*, contextMenus.onClicked, browserAction.onClicked: sent to the extension they
  // belong to, because the person used it.
  if (
    name.startsWith('notifications.') ||
    name === 'contextMenus.onClicked' ||
    name === 'browserAction.onClicked'
  ) {
    return args;
  }
  return null;
}

// What the build step's hooks call (they find it on globalThis, because the library is bundled
// into the app's main file).
export const extensionGate = {
  before: (name: string, manifest: Manifest, args: unknown[], id?: string) =>
    checkCall(name, manifest, args, id),
  after: (name: string, manifest: Manifest, args: unknown[], result: unknown) =>
    filterResult(name, manifest, args, result),
  event: (name: string, manifest: Manifest, args: unknown[]) =>
    filterEvent(name, manifest, args),
};

export const GATE_GLOBAL = '__cleaveExtensionGate';
