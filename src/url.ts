import { DEFAULT_ENGINE, fillTemplate } from './searchEngine.ts';

// Looks like a web address without a scheme: "example.com", "localhost:3000",
// "sub.site.org/path?x=1".
const HOST_LIKE = /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#].*)?$/i;

// The address of a web search for some text (always a search, never an address),
// with the search engine's template (the default engine if none is given).
export function searchUrl(
  text: string,
  template: string = DEFAULT_ENGINE.template,
): string {
  return fillTemplate(template, text.trim());
}

// What was typed as an address to load, or null if it is not one (it is a search).
function typedAddress(text: string): string | null {
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).toString();
    } catch {
      // Not a valid URL after all: a search.
    }
  } else if (HOST_LIKE.test(text)) {
    try {
      return new URL(`https://${text}`).toString();
    } catch {
      // A search.
    }
  }
  return null;
}

// Does what was typed look like an address (not a search)?
export function looksLikeAddress(input: string): boolean {
  const text = input.trim();
  return text !== '' && typedAddress(text) !== null;
}

// Turn whatever the user typed into a safe URL to load.
// - Normal http(s) addresses are used as they are.
// - Things that look like a host get "https://" added.
// - Everything else (including "javascript:..." or "file:...") becomes a search
//   with the chosen search engine.
export function resolveInput(
  input: string,
  template: string = DEFAULT_ENGINE.template,
): string {
  const text = input.trim();
  if (text === '') return '';
  return typedAddress(text) ?? fillTemplate(template, text);
}
