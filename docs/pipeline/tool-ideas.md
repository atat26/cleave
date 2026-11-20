# Ideas: sending fewer tool definitions

The problem (from `baseline-1.md`): the 39 tool definitions are about 25,300 characters, roughly 7,400 tokens, and they
are sent with every request. They were about 79% of all prompt tokens in the baseline. A plain "hi" costs about 8,100
tokens, and a reply that takes 12 requests pays that 12 times.

This file is speculation, to be tested. Each idea says how it works, what it saves, what could go wrong, and how the
scenarios would show it.

## What a request needs, by kind of task

Most tasks use a few tools, and the same few:

| Task                             | Tools it really uses                                 |
| -------------------------------- | ---------------------------------------------------- |
| A plain question                 | none                                                 |
| Read or summarise a page         | `read_page` (sometimes `find_in_page`)               |
| Fill a form                      | `look_at_page`, `type_text`, `click`                 |
| Tidy tabs and Spaces             | `list_all_tabs`, `create_space`, `move_tabs`         |
| Make or edit a document or skill | `create_artifact`, `edit_artifact`, `create_skill`   |
| Remember something               | `search_history`, `search_bookmarks`, `search_chats` |

So the biggest saving is not sending the groups a task does not touch. The artifact group alone is 5,340 characters, and
a task about a page never needs it.

## Idea A: a menu of categories (a tree)

How: the first request carries only a small "core" (for example `read_page`, `look_at_page`, `find_in_page`,
`list_linked_tabs`, `offer_choices`) and one extra tool, `open_tools(group)`. The system prompt lists the groups in one
line each ("tabs and Spaces", "documents", "skills", "memory", "acting on pages", "pictures"). When the model needs one,
it calls `open_tools("documents")`, the app adds that group's definitions to the following requests, and the model
carries on. A group can have branches (documents: read, make, edit, save) so a very large set stays small at each step.

- Saves: most of the 7,400 tokens on most requests. Core is about 1,400 tokens.
- Costs: one extra request each time a group is opened (about the cost of a small request now), and the model has to
  know to ask. If it does not, it answers "I can't" when it could have.
- Watch: scenarios 4, 5, 14, 17, 19 (the model must find the right group), and any run where it says it has no tool.

## Idea B: tool search

How: one tool, `find_tools(query)`. The model describes what it wants to do ("move tabs into a Space"); the app searches
the tool names and descriptions (plain keyword matching is enough at this size) and returns the best three or four
definitions, which are then added to the request. The menu is the model's own words rather than fixed categories.

- Saves: about the same as the tree, and it scales to many more tools later (mini-apps, extensions).
- Costs: an extra request, and a worse failure mode: a bad search finds nothing useful. The model can be helped by a
  one-line index of tool names in the system prompt (names only, about 200 tokens).
- Watch: the same scenarios as A, plus how often the first search finds the right tool.

## Idea C: the app picks the groups, with no extra request

How: before the first request, the app looks at the message and the chat (words like "tab", "Space", "save", "skill",
"history", "screenshot", "click", "fill"; whether a page is linked; whether the message is a follow-up) and sends the
core plus the groups it points to. If the model needs something it was not given, it calls a small `more_tools(group)`
escape hatch, which behaves like idea A.

- Saves: the most, with no extra request when the guess is right.
- Costs: wrong guesses. The rules are simple but they are code that has to be kept right, and a plain "do it for me"
  gives little to go on. The escape hatch makes a wrong guess cost one request instead of a failure.
- Watch: every scenario, mostly the make and organise ones (5, 8, 14 to 20).

## Idea D: shrink what is sent

How: rewrite the definitions to the minimum. The biggest cost is prose: `create_artifact_in_space` is 1,514 characters,
`create_artifact` 1,376, `save_page_as_artifact` 1,050, `read_link` 931. Move the rules out of descriptions into one
short block in the system prompt, drop parameter descriptions that repeat the name, and cut examples. Merge near
duplicates: `create_artifact` and `create_artifact_in_space` could be one tool with an optional `space`.

- Saves: probably 30 to 50% (about 25,300 to 13,000 characters) with no extra request and no routing risk.
- Costs: wording changes to prompts the model reads, so each change needs re-running the scenarios; merging tools means
  a more flexible schema that the model can get wrong.
- Watch: all scenarios (a regression anywhere). This one is the safe first step.

## Idea E: short definitions first, detail on demand

How: send every tool with a one-line description and a minimal schema (names and types only), and give the full
description of a tool only when the model calls `describe_tool(name)`, or when a tool call comes back with a clear
"here is how to use it" message. A middle path between D and B.

- Saves: a lot, and every tool stays visible, so the model never misses one.
- Costs: models sometimes call a tool wrongly without the detail, which costs a failed call and a retry.

## Idea F: let the owner choose a toolset

How: the app already has tool presets (the Tools panel can set a tool to "never", and a tool set to "never" is not
sent). A per-chat choice (for example "Browse", "Organise", "Make", "Everything") would send only that preset. No model
involved, no extra request.

- Saves: as much as the owner chooses.
- Costs: the owner has to choose, which goes against "just ask"; a good default is the hard part. Pairs well with C
  (the app suggests a preset from the first message).

## Idea G: keep it, but make it cheap (caching)

How: providers can cache the start of a request (the system message and the tool definitions) so a repeat costs far
less. For that the start must be identical every time. Today the system message changes with links and remembered
searches, and (if groups changed) so would the tools. The recorder does not yet capture cached tokens, so this is
unmeasured. If a free provider does not cache at all, this saves nothing on the free models but would on paid ones.

- Saves: possibly most of the cost of the unchanged part, but not the time-to-first-word on providers that do not cache.
- Watch: add cached tokens to the recorder first, then see.

## What I would try, in order

1. **D, shrinking and merging** (safe, no extra request). Measure all 20 scenarios before and after.
2. **C with the A-style escape hatch** (the app picks the groups; the model can ask for more). It gets the biggest
   saving and a wrong guess is cheap. Start with coarse groups (tabs and Spaces, documents, skills, memory, acting,
   pictures) and a core that covers reading and looking.
3. **G**, once cached tokens are in the recorder, to decide whether the order of the prompt matters.
4. Keep **B** in mind for when there are many more tools (mini-apps, extensions), and **F** as an owner-facing option
   for the Settings work.

How a change is judged: the scenarios must still pass (no lost behaviour), the prompt tokens per request must fall, and
the number of requests must not rise by more than the saving is worth. A change that wins on tokens and loses a
scenario is not a win.
