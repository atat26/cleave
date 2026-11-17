// Reads a web page for the assistant (read-only): its visible text, or its
// accessibility tree (the list of controls).
//
// It attaches to the page with Electron's debugger, runs ONE fixed script in an
// isolated world, and detaches again. An isolated world is a separate JavaScript
// space that sees the same page but not the page's own scripts or any changes they
// made to built-in functions, so a page cannot tamper with how it is read. The
// script only reads: it never changes the page, clicks, or types.
//
// The text it returns is untrusted. The caller (agentTools.ts) cleans it, cuts it
// to size and marks it as data before the model sees it.
import type { WebContents } from 'electron';
import { findSensitiveFields } from './pageActions.ts';
import type { Cdp } from './pageActions.ts';

export interface PageText {
  title: string;
  url: string;
  text: string;
}

const READ_SCRIPT = `(() => {
  const body = document.body;
  const text = body ? body.innerText : '';
  return {
    title: String(document.title || ''),
    url: String(location.href || ''),
    text: String(text).slice(0, 100000),
  };
})()`;

// Finds a piece of text in the visible text of the page, collects a few pieces
// around it, and scrolls to the first match and selects it (so the user sees it too).
// The text to find is passed in as a JSON string literal, never as code.
const FIND_SCRIPT = (needle: string) => `((needle) => {
  const lower = needle.toLowerCase();
  const root = document.body;
  if (!root) return { count: 0, snippets: [], scrolled: false };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let count = 0;
  const snippets = [];
  let first = null;
  while (walker.nextNode() && count < 500) {
    const node = walker.currentNode;
    const text = node.nodeValue || '';
    const low = text.toLowerCase();
    let at = low.indexOf(lower);
    while (at >= 0 && count < 500) {
      count++;
      if (!first) first = { node, at };
      if (snippets.length < 8) {
        const from = Math.max(0, at - 60);
        const to = Math.min(text.length, at + needle.length + 60);
        snippets.push(text.slice(from, to).replace(/\\s+/g, ' ').trim());
      }
      at = low.indexOf(lower, at + lower.length);
    }
  }
  let scrolled = false;
  if (first) {
    try {
      const range = document.createRange();
      range.setStart(first.node, first.at);
      range.setEnd(first.node, first.at + needle.length);
      first.node.parentElement.scrollIntoView({ block: 'center', inline: 'nearest' });
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      scrolled = true;
    } catch (error) {
      scrolled = false;
    }
  }
  return { count, snippets, scrolled, title: String(document.title || ''), url: String(location.href || '') };
})(${JSON.stringify(needle)})`;

// The page's visible tables: a few of them, with a limited number of rows and columns.
const TABLES_SCRIPT = `(() => {
  const visible = (el) => {
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const all = Array.from(document.querySelectorAll('table')).filter(visible);
  const tables = all.slice(0, 10).map((table) => ({
    caption: table.caption ? String(table.caption.innerText).slice(0, 200) : '',
    totalRows: table.rows.length,
    rows: Array.from(table.rows).slice(0, 60).map((row) =>
      Array.from(row.cells).slice(0, 12).map((cell) => String(cell.innerText).replace(/\\s+/g, ' ').trim().slice(0, 200))
    ),
  }));
  return { tables, total: all.length, title: String(document.title || ''), url: String(location.href || '') };
})()`;

const DEFAULT_LIMIT_MS = 8000;

type Debugger = WebContents['debugger'];

// Attach to the page, run `work`, and always detach again, within a time limit.
async function withDebugger<T>(
  contents: WebContents,
  limitMs: number,
  work: (debuggerApi: Debugger) => Promise<T>,
): Promise<T> {
  const debuggerApi = contents.debugger;
  // Someone else is using the debugger on this page right now.
  if (debuggerApi.isAttached()) throw new Error('busy');
  debuggerApi.attach('1.3');

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const running = work(debuggerApi);
    // If the time runs out first, the work's late failure is ignored.
    running.catch(() => undefined);
    const limit = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), limitMs);
    });
    return await Promise.race([running, limit]);
  } finally {
    clearTimeout(timer);
    try {
      debuggerApi.detach();
    } catch {
      // Already detached (the page closed).
    }
  }
}

// Run `work` against a page with the debugger attached for just that long (an
// action: click, type, ...). Detaches again whatever happens.
export function withCdp<T>(
  contents: WebContents,
  limitMs: number,
  work: (cdp: Cdp) => Promise<T>,
): Promise<T> {
  return withDebugger(contents, limitMs, (debuggerApi) =>
    work({
      send: (method, params) => debuggerApi.sendCommand(method, params),
    }),
  );
}

// Run one fixed script in an isolated world of the page that `cdp` is attached to,
// and give back what it returned (untrusted data).
async function evaluateIsolated(
  cdp: Cdp,
  expression: string,
): Promise<unknown> {
  const tree = (await cdp.send('Page.getFrameTree')) as {
    frameTree?: { frame?: { id?: unknown } };
  };
  const frameId = tree.frameTree?.frame?.id;
  if (typeof frameId !== 'string') throw new Error('no-frame');

  const world = (await cdp.send('Page.createIsolatedWorld', {
    frameId,
    worldName: 'ai-browser-reader',
  })) as { executionContextId?: unknown };
  if (typeof world.executionContextId !== 'number') {
    throw new Error('no-world');
  }

  const evaluated = (await cdp.send('Runtime.evaluate', {
    expression,
    contextId: world.executionContextId,
    returnByValue: true,
    timeout: 4000,
  })) as { result?: { value?: unknown } };
  return evaluated.result?.value;
}

// Find text on the page (and scroll to the first match). See FIND_SCRIPT.
export async function findInPageVia(
  cdp: Cdp,
  needle: string,
): Promise<{
  count: number;
  snippets: string[];
  scrolled: boolean;
  title: string;
  url: string;
}> {
  const value = await evaluateIsolated(cdp, FIND_SCRIPT(needle));
  const v = value as Record<string, unknown> | null;
  if (
    typeof v !== 'object' ||
    v === null ||
    typeof v.count !== 'number' ||
    !Array.isArray(v.snippets)
  ) {
    throw new Error('unreadable');
  }
  return {
    count: v.count,
    snippets: v.snippets.filter((s): s is string => typeof s === 'string'),
    scrolled: v.scrolled === true,
    title: typeof v.title === 'string' ? v.title : '',
    url: typeof v.url === 'string' ? v.url : '',
  };
}

// The page's tables (see TABLES_SCRIPT).
export async function readTablesVia(cdp: Cdp): Promise<{
  tables: { caption: string; rows: string[][]; totalRows: number }[];
  total: number;
  title: string;
  url: string;
}> {
  const v = (await evaluateIsolated(cdp, TABLES_SCRIPT)) as Record<
    string,
    unknown
  > | null;
  if (typeof v !== 'object' || v === null || !Array.isArray(v.tables)) {
    throw new Error('unreadable');
  }
  const tables = v.tables.flatMap((t) => {
    const table = t as Record<string, unknown>;
    if (!Array.isArray(table.rows)) return [];
    return [
      {
        caption: typeof table.caption === 'string' ? table.caption : '',
        totalRows:
          typeof table.totalRows === 'number'
            ? table.totalRows
            : table.rows.length,
        rows: table.rows.map((row) =>
          Array.isArray(row)
            ? row.filter((cell): cell is string => typeof cell === 'string')
            : [],
        ),
      },
    ];
  });
  return {
    tables,
    total: typeof v.total === 'number' ? v.total : tables.length,
    title: typeof v.title === 'string' ? v.title : '',
    url: typeof v.url === 'string' ? v.url : '',
  };
}

// A picture of what the page shows (the visible part), as base64 JPEG bytes.
export async function captureScreenshotVia(cdp: Cdp): Promise<string> {
  const shot = (await cdp.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 80,
    fromSurface: true,
  })) as { data?: unknown };
  if (typeof shot.data !== 'string' || shot.data === '') {
    throw new Error('no-screenshot');
  }
  return shot.data;
}

// Read the text of the page that `cdp` is attached to (one fixed script, in an
// isolated world). Used with a debugger the caller has already attached.
export async function readPageTextVia(cdp: Cdp): Promise<PageText> {
  const value = await evaluateIsolated(cdp, READ_SCRIPT);
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PageText).text === 'string'
  ) {
    const page = value as PageText;
    return {
      title: typeof page.title === 'string' ? page.title : '',
      url: typeof page.url === 'string' ? page.url : '',
      text: page.text,
    };
  }
  throw new Error('unreadable');
}

export function readPageText(
  contents: WebContents,
  limitMs = DEFAULT_LIMIT_MS,
): Promise<PageText> {
  return withCdp(contents, limitMs, readPageTextVia);
}

// The page's accessibility tree, as the browser reports it (untrusted; see
// pageOutline.ts for how it is turned into the outline), plus which of its text
// fields are really password, card or code fields. Main frame only.
export function readAccessibilityTree(
  contents: WebContents,
  limitMs = DEFAULT_LIMIT_MS,
): Promise<{ nodes: unknown[]; sensitive: Set<number> }> {
  return withDebugger(contents, limitMs, async (debuggerApi) => {
    const cdp = {
      send: (m: string, p?: Record<string, unknown>) =>
        debuggerApi.sendCommand(m, p),
    };
    await debuggerApi.sendCommand('Accessibility.enable');
    try {
      const result = (await debuggerApi.sendCommand(
        'Accessibility.getFullAXTree',
      )) as { nodes?: unknown };
      const nodes = Array.isArray(result.nodes) ? result.nodes : [];
      const fieldIds = nodes.flatMap((n) => {
        const node = n as {
          role?: { value?: unknown };
          backendDOMNodeId?: unknown;
        };
        return typeof node?.backendDOMNodeId === 'number' &&
          typeof node.role?.value === 'string' &&
          ['textbox', 'searchbox', 'combobox', 'spinbutton'].includes(
            node.role.value,
          )
          ? [node.backendDOMNodeId]
          : [];
      });
      return { nodes, sensitive: await findSensitiveFields(cdp, fieldIds) };
    } finally {
      await debuggerApi
        .sendCommand('Accessibility.disable')
        .catch(() => undefined);
    }
  });
}
