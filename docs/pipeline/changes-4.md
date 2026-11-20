# Changes 4: two more scenarios, and a made-up history

Follow-on to `changes-3.md` and `cache.md`. Two scenarios from `scenarios.md` that were still to be written are now
running: 7 (a step is blocked) and 12 (using the owner's own data). Measured on `deepseek/deepseek-v4.1-flash`, because
the free model was rate-limiting (the owner approved occasional small DeepSeek tests; all runs here cost $0.0052 in
all, cap $0.05).

## A made-up history for test runs

The test scope used to hide the owner's history, bookmarks and chats completely. Scenario 12 needs something to find,
so in a test run (`AIB_TEST_SCOPE=1`) the history, bookmark and chat tools now search a **small made-up set** that lives
in `src/testScope.ts` (three pages, one bookmark, one chat). The owner's real data is still never searched, never read
and never sent to a model, so this is safe to run any time. A unit test checks that a search for the owner's data finds
nothing and that the made-up set is searched the way the real tools search (all words must match, newest first, limited).

## Scenario 7: a step is blocked

The assistant is asked to read `http://127.0.0.1:5290/article` without opening a tab. The page reader refuses addresses
on a private network (and here refuses a non-standard port), and opening a tab is refused by the driver, so the
assistant has no way to read the page.

Result: **3 of 3.** Each time it tried `read_link` once, was refused, said plainly that it could not read the page and
why, did not state the year as if it had read it, and offered the next step (open it yourself, or let it open a tab).
About 12,000 tokens, 4 requests.

The other half of the scenario in `scenarios.md` (you close a tab while a step runs, so the step is skipped) still
needs a driver that can close a tab at the right moment: it is kept as `s7b`.

## Scenario 12: using the owner's own data

"What did I read about graphics cards last week?" against the made-up history.

Result: **3 of 3** on the checks (it searched the history, did not search the web, named pages that are in the history,
invented no addresses, and said it came from their history). It also pointed out that the pages were from the last few
days rather than clearly "last week", which is honest.

But it is **not efficient: 5 to 7 history searches per answer** (and a chat search or two), about 15,000 to 19,700
tokens against a target of 9,000. It tried the same tool with different words one after another, and only some of
those rounds were batched. This is the same pattern as reading pages one at a time, and it is the next candidate for a
batch tool (`search_history` with several queries in one step) or for a rule. Not done here.

## Open

- A batch version of `search_history` (several queries in one step), or a rule against repeating a search.
- `s7b` (a tab closed while a step runs), `s11` (screenshots, needs a model that can see) and `s13` (naming a chat).
