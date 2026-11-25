# Bug hunt, round 2: what the owner found in daily use (v0.2.3)

Reported through the issue forms (Settings > About > Report a problem). Round 1 is `round-1.md`.

| Issue                                               | Kind      | What                                                                                         | Status                           |
| --------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| [#142](https://github.com/atat26/cleave/issues/142) | bug       | "The request was not usable" when the assistant makes a long document                        | Fixed on branch `long-artifacts` |
| [#141](https://github.com/atat26/cleave/issues/141) | bug       | A page had no CSS after reopening the app (seen once)                                        | Open: cannot be repeated yet     |
| [#140](https://github.com/atat26/cleave/issues/140) | annoyance | In split view the approval card shows in the web half even when the chat half is bigger      | Open                             |
| [#139](https://github.com/atat26/cleave/issues/139) | annoyance | Some sites show no favicon (Thinking Machines)                                               | Open                             |
| [#138](https://github.com/atat26/cleave/issues/138) | annoyance | Chat scroll jumps to the bottom after the chat is folded away in split view and opened again | Open                             |
| [#137](https://github.com/atat26/cleave/issues/137) | annoyance | A PDF tab starts at the top again after going to another tab and back                        | Open                             |

## #142: the cause

A tool call could hold at most 10,000 characters. The limit was chosen when the longest document measured was about 8,000
characters (`docs/pipeline/changes-12.md`). A longer document was cut at that point in silence, which left broken JSON, and
the artifact tool answered "The request was not usable." The model was never told about the limit or that its call had
been cut, so it sent the same long document again and was refused again. Two refusals of one tool end the reply, so the
user saw it fail "twice".

The owner's guess ("the model not knowing the max length of a doc") was right.

## #142: the fix

- A call can now hold 40,000 characters (`MAX_TOOL_ARGUMENTS`), so a document of about 30,000 characters fits whole.
- A call that is still too long, or that the provider cut off at its reply length limit, is marked `cutOff`. It is never
  run. The model is told plainly that the call was cut off and nothing was done, and how to build a long document in
  parts: make it with a first part ending in "(more to come)", then add each next part with `edit_artifact`.
- The artifact tool descriptions say how much one call may hold.
- A cut-off call is sent back to the provider as an empty call, because some providers refuse arguments that are not valid
  JSON.

Tests: unit tests for marking and for the refusal, and an e2e journey (a reply that ends at the length limit in the middle
of a document, then a good second try).

### With a real model (scenario s34, 2026-11-25)

Asked for a guide of at least 16,000 characters. The free model (`nvidia/nemotron-3-ultra-550b-a55b:free`) never answered
(about seven minutes with no words), so the approved small paid test was used: `deepseek/deepseek-v4.1-flash`, two runs,
**$0.0211 in all** (cap $0.05).

- Run 1: the model first tried the whole guide in one call. The app refused it as cut off, with the reason, and the model
  then made the document in parts (one create, three edits). Result: one document of **43,363 characters**, whole.
- Run 2: the model read the per-call limit in the tool description and built the document in two parts by itself. Result:
  one document of **51,255 characters**, whole.

Both documents are far beyond the old 10,000-character limit, which could never have produced them.
