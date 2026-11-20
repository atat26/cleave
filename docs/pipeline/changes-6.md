# Changes 6: a forgiving history search

Follow-on to `changes-5.md`. Batching the searches did not make scenario 12 cheaper, because the model kept trying
other words: a page only matched when **every** word was in its title or address, and a question like "what did I read
about graphics cards last week?" has words ("last", "week") that are never in a title.

## What was changed

For the assistant only (your own history and bookmark searches are unchanged and still need every word):

- **A forgiving search** (`looseSearch.ts`). Words about the question itself ("what", "read", "last", "week",
  "recently", "pages"...) are left out, unless nothing else is left. Then a page matches when most of the remaining
  words are in its title or address: all of them for one or two words, otherwise about half. Pages that match more words
  come first, newest first among equals.
- **A `days` option** on `search_history` and `search_bookmarks` ("only pages from the last N days", 1 to 365), so
  "last week" becomes `days: 7` instead of words that can never match. It shows on the approval card ("Search your
  browsing history for 'graphics cards' from the last 7 days") and works with a batch of searches.
- The descriptions of the tools say all this, including "give the words about the page, not words like last week".
- In test runs the made-up history is searched with the same forgiving search, so scenario 12 exercises it.

## Measured

Scenario 12, three runs, `deepseek/deepseek-v4.1-flash` (small paid test, $0.0025 for the three runs):

|                                        | Tokens per run           | Average      | Requests |
| -------------------------------------- | ------------------------ | ------------ | -------- |
| Before the batch (one search per call) | 15,196 / 19,716 / 18,738 | about 17,900 | 5 to 6   |
| With batching (`changes-5.md`)         | 14,772 / 19,373 / 18,728 | about 17,600 | 5 to 6   |
| With the forgiving search and `days`   | 15,755 / 15,683 / 15,259 | about 15,600 | 5        |

- **The model used `days: 7` in every run**, and its first search ("graphics cards", last 7 days) usually found the
  right pages.
- It still ran two or three more steps of five searches each, with other words ("GPU", "Nvidia", "Radeon"). Some of that
  is useful: the Tesla K80 page has no "graphics card" in its title and is only found by those other words.
- So the saving is real but modest (about 11% of the tokens, and a steadier range), not the big drop hoped for. The
  rest is the model being thorough, which no search change will stop.

## Open

- A rule or limit on how many searches a plain question may use (not done: it would cut the useful synonym searches too).
