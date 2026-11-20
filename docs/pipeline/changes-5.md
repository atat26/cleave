# Changes 5: several history searches in one step

Follow-on to `changes-4.md`. Scenario 12 ("What did I read about graphics cards last week?") showed the assistant
searching the made-up history 5 to 7 times, one search after another, and reaching the limit of 8 look-ups.

## What was changed

`search_history`, `search_bookmarks` and `search_chats` take an optional `queries` list (up to 5) as well as the single
`query`:

- **One step and one approval card for the whole batch.** The card lists every search ("Search your browsing history for
  'goldfish', 'pond liner'"). Your history and chats ask first by default, so this is the real gain: one question
  instead of one per search.
- **Each search counts as one look-up** against the limit of 8 per reply, so batching cannot be a way round the limit
  on how much of your data is read. A batch that no longer fits runs as many searches as are left and says so.
- **Nothing is repeated.** A page or chat that an earlier search in the batch already listed is left out of the later
  ones ("Nothing new matched").
- Repeats in the list are dropped, an entry that is not text refuses the whole call, an empty list falls back to the
  single `query`, and a single search (or a list of one) gives exactly the answer it gave before.
- `search_chats` no longer _requires_ a `query` in its definition (it needs a `query` or `queries`; one with neither is
  still refused).
- The tool's description says to read what came back before searching again.

## Measured

Scenario 12, three runs each time, `deepseek/deepseek-v4.1-flash` (small paid tests, the free model was rate-limiting; $0.0056 for the six runs with `queries`):

|                                                                      | Tokens per run           | Average      | Requests | History searches per run         |
| -------------------------------------------------------------------- | ------------------------ | ------------ | -------- | -------------------------------- |
| Before (one search per call)                                         | 15,196 / 19,716 / 18,738 | about 17,900 | 5 to 6   | 5 to 7, one at a time            |
| With `queries`                                                       | 15,231 / 9,073 / 19,032  | about 14,400 | 4 to 6   | 3 to 4 steps of up to 5 searches |
| With `queries`, and "read before searching again" in the description | 14,772 / 19,373 / 18,728 | about 17,600 | 5 to 6   | 3 to 4 steps of up to 5 searches |

The 9,073-token run was a short one (the model stopped early); the other five runs with `queries` are all between 14,700 and 19,400, the same range as before.

The model **used the batch every time**, but the **cost did not go down**: it still takes 2 to 4 steps because it keeps
widening the search (other words, then "the most recent pages", then more words), and every extra search still counts
against the limit and still adds its results to the next request. The cause is the model's thoroughness plus the rule
that all words must match, not the one-at-a-time calls. So this change is a better question for you (fewer cards), not
a cheaper run.

One run of the first three "failed" the scenario only because its check read a closing backtick as part of an address
(`` `https://shop.example/gpus` ``). The check is fixed.

## Open

- Making the search forgiving (a page matches if _most_ words match, best first), so the model has less reason to try
  variations. That changes what the tool finds, so it needs its own look.
- A rule or limit on how many searches a plain question may use.
