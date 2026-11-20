# Changes 9: scenario 7b, a tab closed while a step waits

Follow-on to `changes-8.md`. This was the last open scenario. The app already marks a step as **skipped** ("You closed
this tab, so this step was skipped") when you close its tab, and that is covered by unit tests. What had never been
measured is what the _assistant_ does and says afterwards.

## The scenario

A new fixture page `/faq` with one harmless button ("Show more details"). The assistant is asked to click it. While its
approval card is waiting, **the driver closes that tab**, then allows the step. (Closing a tab at the exact moment a step
is running would depend on timing; a step that is waiting for your answer is a moment that is always there.)

The driver gained a small hook for this: a scenario can do something to the app just before an approval card is
answered (here, close the tab). The checks can now also see whether a step was skipped.

The checks: the click ended as skipped (not failed); the answer says plainly that the tab was gone and the click was not
done; it does not claim the click worked or quote the text that only appears after it; it makes at most two more steps and
asks for the click at most twice; it does not open or reopen the page without asking.

## What the first runs showed

Seven runs on `deepseek/deepseek-v4.1-flash` before any change to the app. In every one the behaviour was good: the step
was skipped, the answer was honest ("nothing was clicked"), nothing was reopened, and when it offered to reopen the page
it did so as a question with choice buttons ("Reopen the page and click the button / Never mind"), which is the
"always ask first" rule. Two runs only looked like failures because my first checks were too blunt (they flagged
"nothing was clicked", and wanted the word "closed" when the model said "no longer linked").

The one thing worth fixing: the model was told **"Tab N is not linked to this conversation, or it has been closed"**, so
it said "no longer linked" and made a pointless `list_linked_tabs` step to find out. The app knows the user closed it.

## The change

When the app knows you closed the tab a step was about, it now tells the model exactly that: _"The user closed tab N, so
this step was NOT done. Tell the user it was not done because they closed the tab. Do not open or reopen the page
yourself: ask the user whether they want that."_ (An action approved after the tab was closed, and an action whose tab
closed while it ran, both use it. Page reads keep their own wording.) Covered by unit tests.

## Measured

Scenario 7b, `deepseek/deepseek-v4.1-flash` (small paid tests, $0.0074 for the 12 runs):

|                                   | Result                          | Average tokens | Requests |
| --------------------------------- | ------------------------------- | -------------- | -------- |
| Before the change (7 runs)        | behaviour fine; check too blunt | about 18,300   | 5 to 6   |
| With the clearer message (5 runs) | **5 of 5**                      | about 15,300   | 4 to 5   |

The answers now say "the tab was closed before the click went through", and the extra `list_linked_tabs` step is gone.

## Open

- Nothing in the scenario list is left. The pipeline review itself (what is sent at each stage of each feature that calls
  the model) is still in `PLAN.md`.
