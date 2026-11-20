# Changes 11: does the order of the prompt matter for the cache?

Follow-on to `cache.md` and `changes-10.md`. A provider can reuse what it has already read of an unchanged start of a
request ("cached tokens", cheaper and quicker). Two things near the start of every request could change from one request
to the next:

- the **tool list**: opening a group of tools (`more_tools`) inserted its tools in the middle of the list, so everything
  after them shifted;
- the **system message**: the linked tabs sat before the skills, though the skills change less often.

## The experiment

Both were reordered behind a switch (`AIB_OLD_ORDER=1` for the old order):

- the core tools first, in their own order, then each open group in a fixed order, so that opening a group only adds
  tools at the end;
- the system message: your prompt, the rules, the skills, then what depends on this chat (linked tabs, remembered
  searches and steps).

Compared on three scenarios that take many requests (9: ten product pages; 16: summarise a Space; 22: a big catalogue
page), three runs each, in **six alternating batches** (old, new, old, new, old, new) so that a change in the provider's
behaviour over time hits both sides. `deepseek/deepseek-v4.1-flash`, about $0.07 in all.
`tests/pipeline/cache-report.mjs` adds up, per condition, the prompt tokens, the cached share, and "effective units": the
uncached prompt tokens, plus a tenth of the cached ones, plus four times the output tokens (a rough price, the same for
every condition).

| Scenario | Order | Runs (passed) | Prompt tokens per run | Cached | Effective units per run |
| -------- | ----- | ------------- | --------------------- | ------ | ----------------------- |
| 9        | old   | 9 (8)         | 33,226                | 56%    | 21,655                  |
| 9        | new   | 9 (8)         | 28,275                | 39%    | 23,239                  |
| 16       | old   | 9 (9)         | 10,831                | 32%    | 10,858                  |
| 16       | new   | 9 (9)         | 12,460                | 41%    | 11,111                  |
| 22       | old   | 9 (2)         | 85,091                | 56%    | 49,995                  |
| 22       | new   | 9 (1)         | 69,332                | 55%    | 41,739                  |

## Result: no reliable difference, so the change was not kept

- The cached share goes down in one scenario (56% to 39%), up in another (32% to 41%) and stays the same in the third
  (56% and 55%). The effective cost moves by a few percent either way, except in scenario 22, where the runs ended at
  different lengths (only 1 and 2 of 9 finished the task in this window), so they are not comparable.
- That fits what a reply looks like: **inside one reply the system message does not change at all**, so its order cannot
  matter there; only the tool list changes between requests, and the provider's cache clearly depends on more than the
  order (which server answers, how long ago the last request was).
- A change that shows nothing on a nine-run comparison is not worth the extra code and a switch, so the source was left
  as it was. What stays: the report tool and this note. (A chat that goes on over many messages could still benefit,
  but the system message only changes there when you link or unlink tabs.)

## Open

- Scenario 22 finishing in only 1 or 2 of 9 runs in this window, against 4 of 5 earlier the same day, is worth a look
  on its own: it is the model, not the app (the runs that fail stop after one or two clicks).
