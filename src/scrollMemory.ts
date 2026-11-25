// Where you had scrolled to in something, kept while its view is not on screen (a chat shrunk to its
// one-row bar, a PDF whose tab you left), so opening it again puts you back where you were reading
// (issues #138 and #137). Only a place that is not the start (or, for a chat, the end) is kept.
// Kept in memory only; a restart starts at the beginning (or the bottom, for a chat).
// Pure code, so it is tested.

export interface ScrollMemory {
  // Note where `id` is scrolled to. `at` is a distance (a chat) or a share of the whole (a PDF).
  remember(id: number, at: number, atEnd?: boolean): void;
  // The place to go back to, or null to start where it starts.
  recall(id: number): number | null;
  forget(id: number): void;
  size(): number;
  clear(): void;
}

// A memory of at most `max` places (the oldest go first, so it stays small however much is opened).
export function createScrollMemory(max = 200): ScrollMemory {
  const saved = new Map<number, number>();
  return {
    remember(id, at, atEnd = false) {
      saved.delete(id);
      if (atEnd || !Number.isFinite(at) || at <= 0) return;
      saved.set(id, at);
      while (saved.size > max) {
        const oldest = saved.keys().next().value;
        if (oldest === undefined) break;
        saved.delete(oldest);
      }
    },
    recall: (id) => saved.get(id) ?? null,
    forget: (id) => {
      saved.delete(id);
    },
    size: () => saved.size,
    clear: () => saved.clear(),
  };
}

// A chat: the distance in pixels from the top. A chat left at the bottom opens at the bottom.
export const chatScroll = createScrollMemory();
// An uploaded PDF (by its artifact number): how far down the whole document you were, 0 to 1.
export const fileScroll = createScrollMemory();
