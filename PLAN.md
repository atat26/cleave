# Build plan

Last cleaned: 2026-11-17. Decisions about scope live here; the detail of how each
feature works is in the code and the git history. Order inside each section is the
order of likelihood.

## Done

**The browser**

- Window, tabs and address bar; a vertical sidebar (pinnable, draggable, collapsible to an icon strip); a custom window frame with no title or menu bar; a connected frame of sidebar, top strip, right rail and bottom chat around a rounded page card.
- A full UI design system (tokens, icons, shared controls), light/dark/system theme, custom menus everywhere, keyboard access (F6 between areas, Alt+arrows, Ctrl+1-9, a shortcuts list), and the "quiet UI" rule (secondary buttons show on hover or focus).
- Find in page, zoom (per site), print, developer tools, full screen (F11 and page videos), middle-click and Ctrl+click, tab sound and mute, popup blocking, error pages.
- History and Recently closed (Ctrl+Shift+T), a Library panel, Recently deleted (chats, artifacts, Spaces and skills can be restored), bookmarks with a star and Save to Space, address-bar suggestions, tab search (Ctrl+Shift+A), the new-tab page (greeting, one smart box, Pick up, @ in the box, file drops, "Reply waiting").
- Downloads (list, indicator, Save as for pages, images and links), site permissions and info card, certificate warning page, privacy and security settings (clear site data), a search engine setting.
- Extensions (Chrome Web Store installs, toolbar buttons and popups, page right-click items, options pages, updates). Password managers are meant to be used as extensions.
- Favicons are cached.

**Spaces**

- Spaces as tab groups with a Lead overview page (pages, artifacts, chats, a note "About this Space", search), drag and drop of tabs, artifacts and Spaces in the sidebar, fast switching (Alt+1-9, Ctrl+Shift+S), duplicate, restore a deleted Space, export as Markdown, sleep a Space (and an optional auto-sleep).

**Artifacts**

- Documents made inside the browser (Markdown, text, HTML, code), opened as tabs with an autosaving editor, syntax highlighting, HTML previews that can run scripts with a per-page "Allow internet" switch; an Artifacts panel; uploads (images, PDFs, text) with an in-app PDF viewer; link artifacts to chats and Spaces; drag from the panel into tabs and chats.
- Right-click a page: Save page as artifact, Save selection as artifact.

**Chat**

- OpenRouter with an encrypted key; streaming, Stop, Retry, Branch, Edit a sent message; model picker and cost line; Markdown replies; a timeline of thinking, tool calls and text; a new-chat screen; search chats, export as Markdown; AI names and emoji for chats, Spaces and artifacts; attachments (images, PDFs, files) the assistant can read.
- Link Spaces, tabs and artifacts to a chat with "@", "+ Add page", or by dragging them from the sidebar (or artifacts from the panel) onto the chat bar. Only titles and cleaned addresses reach the model.

**The assistant (agent)**

- Reads linked pages, sees a page's controls, takes screenshots, finds text, reads tables, acts (click, type, keys, scroll, choose, go to, open tabs) with approvals; reads a link in a hidden private window; searches the web (Brave key); manages tabs and Spaces (list, move, close, sleep, reopen, Space notes); recalls history, bookmarks and earlier chats; saves pages as artifacts, bookmarks, checks HTML artifacts; makes and edits artifacts; offers choice buttons.
- Tools panel: four approval levels per tool, presets (Cautious, Balanced, Hands-off), search, groups. Safety refusals can never be overridden.
- Skills: global reusable instructions with a panel, starters, import/export, "/" in the message box, the assistant using and making them (you approve the full text), and "Make a skill from this chat".

**Browser-use visuals, part 1 (steps and run bar)**

- The assistant's tool calls in the chat are now steps: a status icon with one of seven states (running, waiting for you, done, declined, blocked by a safety rule or limit, failed, stopped), the action with its target in bold, a result line, and the site's icon and name. Three or more page reads in a row fold into one line ("Reading 3 pages"). The raw call is behind a click, and the right-click menu has Show details and Try again; "Try again" (on a failed or cut-off step in the newest reply) asks the assistant to try the step again, in fixed words, through the normal approvals.
- A run bar above the message box says Working, Waiting for you, Stuck, Finished or Stopped, what it is doing, a tick per step, and Stop; the finished, stopped or stuck bar stays until dismissed or the next message. The step count is shown only as "Step N" (no total) because the assistant states no plan yet. Settings it will need (step detail, group expansion) are in the settings list.

**Browser-use visuals, part 2 (approval cards)**

- An approval is now a card: "Needs your OK", the site chip, risk badges (why it is risky, what kind of thing it is, and "Asks again: it read web pages"), the question with its target in bold, then the specifics in their own block (the exact text to type or search for, where a link or address goes, the tabs in a batch, the full text of a skill), a line saying what happens next, and Allow / Allow the rest / Don't allow / Stop. A risky card has an amber edge and amber Allow and no "Allow the rest".
- Keys: Enter allows, Shift+Enter allows the rest, Esc does not allow; a risky card needs Ctrl+Enter (a stray Enter can never do something that cannot be undone). The card takes the keyboard only when you are not typing in a text box. The details come from values the app has already checked and cleaned, never the model's raw words, and are dropped once the step is answered.

**Browser-use visuals, part 3a (the glow and the pill on the page)**

- While the assistant works in the page on screen, the page glows just inside its edge (blue; softer while it only reads; amber and stronger while it waits for you), with a pill hanging from the top: its state, what it is doing, "Step N" and Stop. When it has finished, stopped or got stuck the glow goes and the pill alone stays (a strip at the top, so the page below is usable) until you dismiss it with the x or send your next message. Nothing is drawn for steps that are not about the page on screen (tabs, history, artifacts), and nothing in chat-only view.
- It is a page of the app's own in a view above the web page, so a web page cannot see, move or draw over it. While the glow is up it covers the page, which is fine because the assistant is working there. The app keeps three settings for it in agent-visuals.json (show the work on pages: glow and marker, glow only, or off; keep the Finished pill until dismissed; show the assistant's cursor), with no screen for them until the Settings work.

**Browser-use visuals, part 3b (the marker on the element)**

- While the assistant clicks, types in or chooses from an element of the page on screen, a ring and a short label sit on that exact element: amber "Waiting for you · Search" while its approval is pending, blue "Typing · Search" while it acts, then a grey outline "Typed · Search" for a moment. A step a safety rule blocked shows red "Not done". The label is only the tool's own words and the element's name (never what is typed). It sits above the ring, or below it near the pill, or inside it when there is no room; a ring part off the page is cut to the page, and one that cannot be found is simply not drawn.
- How: when a click, type or choose step is planned, the plan records the element it is about (even when the tool is set to go ahead). The app measures its box through the browser (scrolling it into view as the click would) as soon as the step starts, so the ring is there while it waits for you, converts it for the page's zoom, and draws it in the same full-page overlay as the glow. The assistant's own action and the measuring take turns on the page's debugger, so neither finds it busy. It follows the "show the work on pages" setting (glow and marker, glow only, off).

**Browser-use visuals: approvals pop out over the page**

- With the page showing (page only, or page and chat), a step waiting for your approval pops its card out over the page, at the bottom or, if the marked element is down there, at the top, so the chat no longer opens up to make room and the page keeps its size. The chat shows a one-line note ("Waiting for you: answer in the card on the page") instead. In chat-only view, or if the card cannot be shown, it stays in the chat. The same card and keys either way; a new card takes the keyboard only when you are not typing. The card pops out whatever the "show the work on pages" setting says, because it is a question.
- The overlay passes the mouse wheel on to the page, so the page can be scrolled while the assistant works or waits. The ring on the element is measured again (without scrolling the page back) when the window is resized, the page is zoomed or it is scrolled, and is left out until then, so it is never in the wrong place.

**Browser-use visuals: one place for each fact**

- Each thing is shown once. The state ("Working", "Waiting for you", "Finished") is in the pill on the page while the page shows it; when the pill is not up (page not on screen, the step is not about a page, the display is off) it is the one-line run bar in the chat. The chat's run bar no longer has a Stop: Stop is on the page's pill and on the message box. The approval question is only in the popped-out card (the chat holds a one-line note); in chat-only view it stays in the chat. The list of steps stays in the open chat. Dismissing the "Finished" pill on the page also clears the chat's copy.
- The popped-out card can be minimized (the "−" in its header): it shrinks to the strip at the top, "Waiting for you · <the question>" with Review (brings the card back), Go to tab (when its step is in another tab than the one on screen) and Stop, and the page is yours to scroll and click meanwhile. A new question always pops out again. The card also has a Go to tab button when its step is in another tab. The card shows its own Stop only when the pill (which has one) is not shown.

**Browser-use visuals, part 3c (the assistant's cursor)**

- While a step clicks, types in, chooses from or scrolls the page on screen, a pointer for the assistant glides to where it acts (about a quarter of a second) with a short tag: an arrow in the middle of the element with "Clicking" or "Choosing", a text cursor at the start of the field with "Typing", an arrow in the middle of the page with "Scrolling ↓" or "↑". A click that lands shows a soft glow under the tip for a moment. While you are being asked it is amber, rests just above the element, says "Waiting for you" and does not click.
- It disappears when its step ends (it never sits parked on the page), and is not drawn for a blocked, declined, stopped or failed step, after Stop or finish, in another tab, or while the card is minimized. Reading, looking, finding, pressing a key and going to an address show no cursor (there is no element to point at; the pill says what they do). If the next step starts within two seconds it glides from where the last one ended. With reduced motion it jumps instead of gliding.
- How: it is worked out in the app from the same measured box as the marker (so it points at the element the label and the card name), and drawn in the overlay above the marker and below the pill. When the ring's own label is showing it already says the same words, so the cursor's tag is left off then (it shows with "glow only", and for scrolling, which has no ring). It takes no mouse and moves nothing on the page, and your own pointer is never touched. Turned off by the "show the assistant's cursor" setting (agent-visuals.json); the glow, marker and pill stay.

**Search and between features**

- Ctrl+K quick search across tabs, closed pages, Spaces, artifacts, chats, bookmarks and history, with Go to, Search and Ask.

## About this project

This is a personal browser, built for one person (its owner). It is not going to be sold or marketed, so things that only matter for other users (installers, auto-update, first-run tours, importing from other browsers) are low priority. Order of work: build every feature that needs a setting first, collecting each setting it needs in the list below, then do the Settings brainstorm and revamp last, once everything that lives in Settings exists.

## Next

1. Browser-use visuals: polish how the assistant's work looks, both in the chat and on the page (tool calls, approval cards, what it is looking at or clicking). Designed: the brief, the mock-ups (`browser-use-visuals.html`) and the hand-off are in `docs/design/browser-use/`. Build order, each its own branch: (1) the step list and a run bar in the chat; (2) approval cards; (3) the page overlay (frame and run pill with Stop, then the element marker, then the assistant cursor); (4) sidebar markers and the run chip; (5) page-only and chat-only views; (6) screenshot thumbnails, the "your own data" block, and the run moments (limit, stop, finished). Ideas to start from: a clearer live view of what the assistant is doing in a tab, a better look for approval cards and step lists, and a calmer way to show screenshots and page reads in the chat.
2. AI prompt pipeline inspection: a full review of the life of every feature that calls the model (chat, the assistant's tool use, skills, naming chats and Spaces, quick-search Ask, and so on). For each one, trace what is sent at every stage: the system prompt, the context built from links and pages, the tools offered, the history kept, and what comes back. Then work out what to cut, shrink, reorder or add, to get better behaviour with smaller context windows. Output: a map of each pipeline with token counts, a list of changes, and a way to see exactly what was sent (for example a "what the model saw" view per message). Also decide when the assistant should state a plan up front (so the run bar can show "Step 5 of 6" and tick steps off); the browser-use visuals show a step count only when the assistant has a plan. Also look at what happens when a tool fails: the model is told and decides on its own whether to retry, and the same failing call can repeat until the limits (25 actions, 30 rounds).
3. Multiple windows, then incognito (a private window that keeps no history, cookies or chats, plus a private chat mode). Incognito needs multiple windows first.
4. The small ones, whenever there is a gap: remember the window's size and position, a single-instance lock, and an end-to-end test (`npm run test:e2e`).
5. Settings page brainstorm, then the Settings menu revamp (the Settings page's own menu of sections and the sub-sections inside each one: order, names, grouping, what each shows, how you move between them; Settings only, not the toolbar "…" menu). Done last, after the features above, using the settings list below. Keep the design language and the quiet-UI rule.

## Settings these features will need (a running list)

Add a line here whenever a feature needs a setting, so the Settings work at the end starts from a complete list.

- From browser-use visuals (names are suggestions, defaults in brackets): show the assistant's work on pages: border glow and marker / border glow only / off [glow and marker]; show the assistant's cursor [on]; keep the "Finished" pill until dismissed [on]; screenshot thumbnails in the chat [on]; step detail: summary / steps / steps and results [steps and results]; expand groups while running [off]; sidebar markers: dots and tags / dots only [dots and tags]; notification when it needs you: off / only when waiting / always [off].

## Backlog (ideas, not scheduled)

- Mini-apps: artifacts that can save their own data and be pinned to the rail, so the assistant can build you a small tool (a price tracker, say) that stays.
- AI-generated extensions: the assistant writes a browser extension for you, shown for review and installed only after you approve it. It must never get file-editing tools while it reads web pages.
- More model providers (only OpenRouter today; the provider interface leaves room): OpenCode, local models such as Ollama, and direct providers with your own key.
- More web search providers (only Brave Search today): other search APIs, or a SearXNG address you run yourself.
- Rich message blocks: diagrams and richer buttons in a sandboxed frame with allow-listed actions. (Choice buttons from the assistant already exist.)
- Suggested, not yet decided: agent safety tests (a fixed set of attack and normal scenarios, run whenever prompts or tools change); long-chat context management (summarize or trim old messages, with a "context used" meter); cost controls (a spend warning or limit, per-chat and monthly totals); backup and restore of all your data; session restore after a crash; assistant memory across chats (facts about you).
- Packaging: installer, auto-update, and shipping the extension library's preload file (`node_modules/electron-chrome-extensions/dist/chrome-extension-api.preload.js`) so extension popups work when packaged. Only if it is ever wanted.

## Decided against (do not re-propose)

- A whiteboard or notes canvas on Space overviews.
- Separate logins per Space (all Spaces share one profile).
- A built-in password manager or autofill (use extensions).
- Pinned tabs (tried, dropped).
- OpenRouter's built-in web search (the app's own Brave search tool replaces it).
- Syncing between devices (it would need a peer-to-peer or server solution, which is not planned).
- Marketing the browser or building it for other users.
