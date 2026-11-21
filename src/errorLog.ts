// A record of unexpected errors in the main process, kept in the data folder ("errors.log"). Without
// this, an error nobody caught shows Electron's error dialog ("A JavaScript error occurred in the main
// process") in the installed app, which says nothing useful to the person using it and cannot be acted
// on. With it, the error is written down for whoever looks (the file is small and plain text), and the
// app carries on as it would have after pressing OK. Pure code, so it is tested; the part that is
// tied to Electron is errorGuard.ts.

export const MAX_LOG_CHARS = 100_000;
const MAX_ENTRY_CHARS = 2_000;
const MAX_STACK_LINES = 8;

// One entry: when, what kind, and the error with the top of its stack. Never throws, whatever it is given.
export function describeError(
  kind: string,
  error: unknown,
  now: number,
): string {
  let text: string;
  try {
    if (error instanceof Error) {
      const stack = (error.stack ?? '')
        .split('\n')
        .slice(0, MAX_STACK_LINES)
        .join('\n');
      text = stack.includes(error.message)
        ? stack
        : `${error.name}: ${error.message}\n${stack}`;
    } else {
      text = String(error);
    }
  } catch {
    text = '(an error that could not be described)';
  }
  const when = new Date(now).toISOString();
  return `[${when}] ${kind}\n${text.slice(0, MAX_ENTRY_CHARS)}\n\n`;
}

// Keep the newest part of the log when it grows past the limit, starting at a whole entry.
export function trimLog(text: string, max = MAX_LOG_CHARS): string {
  if (text.length <= max) return text;
  const tail = text.slice(text.length - max);
  const start = tail.indexOf('\n[');
  return start >= 0 ? tail.slice(start + 1) : tail;
}

// Is this the harmless "a window or page is already gone" error? (It still goes in the log.)
export const isDestroyedError = (error: unknown): boolean =>
  error instanceof Error && /Object has been destroyed/i.test(error.message);
