# Changes 3: filling a form in one step

Follow-on to `changes-2.md`. The owner approved the design.

## The problem

`type_text` types into one field and asks for one approval. A contact form with three fields was three steps, three
approval cards and (because every step is a request that resends everything) three rounds of waiting.

## What was built

**`fill_fields`**: one tool that takes one tab and a list of fields (`element` number and `text` each, 1 to 10). The
owner sees **one card** that says "Fill in 3 fields on example.com" and lists every field with the text for it
("Email: alex@example.com"). One answer covers the whole form.

The design choices, made for the owner and easy to change:

- **One card, a list of lines.** It uses the existing list part of the card, so no new UI. Each line is written by the
  app from the real field name and the cleaned text, never from the model's own words.
- **All or nothing.** If any field is missing from the last look, listed twice, too long (over 1,000 characters) or a
  password, card or one-time-code field, the whole call is refused and nothing is typed. The model is told which rule
  it broke and that nothing was typed, so it can ask again without that field.
- **Each field counts as one action** against the limit of 25 per reply, so batching is not a way round the limit. A
  fill that would go over the limit is refused as a whole.
- **Fields are typed in the order given, one after another**, with the same code `type_text` uses. A failure stops the
  rest, and the model is told how many were filled.
- **It does not submit.** Pressing Submit (or Enter) is still a separate, risky step that always asks.
- **The marker and the cursor stay on one element: the first field**, with the same "Typing" words and text cursor as
  `type_text`. Moving them across the fields was left out: it would need new overlay code for little gain.
- Typing does not change the page, so the numbers from the last look stay valid afterwards (as with `type_text`).
- The Tools panel lists it as "Fill in a form" (asks by default, in the "act" group), so it can be turned off on its own.

## Measuring

The test driver gained an opt-in for occasional small paid tests, as the owner approved:
`--allow-paid <exact model id> --max-cost <usd>`. Without it nothing paid can run. With it, one named model may be
used, the cost is added up from what the app reports and printed, and the run stops if it goes over the cap (default
0.05, never above 0.50). The exact id for DeepSeek V4.1 Flash in the model list is `deepseek/deepseek-v4.1-flash`
(0.3 and 1.2 dollars per million tokens in and out).

## Results

Same free model as before (`nvidia/nemotron-3-ultra-550b-a55b:free`), the driver in `--strict` mode, three runs each.

| Scenario                 | Before (`type_text`)     | With `fill_fields`                                                               |
| ------------------------ | ------------------------ | -------------------------------------------------------------------------------- |
| 4: fill a form           | 15,153 and 15,806 tokens | **3 of 3 passes, 13,099 to 13,125 tokens**, 4 requests: look, then one fill step |
| 10: a follow-up question | 3 of 3                   | 3 of 3 (17,000 to 21,400 tokens; nothing in this scenario changed)               |

- **The model chose `fill_fields` by itself every time** (one call with both fields), with no change to the system
  prompt: the tool's own description was enough. This is the opposite of the rule-only attempts in changes 2, where
  the model almost never batched.
- The saving is modest for a two-field form (about 14% of the tokens): it is one round and one approval card fewer.
  It grows with the number of fields, and the single card is the bigger gain for the owner.
- The form's password field was never touched. The refusal of a password field inside a list is covered by unit
  tests (the whole call is refused and nothing is typed); the live runs did not try it.
- No paid model was needed, so the new `--allow-paid` option has not been used live yet.

## Not done

- A `fill_fields` live run with a form that has a password field the model is tempted to fill (needs a fixture).
- The marker and cursor do not follow the fields one by one.
- `select_option` and checkboxes are not part of the batch: a form with a dropdown still needs a step for it.
