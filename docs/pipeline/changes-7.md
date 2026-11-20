# Changes 7: remembering what was done, for follow-up questions

Follow-on to `changes-6.md`. The history sent to the model is plain text only: what a step did (a click, a typed field)
is dropped between turns. So after "Type the name Alex into the name box" the follow-up "what did you just type, and into
which field?" often made the model look at the page again (scenario 10).

## What was changed

- **`rememberedSteps`** (`chatContext.ts`), modelled on the existing block of remembered web searches: the system
  message gets a short list, written by the app from the earlier replies' steps, of what the assistant did that
  **changed something**: typing, clicking, filling a form, moving or closing tabs, making documents, skills and Spaces,
  bookmarking, saving a page. Each line says whether it was **Done**, **Not done** (you said no, it was blocked, or it was
  stopped) or **Failed**. The latest 15 are kept and a line is cut at 240 characters.
- Reads, looks, searches and scrolls are left out: what they found is in the assistant's own earlier answers, and web
  searches already have their own block.
- The names of pages, buttons and fields in that list come from web pages, so the block says they are data and not
  instructions, and tells the model to answer from the list instead of looking at a page again.
- A form filled with `fill_fields` now keeps **which field got which text** with its step (`details`), so the list can
  say it, and so you can read it by opening the step.
- Nothing is added when no earlier step changed anything.

## Measured

Scenario 10 ("type Alex into the name box", then "what did you just type, and into which field?"), four runs each,
`deepseek/deepseek-v4.1-flash` (small paid tests, $0.0086 for all eight runs):

|                    | Tokens per run                    | Average      | Requests | Tools used in the follow-up                     |
| ------------------ | --------------------------------- | ------------ | -------- | ----------------------------------------------- |
| Before             | 24,944 / 34,233 / 24,869 / 28,981 | about 28,300 | 7 to 9   | 3 of 4 runs (looked at the page again, read it) |
| With the step list | 20,812 / 20,450 / 16,351 / 20,633 | about 19,600 | 5 to 6   | **0 of 4**                                      |

About 31% fewer tokens, and the follow-up answers straight away every time. (On the free nemotron model the follow-up
already answered without tools in most runs, because its first answer said what it had done; the weaker habit of
looking again is what this fixes.)

## Open

- The list only covers steps that changed something. A follow-up about what a page said still depends on the
  assistant's own earlier answer.
