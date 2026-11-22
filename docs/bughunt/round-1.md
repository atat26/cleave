# Bug hunt, round 1 (2026-11-21)

Four reviewers read the code in parallel (shutdown and crashes; tabs, Spaces and saved data; the chat and
the assistant's runs; the interface). Nothing was run: each finding is "traced in the code" until a fix
or a test proves it. **Checked** means I read the code myself. Status: `fixed` (in a branch), `todo`,
`later` (a design decision or a bigger piece), `skip` (not worth it).

The first bug came from the owner: "Object has been destroyed" when the app is closed (fixed, see S1).

## Data you could lose

| #   | What goes wrong                                                                                                                                                                                       | How likely      | Status |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ |
| D1  | **Ungroup a Space: its documents are orphaned** and disappear from the Documents panel for good (only delete releases them). Repair on load too.                                                      | high            | fixed  |
| D2  | **A failed save is forgotten** (the save marks itself done before the write finishes; an EBUSY/EPERM is swallowed). At close, one failing save throws and skips all the later ones. Shared temp name. | low to medium   | fixed  |
| D3  | **Tabs past 1,000 or Spaces past 200 vanish on the next start** (the load cap; closed links in Spaces count forever; adding has no cap).                                                              | grows with use  | todo   |
| D4  | **Deleting a big Space loses pages** despite "you can bring it back" (300-page and 2,000-character URL caps in the trash, only 50 trash items).                                                       | with big Spaces | todo   |
| D5  | **Restoring a deleted Space does not reconnect the chats linked to it** (new id, chat links stay grey).                                                                                               | medium          | todo   |
| D6  | **Artifact text typed in the last half second before closing is lost** (nothing flushes the editor on close).                                                                                         | sometimes       | fixed  |
| D7  | Recently closed drops the `#` part of a URL and URLs over 2,000 characters (single-page apps reopen at the wrong place).                                                                              | low             | later  |

## The assistant and chats

| #   | What goes wrong                                                                                                                                                                              | How likely        | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------ |
| C1  | **A reply that fails partway is forgotten**, so Retry or a follow-up repeats clicks and typing that already happened (rate limits mid-run are common on free models).                        | medium to high    | fixed  |
| C2  | **Delete a chat while it replies: a stuck "live" reply in Recently deleted** (spinner, dead Allow/Deny, Retry refused). Found by two reviewers.                                              | medium            | fixed  |
| C3  | **Branching a chat that is still replying** copies the unfinished reply the same way.                                                                                                        | medium            | fixed  |
| C4  | **Two chats at once share one pop-out card and "working" flag**: a click can answer the other chat's card.                                                                                   | medium            | later  |
| C5  | Editing the newest message builds the run's tools and skills from the OLD text.                                                                                                              | medium            | fixed  |
| C6  | A later read that was refused or failed still marks the earlier good page text as stale, so the model has nothing. Fallback tool-call ids repeat (`call_0`).                                 | sometimes         | fixed  |
| C7  | Stream edge cases: a stream that ends with no finish is saved as done; no timeout when a provider stalls; parallel calls that all say index 0 get merged.                                    | rare to sometimes | fixed  |
| C8  | Linking silently fails at 20 links (the model is told "linked"). At 300 steps in a reply a risky step would run without asking (very unlikely, high damage).                                 | rare              | part   |
| C9  | No `tools` field once tool rounds run out while history still has tool calls (some providers reject it). Cuts can fall inside an emoji. Outlines stay valid after you navigate a linked tab. | rare              | later  |

## Shutdown, crashes and robustness

| #   | What goes wrong                                                                                                                                                                            | How likely   | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------ |
| S1  | **"Object has been destroyed" when the app closes** (a page's destroyed event touched the closed window).                                                                                  | sometimes    | fixed  |
| S2  | **No safety net for errors**: the app has no uncaughtException handler, so any throw in an event handler shows Electron's error dialog. Add one that logs, and stays quiet while quitting. | n/a          | fixed  |
| S3  | A crashed toolbar, sidebar, popup, find, suggest or overlay page is never reloaded (blank toolbar until restart).                                                                          | rare         | fixed  |
| S4  | A page's right-click menu, or "rewarn", acts on a page that may be gone (same error as S1).                                                                                                | rare         | fixed  |
| S5  | Assistant steps break when the page goes away mid-step ("A tool failed unexpectedly" and a 15-second wait instead of "closed").                                                            | sometimes    | fixed  |
| S6  | Sleeping a tab cancels its download or Save as. (Only with "sleep after N minutes" or the Space Sleep item.)                                                                               | sometimes    | fixed  |
| S7  | A crashed tab with reason "killed" or on a non-web address shows nothing; no "unresponsive" handling.                                                                                      | rare         | part   |
| S8  | Quitting during a link read can leave the process running for a second or more (a quick relaunch then does nothing).                                                                       | rare         | fixed  |
| S9  | The preview guard reads `contents.id` on a possibly destroyed page.                                                                                                                        | rare (guess) | fixed  |
| S10 | Windows shutdown or log-off: only the window's `close` flushes saves, no `session-end`.                                                                                                    | sometimes    | fixed  |
| S11 | Many handlers are not removed when the window closes (a second window, or macOS reopen, would throw). **Blocks multiple windows**; do it as the first step of that work.                   | n/a          | later  |

## Interface

| #   | What goes wrong                                                                                                                                                                                                                                                    | How likely        | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------ |
| U1  | **Enter on a focused card button allows the step** (Tab to "Don't allow", press Enter: it allows). The card's key handler catches Enter from any child. Risky cards need Ctrl+Enter, so they are safe. **Checked.**                                                | any keyboard user | fixed  |
| U2  | **One shared draft across chats**: text typed in chat A is still there in chat B, and Enter sends it there. **Checked.**                                                                                                                                           | high              | fixed  |
| U3  | Quick search (Ctrl+K): Enter right after typing picks a stale row.                                                                                                                                                                                                 | sometimes         | fixed  |
| U4  | The address bar keeps text you typed after you leave it (Escape, click away, or Ctrl+L then another tab).                                                                                                                                                          | high              | fixed  |
| U5  | Hidden controls with no keyboard path: close-tab "x", "New tab in Space", the Space grip, the compact "+ new chat" (`display:none`). Chat rows in chat-only mode cannot be focused at all.                                                                         | keyboard users    | part   |
| U6  | Enter during IME composition acts anyway (quick search, new tab box, message edit, every rename box). Escape in rename boxes may still save.                                                                                                                       | IME users         | part   |
| U7  | The chat does not re-pin to the bottom when content grows (step details opening, a thumbnail loading, resizing).                                                                                                                                                   | sometimes         | fixed  |
| U8  | Buttons stuck disabled if the main process throws (Send, Save, Settings buttons have no try/finally).                                                                                                                                                              | low               | later  |
| U9  | Smaller: RunBar "Dismiss (Esc)" only works inside the bar; the collapsed strip clips extra tabs and chats; skill editor discards edits without asking; a collapsed Space can hide the selected tab; "@" in the one-row bar may toggle the chat repeatedly (guess). | low               | later  |

**C8 is partly fixed:** a step that has to be asked about is now refused if the reply has no room to show its card, and the assistant is told when a tab it opened could not be linked. Documents and saved pages made by the assistant that cannot be linked at 20 links are still not reported.

**U5 and U6 are partly fixed:** a Sidebar row that has the keyboard now shows its hidden buttons, and chat rows can be reached, opened (Enter or Space), renamed (F2) and given their menu (the menu key). Enter while an input method is composing is ignored in every text entry. Not done: Escape in rename boxes possibly still saving (unconfirmed), the collapsed strip clipping extra tabs and chats, and the smaller items in U9. U3 and U7 have no automated test (they need a real pointer and layout).

**Robustness batch notes:** S2 writes unexpected errors to errors.log in the data folder (installed app only; a development copy keeps the dialog). S3 reloads a crashed toolbar, sidebar, menu, find, suggestion or pop-out page (not more than four times in five minutes). S6: pages that are downloading or saving are not put to sleep by the rules (the assistant's own "sleep a tab" tool does not check yet). S7: a tab whose page process was killed from outside now shows the stopped page; an "unresponsive" page still has no handling.

## Not covered by this round

Extensions panel, privacy, search engine and downloads sections, the emoji picker, and the PDF viewer's
performance. The reviewers did not run the app.

## Suggested order

1. **Safety and data first:** U1, then D1 and D2 (and the safety net S2), then D6.
2. **Chats:** C2 and C3 together, then C1, C5, C6.
3. **Daily annoyances:** U2, U4, U3, U7, then U5 and U6.
4. **Robustness:** S3, S4, S5, S6, S10.
5. **Growth and limits:** D3, D4, D5, C8.
6. **With multiple windows:** C4, S11.
