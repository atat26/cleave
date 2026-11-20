// A forgiving search, for the assistant only. Your own history and bookmark searches (history.ts,
// bookmarks.ts) stay strict: every word you type must be in the page. The assistant, asked a question
// like "what did I read about graphics cards last week?", used to try 5 to 8 variations of the words
// because one word of its question ("week") was never in a title. This search:
//   - leaves out filler words that are about the question and never in a page ("last", "week", "read");
//   - matches a page when MOST of the remaining words are in its title or address (all of them when
//     there are one or two), and puts the pages matching more words first, newest first among equals;
//   - can be limited to the last N days.
// Pure code with no Electron, so it is easy to test.

// Words in a question about your history that say nothing about the page. (Only dropped when some
// other word is left: a search made only of these keeps them.)
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'and',
  'or',
  'my',
  'me',
  'i',
  'did',
  'do',
  'was',
  'were',
  'what',
  'which',
  'when',
  'where',
  'how',
  'that',
  'this',
  'find',
  'show',
  'tell',
  'looked',
  'searched',
  'about',
  'last',
  'past',
  'week',
  'weeks',
  'month',
  'months',
  'day',
  'days',
  'yesterday',
  'today',
  'recent',
  'recently',
  'ago',
  'visit',
  'visited',
  'read',
  'saw',
  'seen',
  'page',
  'pages',
  'site',
  'sites',
  'website',
  'websites',
  'article',
  'articles',
]);

// The words of a query that are worth looking for (lower case, no filler unless nothing else is left).
export function searchWords(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const content = words.filter((word) => !FILLER_WORDS.has(word));
  return content.length > 0 ? content : words;
}

// How many of those words a page must have: all of them for one or two, otherwise about half.
export const minWords = (count: number): number =>
  count <= 2 ? count : Math.ceil(count / 2);

// The items that match well enough, best first (most words, then newest), at most `limit`, and not
// older than `since` (a time in milliseconds) if that is given. No words: the newest ones.
export function looseSearch<T>(
  items: readonly T[],
  query: string,
  textOf: (item: T) => string,
  atOf: (item: T) => number,
  limit: number,
  since?: number,
): T[] {
  const words = searchWords(query);
  const need = minWords(words.length);
  const scored: { item: T; score: number; at: number }[] = [];
  for (const item of items) {
    const at = atOf(item);
    if (since !== undefined && at < since) continue;
    const text = textOf(item).toLowerCase();
    const score = words.filter((word) => text.includes(word)).length;
    if (score >= need) scored.push({ item, score, at });
  }
  scored.sort((a, b) => b.score - a.score || b.at - a.at);
  return scored.slice(0, limit).map((s) => s.item);
}
