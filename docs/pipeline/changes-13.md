# Changes 13: a plan up front

Follow-on to `changes-12.md`. For a task with several separate pieces, the assistant now states a plan first; you review it
before any work starts, and again every time the steps change. The chat then shows "Step 2 of 5". Three new scenarios
(30 to 32). `deepseek/deepseek-v4.1-flash` in small paid tests, about $0.08 in all.

## What it is

- **A tool, `set_plan`** (in the Tools panel as "Plan a long task", asks by default). Arguments: `steps` (3 to 8, at most
  70 characters each), `done` (how many are finished), `reason` (when the steps change).
- **What a step is** (the tool's description and one rule in the system message): one piece of the task that gets you
  closer to what you asked for, never a tool call; a plan is only for a task with about four or more such pieces, never for
  a question, a single action or a short task. A step that names a tool (`read_page`...) is refused, and so is a plan of
  fewer than 3 or more than 8 steps.
- **You review it.** A new plan shows a card with the numbered steps. A change to the steps shows a card that marks what is
  new, moved or removed, and gives the reason. These cards still ask after "Allow the rest of this reply". Only moving the
  progress forward (same steps, more done) goes ahead without a card. A plan gives no permission: every action still asks.
- **If you say no**, the assistant is told not to start and to ask what you want changed, and any other calls it made in the
  same step are not started (they show as "Not started: you did not approve the plan").
- **Where it shows.** The run bar says "Step 2 of 5" while it works and "3 of 5 steps" after, with one tick per plan step
  (steps still to come are faint). The page's pill says the same. The step list has a "Plan: 2 of 5 done" row that opens to
  the checked-off steps. The plan is kept with the chat, so it survives a restart.
- **Off switch for comparing:** `AIB_NO_PLAN=1` removes the tool and the rule.

## What the tests found

Each of these was seen in a live run and fixed:

1. **A step cut to its limit came out one character too long** (the shortener adds "…"), so a saved plan would have been
   dropped when the chat was loaded again. Found by a unit test.
2. **A declined plan was ignored**: the generic "try another way" text let the assistant read the pages anyway (in 2 of 2
   runs). The decline now has its own text: 4 of 4 runs hold back.
3. **Plan and first action in one step**: once the tool said progress updates go "in the same step as your next tool call",
   the assistant also sent the first plan together with the first read, so the work started before you answered (0 of 4 held
   back). Now the first plan and changes must be called alone, and the app itself skips the other calls of a step whose plan
   was declined (4 of 4 hold back).
4. **The assistant sometimes did not plan** a four-piece task (1 of 2 runs); asking "Before you start a task with about four
   or more separate pieces, state a plan" fixed that in the next 4 of 4 runs, and it still made no plan for a short
   two-read task (4 of 4, three times over).

## What it costs, and whether it helps

Scenario 30 (read four pages, write a summary of each, save them as a document, make a Space and move the four tabs in):

|                           | planning off | planning on                |
| ------------------------- | ------------ | -------------------------- |
| tokens per run, average   | about 37,000 | about 73,000 (14 runs)     |
| requests per run          | 5 to 7       | 7 to 12                    |
| made the document + Space | 6 of 8 runs  | about the same (most runs) |

- **It does not make the work better in this test**: both ways did the job about equally often. The runs that did not finish
  stopped to ask because the fixture pages do not match their titles, with or without a plan.
- **A long task costs about twice the tokens**, because every progress update is another request to the model (most of it
  is read from the cache: about 80% of the prompt tokens). A plain question costs about 330 tokens (13%) more in every
  request, because the tool and the rule are always sent (2,796 against about 2,460 in scenario 1).
- **What it gives is the control and the visibility**: you see and approve the steps before anything happens, and you see
  where it is. That was the point of the feature, and the cost only lands on tasks of four or more pieces.
- Scenarios 14, 22 and 23 fail the same way with and without planning (14: the model asks which tabs are meant, in 5 of 6
  runs without a plan; 22 and 23: the test window cannot click or take pictures), so they say nothing about planning.

Possible later savings: put `set_plan` in a tool group instead of the always-sent tools (saves the 330 tokens on short
tasks, costs one extra step when a plan is wanted); allow the plan's progress to ride on the answer of the next step only
(fewer requests).

## Scenarios added (`scenarios-plan.mjs`)

- **30**: a four-piece task gets a plan with 3 to 6 steps, none naming a tool, asked about first, updated a few times, and
  the work is done.
- **31**: a short two-read task gets no plan.
- **32**: a plan that is declined: no work starts and nothing is made.
