// Small pictures of the screenshots the assistant took, for the step row ("Kept for this session
// only"). They are kept in memory only, a limited number of them, and are gone when the app closes:
// they are never saved in the chat file, and the full screenshot is never kept at all. Pure code with
// no Electron (the shrinking itself is done in main), so it is easy to test.

// How many thumbnails are kept at once; the oldest goes first.
export const MAX_THUMBNAILS = 40;
// The width a thumbnail is shrunk to (twice what the step row shows, so it is sharp on a sharp screen).
export const THUMBNAIL_WIDTH = 168;
// A thumbnail longer than this (as text) is not kept: it is meant to be small.
export const MAX_THUMBNAIL_CHARS = 60_000;

// What a thumbnail is: a small JPEG as a data address, and nothing else.
export const isThumbnailUrl = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_THUMBNAIL_CHARS &&
  /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);

export const thumbnailKey = (
  chatId: number,
  messageId: number,
  partId: number,
): string => `${chatId}:${messageId}:${partId}`;

export function createThumbnailStore(max: number = MAX_THUMBNAILS) {
  const pictures = new Map<string, string>();
  return {
    // Keep a thumbnail (a value that is not a small JPEG is ignored). The oldest are dropped over `max`.
    set(key: string, url: unknown): void {
      if (!isThumbnailUrl(url)) return;
      pictures.delete(key);
      pictures.set(key, url);
      while (pictures.size > max) {
        const oldest = pictures.keys().next().value;
        if (oldest === undefined) break;
        pictures.delete(oldest);
      }
    },
    get: (key: string): string | null => pictures.get(key) ?? null,
    clear: (): void => pictures.clear(),
    size: (): number => pictures.size,
  };
}
