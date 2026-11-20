# Changes 10: leaving out what no longer helps inside one reply

Follow-on to `changes-9.md`. Within one reply every tool result and every picture stays in the conversation, and every
later request pays for all of it again (hypotheses 3 and 4 in `inspection.md`).

## What was changed

`pruneConversation` (`src/pruneConversation.ts`) leaves three kinds of thing out of **what is sent**. The conversation the
app keeps is not changed, and every tool call still has an answer, so the conversation still makes sense. Each is
replaced by one short line that says what it was and why it is not repeated.

- **A look at a page (`look_at_page`) whose control numbers have expired.** The page changed (a click, a key, a choice,
  going to an address or back) or it was looked at again. The app already refuses the old numbers, so the old list can
  only mislead. Typing, filling a form, scrolling and actions in other tabs do not expire a look.
- **A page read (`read_page`) of a tab that was read again later.** The newer text is the current one. Reads of different
  tabs, and `read_pages`, are never touched.
- **Pictures other than the newest.** The model has already seen and answered about the older ones. Pictures that arrive
  in the same round stay together (the model needs both to compare them).

`AIB_NO_PRUNE=1` sends everything, to compare (like `AIB_ALL_TOOLS` does for the tools).

One known cost: an action that was refused or declined still counts as "the page changed", so the look before it is
replaced even though its numbers were still valid; the model can simply look again. It is rare.

## Measured

`deepseek/deepseek-v4.1-flash`, small paid tests (about $0.07 in all across the runs below; each batch stayed under the
5-cent cap).

**A page with many controls.** New scenario 22 and a `/catalog` fixture: "add the three cheapest items to the list, then
tell me the total". Every click changes the page, so every step needs a fresh look. Five runs each.

| Page                                         | Trimming | Tokens per successful run            | Average          |
| -------------------------------------------- | -------- | ------------------------------------ | ---------------- |
| 30 items (a look is 1,361 characters)        | off      | 78,740 / 84,579 / 78,495             | about 80,600     |
| 30 items                                     | on       | 79,958 / 80,956 / 75,270             | about 78,700     |
| 120 items (a look is about 4,600 characters) | off      | 129,517 / 133,216 / 124,202 / 97,815 | about 121,200    |
| 120 items                                    | on       | 95,858 / 110,561 / 91,294 / 89,200   | **about 96,700** |

Both settings completed 4 of 5 runs on the big page (the failures are the model stopping early or reporting a wrong total, not the
trimming). So: **about 20% fewer tokens on a big page, and nothing visible on a small one**, because a stale look only
costs as much as the look was. A look can be up to 12,000 characters on a real page (300 controls), so the saving grows
with the page.

**Short scenarios** (4 and 10, four runs each, trimming on against the earlier baseline): no difference beyond the
noise (scenario 4 about 14,300 before and 16,400 after, scenario 10 about 21,500 and 21,200). They have at most one
stale look of a few hundred characters.

**Pictures.** A new scenario 23 asks for two screenshots one after the other. With the trimming on, **no request carried
more than one picture** (0, 1, 1, 1 per request), and all five runs passed. (When the model asks for both screenshots in
one step, which it often does, they arrive together and are both kept.) A picture here is only about 600 tokens, so the
saving is small; a tall screenshot costs more.

## A note about the test window

For a while scenario 11 failed in every run with "Not taken (it could not be read)". That was the test window being
covered or minimized, which breaks screenshots, not the trimming. With the window visible scenario 11 passed 6 of 6.
Screenshot scenarios (11 and 23) need the app window in front.

## Open

- Page text of earlier reads of **different** tabs is kept (a task like "compare ten pages" needs all of it). Shrinking
  those safely would need the model to note what it found first: not done.
