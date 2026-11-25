// Where you had scrolled to in each chat, kept while the chat's message list is not on screen (the
// chat is shrunk to its one-row bar, or you are in another chat), so opening it again puts you back
// where you were reading (issue #138). Only a chat that was scrolled up is remembered: one that was at
// the bottom opens at the bottom, as always. Kept in memory only; a restart starts at the bottom.
// Pure code, so it is tested.

const MAX_CHATS = 200;
const saved = new Map<number, number>();

// Note where a chat is scrolled to (`top` is the distance from the top of the conversation).
export function rememberScroll(
  chatId: number,
  top: number,
  atBottom: boolean,
): void {
  saved.delete(chatId);
  if (atBottom || !Number.isFinite(top) || top <= 0) return;
  saved.set(chatId, Math.round(top));
  // The oldest notes go first, so the map stays small however many chats are opened.
  while (saved.size > MAX_CHATS) {
    const oldest = saved.keys().next().value;
    if (oldest === undefined) break;
    saved.delete(oldest);
  }
}

// The distance from the top to scroll to, or null to start at the bottom.
export const recallScroll = (chatId: number): number | null =>
  saved.get(chatId) ?? null;

export const forgetScroll = (chatId: number): void => {
  saved.delete(chatId);
};

// For tests.
export const clearScrollMemory = (): void => saved.clear();
export const scrollMemorySize = (): number => saved.size;
