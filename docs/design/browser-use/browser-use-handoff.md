# Browser-use visuals: hand-off

Companion to `browser-use-visuals.html` (open it: theme switch and a reduced-motion switch at the top; every surface and the eight scenarios are shown in light and dark). Built on `browser-ui.html` and `browser-ui-handoff.md`. Token names are the existing ones (`--c-*`, `--sp-*`, `--r-*`); additions are listed in section 1.

## 0. The idea in one paragraph

The person gets state, place, action and progress from one of three places, whichever is in view: the **run pill** on the top edge of the page card, the **run bar** above the composer, or the **run chip** at the top of the sidebar. A fourth thing, the **element marker**, shows the exact element on the page. The rule that decides who speaks: the page is framed only when the current step touches that page; tab and Space changes speak in the sidebar and on the rows involved; writes to the app's own store (artifacts, skills, Spaces) speak in the chat and on the sidebar row they create. Quiet when idle: with no run there is nothing extra on screen.

## 1. New tokens, components, icons

**Glow on the web view's border only.** The frame round the web view is a glow (no line). Everything inside the page and in the sidebar keeps the line treatment: solid ring plus halo on the element marker, dashed ring for "reading", dashed outlines on tabs a batch will move or close. The glow colours are the same `--c-accent`, `--c-warn-edge` and `--c-danger`. A very dark or very bright web page can weaken a glow, so the pill keeps the state readable on its own; check the glow on a white and on a dark page in both themes.

**Tokens.** No new product tokens. The mock-up adds `--c-warn-edge` (amber for frames and rings: `#C77A00` light, `#F2B552` dark; reaches 3:1 against the page card and the tinted surface where `--c-warn` text colour is too dark for a 2 px line) and the three `--c-page*` tokens used only to draw the fake web pages in the mock-up. **Decision for the team:** add `--c-warn-edge` to the system, or reuse `--sp-amber` (same hue; check 3:1 in both themes).

**New components** (all marked NEW in the HTML):

| Component              | Where                   | What                                                                   |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------- |
| StatusIcon             | everywhere              | 18 px box, 16 px icon, nine states (section 2)                         |
| RunBar                 | chat compact + expanded | State icon, state word, verb and target, tick row, position text, Stop |
| RunPill                | on the page card        | Hangs from the top edge, centred                                       |
| PageFrame              | page card               | glow on the card edge, drawn by the app above the page                 |
| ElementMarker          | page card               | Ring around one element + label                                        |
| AgentCursor            | page card               | Visible mouse pointer + tag, drawn by the app                          |
| RunChip                | sidebar top             | One-line state for workspace-level work                                |
| StepGroup              | step list               | "Reading 3 pages" row with children                                    |
| TabMarker              | sidebar rows, strip     | Dot, sparkle, move/close tags                                          |
| ApprovalCard (changed) | chat or popup layer     | See section 5                                                          |

**Changed existing components:** ToolCallRow (site chip, result line, Details fold, grouped rows, nine states instead of five), ApprovalCard, TabRow (dot variants, tags, dashed outline), SpaceGroup (count badge for "N working"), SidebarStrip (dot on favicon, count on Space icon), ChatBar compact (RunBar replaces the one-line preview while a run is active), UserMessage unchanged.

**Icons:** one new, **stop** (square, 24 px grid, 1.75 px stroke, radius 2). It is also the missing Send→Stop glyph noted in the main hand-off. Everything else is in the current set: check, x, clock, circle, spinner, warn, shield, ban, globe, search, cursor, eye, camera, sparkle, move, history, chat, lock, doc.

## 2. Status language (nine states)

Every state has an icon shape and a word. Colour is never the only signal.

| State                 | Icon             | Tone                         | In the chat                                                        | On the page                                                            | In the sidebar                                                        |
| --------------------- | ---------------- | ---------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Queued                | dashed circle    | `--c-text-3`                 | step greyed                                                        | nothing                                                                | nothing                                                               |
| Running               | spinner          | `--c-accent`                 | blue spinner, run bar "Working"                                    | blue glow on the page border, pill, marker ring                        | blue pulsing dot                                                      |
| Waiting for you       | clock            | `--c-warn` / `--c-warn-edge` | amber row, amber run bar, approval card                            | amber glow on the page border, amber pill and marker                   | amber dot, amber run chip                                             |
| Allowed               | check            | `--c-accent`                 | "Allowed" tag on the row                                           | marker only for the instant before it runs                             | unchanged                                                             |
| Declined              | ban              | `--c-text-2`                 | "Declined by you", run carries on                                  | marker removed                                                         | dot removed                                                           |
| Blocked (safety rule) | shield           | `--c-danger`                 | row names the reason in plain words                                | red glow on the page border and marker with the reason                 | red dot, red chip                                                     |
| Done                  | check            | `--c-ok`                     | one-line result under the row                                      | quiet outlined label ("Typed · Address") until the next step; no frame | dot removed (green dot only when finished and the tab is not in view) |
| Failed                | warning triangle | `--c-danger`                 | reason; "Try again" in the row menu                                | red marker with the reason                                             | none                                                                  |
| Stopped               | square           | `--c-text-2`                 | row says what was half-done; unfinished steps listed as "Not done" | pill reads "Stopped" until dismissed                                   | dot removed                                                           |

Run-level words (run bar and pill): **Working**, **Waiting for you**, **Stuck** (a step is blocked or failed and the run cannot go on), **Finished**, **Stopped**.

## 3. Measurements

| Thing              | Value                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status icon box    | 18 x 18, icon 16 (14 inside pills and badges)                                                                                                                                                                                                                                                                                                     |
| Step row           | min-height 28, padding 4 / 6, gap 8, radius 7; label 13 px, result line 12 px `--c-text-2`                                                                                                                                                                                                                                                        |
| Step group         | child indent 26 px with a 2 px `--c-border` left rule; group icons: up to 3 site favicons overlapped by 4 px                                                                                                                                                                                                                                      |
| Site chip          | the existing Chip, 26 high, 16 px favicon square, max 220 wide                                                                                                                                                                                                                                                                                    |
| Run bar            | min-height 34, padding 4 / 10, radius 9, 1 px border at 40% of the state colour, 12 px text                                                                                                                                                                                                                                                       |
| Tick row           | each tick 12 x 6, radius 3, gap 3; done `--c-ok`, current `--c-accent` (or amber when waiting), to-do 45% grey, not-done dashed outline, stopped grey                                                                                                                                                                                             |
| Run pill           | height 30, radius 0 0 12 12, padding 0 6 0 12, 12 px / 600; sits flush on the card's top edge, centred; max width 94% of the card; inner Stop button 22 high                                                                                                                                                                                      |
| Page frame         | A **glow** on the card edge, not a line: inset shadow, 26 px blur + 4 px spread at 55% of the state colour, plus an 8 px core at 70%; no border; same radius as the card (10). While the assistant is only reading it is a softer 20 px glow at 40% with no core                                                                                  |
| Element marker     | 2 px solid ring, radius 7, plus a 4 px halo at 22% of the colour; label 22 high, 12 px / 600, 6 px above the element (below, to the right, or inside the corner when that would cover content or collide with the pill); "Reading" marker is a 2 px dashed ring with no halo; after the step the halo is removed and the label turns outline-only |
| Marker colours     | accent: about to act; amber: risky or waiting; red: blocked; outline grey: done                                                                                                                                                                                                                                                                   |
| Working dot        | 8 px circle; waiting 8 px amber; stuck 8 px red; "will change" rows (option A) have a 12% tint (10% for close) and a tag, no bar or outline                                                                                                                                                                                                       |
| Assistant cursor   | Arrow 22 x 26, fill state colour, 1.6 px outline in `--c-on-accent`, soft drop shadow; tag pill 20 high, 11 px / 600, offset 16 / 20 from the tip; click burst 38 px radial glow under the tip                                                                                                                                                    |
| Run chip (sidebar) | min-height 28, radius 8, 12 px / 500, tint of the state colour                                                                                                                                                                                                                                                                                    |
| Thumbnail          | 84 x 52 in a step row, 120 x 74 in the hover preview, radius 6, 1 px border                                                                                                                                                                                                                                                                       |
| Approval card      | radius 10, 1 px `--c-border-strong` (amber 2 px edge when risky, accent when it touches your own data); header 8 / 12, body 10 / 12, footer 8 / 12; width: fills the chat column; popup version min(520, 92% of the page)                                                                                                                         |

## 4. The step list (surface 1)

- One row per step: status icon, label with the target in bold, a result line, site chip at the right. The raw tool name and arguments live behind **Details** (shown on hover or keyboard focus; also in the row's context menu; Enter on a focused row toggles it).
- Labels use plain verbs in the tense of the state: "Clicking **Add to cart**" while running, "Clicked **Add to cart**" when done.
- Groups: three or more consecutive reads or looks collapse into one row ("Reading 3 pages") with the sites' icons and a one-line progress ("2 of 3 read"). The group takes the status of its first unfinished child. Expanded while running only if the setting says so; collapsed by default once done.
- Screenshot rows show a small thumbnail and "Kept for this session only". Page reads show a one-line summary ("About 1,800 words"), never the text.
- Recalling the person's own data is grouped in a bordered block titled **Your own data · sent to the model** with a Private badge, so the model boundary is visible.
- Not-done steps after Stop, a block or a closed tab are kept in the list with the dashed circle and the words "not done".

## 5. The approval card (surface 2)

Header: "Needs your OK", site chip, risk badges ("Changes a page", "Can't be undone", "Closes tabs", "Changes your tabs", "Your own data", "Makes a skill", "Asks again: it read web pages"). Body: the question in plain words with the target in bold, then one of: a picture of the element (button, field), the exact text to be typed in a mono box, the cleaned destination of a link, a before/after list for batches (grouped by destination Space), or the **full text** of a skill (scrolls; "Full text · 14 lines"). Then one line saying what happens next. Footer: **Allow**, **Allow the rest of this reply**, **Don't allow**, and the line "If you do nothing, it waits. Nothing happens until you answer."

- Risky cards: amber edge, amber Allow button, no "Allow the rest", Allow needs **Ctrl+Enter**.
- Batches: one card per kind (move, close), shown side by side when the chat is wide.
- Keys (suggested): Enter allows; Shift+Enter allows the rest; Esc does not allow; **Stop** is Ctrl+. in the run bar and pill and always works. Focus goes to the card when it appears; Tab order is Allow, rest, Don't allow, Show on page.
- Page-only view: the same card on the popup layer, bottom-centre of the page card, so it never covers the element.
- Refusals use the same row and reason pattern, not a card: "Not done. I never type into password fields. Sign in yourself, then tell me to carry on."

## 5b. On the page (surface 3)

All drawn by the app in its own layer above the page, never inside it, so a page cannot fake, hide or read it. Cleaned titles and sites only (no query strings or markup). Frame on only while a step touches the page; the marker shows one element at a time; typed text is shown in the step row and approval card, never drawn into the page's field by the overlay.

## 5c. The assistant cursor

A visible mouse pointer for the assistant, so the person can follow what it is doing the way they would follow a colleague's screen share.

- **When:** only while a step acts in the page: click, type, press a key, scroll, choose from a dropdown, go to an address. Looking, reading, finding and screenshots do not show it.
- **Where it lives:** drawn by the app on its own layer above the page, with `pointer-events: none`. It is not the person's pointer, never moves it, and the page cannot see, move or hide it. It sits above the marker and below the pill.
- **Motion:** it travels to the target (about 250 ms ease-out), then the click shows a soft burst under the tip (static radial glow, about 150 ms). Typing swaps the arrow for an I-beam in the field with the tag "Typing". Scrolling shows the tag "Scrolling ↓" or "↑". Under reduced motion it jumps to the target and the burst is a static glow; nothing needs motion to be understood.
- **States:** blue (accent) while acting; amber with the tag "Waiting for you" while an approval is pending: it rests above the target with no burst; **no cursor** when blocked (the red marker and reason explain) and after Stop, finish, or a closed tab.
- **Tag:** a short plain verb ("Clicking", "Typing", "Scrolling ↓"), 11 px / 600, state colour fill, `--c-on-accent` text (dark text on amber).
- **Does not linger:** it is removed when the step ends and reappears at the next acting step; it never stays parked on the page between steps.
- **Safety:** the cursor shows what will happen at the target, not a promise: risky steps still wait for the approval card first, and the cursor stays amber until the person answers. The element under the cursor is the same one named in the marker label and the card.
- Setting (suggested): Show the assistant's cursor: On / Off. Off keeps the marker and the pill.

## 6. Sidebar and strip (surface 4)

- TabRow: working = blue pulsing dot (existing), waiting = amber dot, stuck = red dot, finished (tab not in view) = green dot until opened. Sparkle after the title = opened by the assistant (title text "Opened by the assistant" on hover).
- A batch waiting for approval: rows that will move get a 12% blue tint and a "→ Space" tag; rows that will close get a 10% red tint and a "Close" tag (option A below; no bars, rails or outlines). They clear on approve, decline or Stop.
- **Tab-management marker options** (all shown in section 6b of the HTML, same state in each): **A** tint and tags, no bar or outline (used in the scenarios, recommended: reads like a selection state the sidebar already has); **B** filled tag pills only (quietest, easiest to miss); **C** arrow or ✕ badge on the favicon plus the tag (survives a collapsed strip); **D** before and after with ghost rows in the destination Spaces and faded originals (shows the result before approving, tallest); **E** a ticked checkbox per tab so single tabs can be left out of the batch (most control, adds a control to every row). Each clears on approve, decline or Stop and always pairs colour with a word.
- SpaceGroup header shows an "N working" badge; collapsed it shows the dot colour of its most urgent child.
- Run chip at the top of the sidebar: one line, state icon + "Assistant is working in 3 tabs / waiting for you · 2 changes / is stuck · needs you". Appears only while a run is active.
- Collapsed strip: the same dot on the favicon, a count on the Space icon. Hover opens the sidebar as before.

## 7. Views (surface 5)

- **Page only:** frame + pill + marker + strip dot are the whole interface. Hover or focus the pill to open the last three steps; approvals appear as the popup-layer card. Esc or Dismiss clears a finished/stopped pill.
- **Page and chat:** chat run bar and page pill both show; the pill is the compact one, the run bar the detailed one. Do not show both at full detail: the pill omits tick row and result text.
- **Chat only:** the run bar is followed by a "Working on" card: site chip, cleaned title, Space pill, and a small screenshot on hover or in the card (setting). Step rows keep their site chips. The sidebar shows the chat list with the working chat marked by the dot.

## 8. Run-level moments (surface 7)

Starting: run bar "Working · Thinking…", no ticks yet. Page loading: running row "Waiting for **Shop D** to load" with a plain note. Waking a sleeping tab: running row with a "Was asleep" badge. Tab closed by the person: step shown as stopped with "You closed this tab, so this step was skipped." Limit reached: neutral banner (not an error): "I stopped at 25 actions. Done: … Left: …" with **Continue for 25 more** and **That's enough**. Stop: run bar becomes "Stopped by you", unfinished steps listed as not done, **Continue** is the one visible action. Finished: green run bar and pill with an Open button for what was made. Finished while elsewhere: the existing "Reply waiting" marker plus the green dot; no popups.

The Finished and Stopped pills stay until dismissed (click, Esc, or the next prompt). Nothing times out, so an old frame can never be mistaken for current work.

## 9. Motion

Two loops, both already in the system: spinner (1 s linear) and the working dot (1.4 s opacity pulse). The cursor makes one short move per acting step (about 250 ms) and a click burst (about 150 ms); both are removed under reduced motion. Everything else is static: frame, pill, markers and run bar appear and disappear with the existing 220 ms fade (0 ms under reduced motion). With reduced motion the spinner becomes a static three-quarter arc with the word "Running" next to it, and the dot is solid. The mock-up has a switch to see this. Nothing needs motion to be understood.

## 10. Accessibility

Run bar and pill are `role="status"` (polite): they announce state changes ("Waiting for you. Press Place order"), not every step. The approval card is `role="group"` labelled "Approval needed" and takes focus when it appears. Status icons have text labels. All text 4.5:1, all lines and rings 3:1 in both themes. The page overlay is not focusable except Stop.

## 11. Settings-worthy (suggested names)

| Setting                                  | Options                                         | Default                           |
| ---------------------------------------- | ----------------------------------------------- | --------------------------------- |
| Show the assistant's work on pages       | Border glow and marker, Border glow only, Off   | Border glow and marker            |
| Show the assistant's cursor              | On, Off                                         | On                                |
| Keep the "Finished" pill until dismissed | On, Off                                         | On                                |
| Screenshot thumbnails in the chat        | On, Off                                         | On                                |
| Step detail                              | Summary (groups only), Steps, Steps and results | Steps and results                 |
| Expand groups while running              | On, Off                                         | Off                               |
| Sidebar markers                          | Dots and tags, Dots only                        | Dots and tags                     |
| Notification when it needs you           | Off, Only when waiting, Always                  | Off (suggested; not in the brief) |

Not settings: the state words, the amber waiting state, risk badges, Stop, the approval card contents, the reason shown on a refusal.

## 12. Scenarios in the HTML

1 Research (reading, grouped, one web-search ask); 2 A form (typing, dropdown, risky Submit); 3 Organising (list, move batch, close batch, sidebar markers, no page frame); 4 Blocked (sign-in page, screenshot asked, password refused); 5 Making things (artifact saved, skill with full text); 6 Interrupted (Stop at step 4 of 7); 7 Page only, working (strip, border glow, pill with steps open, marker, cursor); 7b Page only, waiting (popup-layer approval); 8 Chat only (which page without the page).

## 13. Assumptions and open questions

1. Keys are suggested: Ctrl+. for Stop, Enter / Shift+Enter / Esc / Ctrl+Enter for the card. Check against the global shortcut list.
2. The plan length ("Step 5 of 6") is only shown when the assistant has stated a plan; otherwise "Step 4 · up to 25". The tick row then has no to-do ticks.
3. "Stuck" is a run-level word the tools do not produce today; it is derived when a step is blocked or failed and nothing else can run.
4. "Your own data" block and its Private badge assume the model boundary should be visible. Say if recalled results are meant to be hidden in the chat.
5. The assistant's Space pill and site chip use cleaned titles; confirm the cleaning rule (host + path without query) is available in the app layer.
6. Thumbnails: the mock-up draws them as abstract pages; the product would use the real screenshot, session only.
7. Out of scope as briefed: Settings pages, tool shapes, multi-window and incognito, anything about what the assistant may do.

## Files

- `browser-use-visuals.html`: all surfaces and scenarios, light and dark.
- `browser-use-handoff.md`: this note.
