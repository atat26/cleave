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

export function readPageText(
  contents: WebContents,
  limitMs = DEFAULT_LIMIT_MS,
): Promise<PageText> {
  return withDebugger(contents, limitMs, async (debuggerApi) => {
    const tree = (await debuggerApi.sendCommand('Page.getFrameTree')) as {
      frameTree?: { frame?: { id?: unknown } };
    };
    const frameId = tree.frameTree?.frame?.id;
    if (typeof frameId !== 'string') throw new Error('no-frame');

    const world = (await debuggerApi.sendCommand('Page.createIsolatedWorld', {
      frameId,
      worldName: 'ai-browser-reader',
    })) as { executionContextId?: unknown };
    if (typeof world.executionContextId !== 'number') {
      throw new Error('no-world');
    }

    const evaluated = (await debuggerApi.sendCommand('Runtime.evaluate', {
      expression: READ_SCRIPT,
      contextId: world.executionContextId,
      returnByValue: true,
      timeout: 4000,
    })) as { result?: { value?: unknown } };
    const value = evaluated.result?.value;
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
  });
}

// The page's accessibility tree, as the browser reports it (untrusted; see
// pageOutline.ts for how it is turned into the outline). Main frame only.
export function readAccessibilityTree(
  contents: WebContents,
  limitMs = DEFAULT_LIMIT_MS,
): Promise<unknown[]> {
  return withDebugger(contents, limitMs, async (debuggerApi) => {
    await debuggerApi.sendCommand('Accessibility.enable');
    try {
      const result = (await debuggerApi.sendCommand(
        'Accessibility.getFullAXTree',
      )) as { nodes?: unknown };
      return Array.isArray(result.nodes) ? result.nodes : [];
    } finally {
      await debuggerApi
        .sendCommand('Accessibility.disable')
        .catch(() => undefined);
    }
  });
}
