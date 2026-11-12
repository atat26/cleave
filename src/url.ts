const SEARCH_URL = 'https://duckduckgo.com/?q=';

// Looks like a web address without a scheme: "example.com", "localhost:3000",
// "sub.site.org/path?x=1".
const HOST_LIKE = /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#].*)?$/i;

// The address of a web search for some text (always a search, never an address).
export function searchUrl(text: string): string {
  return SEARCH_URL + encodeURIComponent(text.trim());
}

// Turn whatever the user typed into a safe URL to load.
// - Normal http(s) addresses are used as they are.
// - Things that look like a host get "https://" added.
// - Everything else (including "javascript:..." or "file:...") becomes a search.
export function resolveInput(input: string): string {
  const text = input.trim();
  if (text === '') return '';

  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).toString();
    } catch {
      // Not a valid URL after all: fall through to a search.
    }
  } else if (HOST_LIKE.test(text)) {
    try {
      return new URL(`https://${text}`).toString();
    } catch {
      // Fall through to a search.
    }
  }

  return SEARCH_URL + encodeURIComponent(text);
}
