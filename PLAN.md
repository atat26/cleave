# Build plan

- [x] M1: Window, one tab, address bar, back/forward
- [x] M2: Multiple tabs plus a vertical tab list
- [x] M3: Spaces as Chrome-style tab groups (create, rename, recolour, collapse, ungroup, delete, move tabs), a Lead overview tab per Space, collapsible/draggable vertical sidebar, saved to disk
- [x] M4a: Connected frame: left sidebar, top address strip, right rail with resizable panels, bottom chat (compact or expanded) around a rounded page card; everything slides together and is draggable; view modes (page only / both / chat only); context-aware rail (Skills with chat, Extensions with web, Settings always) and left panel (tabs with the page, chat list in chat-only); conversation list (new, switch, rename, delete) saved to its own file
- [x] M4b: Settings panel, encrypted API key storage (Electron safeStorage, main process only), OpenRouter provider adapter with streaming parser, model picker, test connection
- [x] M4c-1: Working chat: streaming replies with Stop and Retry, per-chat history, error messages, pinned models with a model chip, system prompt in Settings, cost line
- [x] M4c-2: Link Spaces and tabs to a chat with `@` (pills in the message box) or "+ Add page"; link chips; links shown as tokens in sent messages (kept after a link is removed; closed tabs can be reopened, which updates every chat that used them); only titles and cleaned addresses reach the model (no query strings)
- [x] M5: Read-only agent: linked pages can be read by the assistant (read_page / list_linked_tabs tools, linked tabs only, 8 reads and 6 rounds per reply, pages treated as untrusted data, no acting or file tools), each read shown in the chat; models record whether they support tools and images, with a note when a model cannot read pages; dev startup watchdog reloads a page that fails to start
- [ ] M5b: Web search tool for the agent (OpenRouter built-in web search first; optional own-key providers or a user-supplied SearXNG address later; results treated as untrusted)
- [x] M6 timeline: a reply keeps thinking, tool calls and answer text in the order they happened; tool calls expand to show exactly what was called
- [x] M6a: look_at_page, a read-only tool that lists a linked page's buttons, links, fields and headings as numbered controls (names cleaned, typed text never shown, password/card fields marked sensitive, capped in size)
- [x] M6b: Acting agent: click, type, press keys, scroll, choose, go to an address, open new tabs (linked automatically); every action but scrolling is approved on a card in the chat (risky ones always ask); never types in password/card/code fields or accepts terms; linked tabs only, 25 actions per reply; the tab it acts in is focused and marked; choice buttons the assistant can offer (click to send); Retry on the newest message and Branch on older ones
- [x] Tools step 1: a list of the assistant's tools with four approval levels (always allow, allow if safe, ask first, never allow), saved in tools.json; safety refusals can never be overridden; defaults match the old behaviour. No screen yet.
- [x] Tools step 2: the Tools panel on the chat rail (a dropdown per tool, a warning before Always allow on tools that change things, Return to default per tool, Reset to defaults, saved in tools.json)
- [x] Tools step 3: web search run by the app (Brave Search key in Settings > Web search; a Search the web tool under Looking and reading; each search approved on a card; results and page controls kept with the call so you can read them; earlier searches remembered so a follow-up can open a result without searching again; links show where they go)
- [x] Chat Markdown, spinner and click fix: assistant replies render Markdown safely (headings, bold, lists, tables, code, links that open as new tabs; no HTML, no images); a spinner shows next to whatever the assistant is doing; clicks work on links below the fold
- [x] Read a link: read_link reads a page by address (or by link number) in a hidden, private, logged-out window without opening a tab; private-network addresses always refused (checked at every step); addresses that did not come from a tab, a search or a page always ask; page text never saved
- [x] Artifacts: documents made inside the browser (Markdown, text, HTML, code), kept in artifacts.json, one Space each. Artifacts panel on the right rail (make, rename, move, delete); an artifact opens as a tab with an autosaving editor that takes over the page area; link artifacts to chats (+ menu or @); Space overviews list pages and artifacts with separate close and delete, and closing a page in a Space keeps it as a closed link; assistant tools read_artifact, create_artifact, create_artifact_in_space and edit_artifact (approval levels in Tools; writing always asks after web content is read in the same reply); saves carry a text revision so a stale editor never overwrites a newer text. Uploads (PDFs, images) and an uploads tab come later.
- [x] Chat round 1, new chat screen: with only the chat showing, an empty chat is a centred screen (greeting, message box, Space pills to link, recent chats to pick up). Empty chats are never kept: "new chat" reuses the empty one and leaving it throws it away. Switching to chat-only from a new-tab page and "+" on the chat (any view) show it; Ctrl+T shows it in chat-only and opens a new tab otherwise.
- [ ] M7: Module system plus builder agent
- [ ] M8: Daily-driver polish

After the agent (M5/M6), in this order of likelihood:

- History: closed tabs, deleted Spaces and chats in one searchable list with Restore. Restoring a chat restores only the chat; linked tabs reopen on demand from their greyed chips. Closed tabs and Spaces expire after 90 days, chats stay until deleted, with a Clear history button
- Full page history (every page visited) and a "find that page I was on" tool for the agent
- Space files: attachments live in Spaces (files and images, shown on the overview page); linking a Space to a chat shares them
- Rich message blocks (buttons, diagrams) rendered in a sandboxed frame with allow-listed actions

## Backlog (ideas, not scheduled)

- Lead tab whiteboard: replace each Space's overview with a whiteboard you can draft on (choose the drawing approach first; `leadData` is already reserved in the saved model). Skipped for now.
- OpenCode provider (only OpenRouter is planned for now; the provider interface leaves room)
- Drag-and-drop tabs between and within Spaces (right-click "Move to Space" covers it for now)
- Remember window size and position
- Separate logins per Space (profiles); currently all Spaces share one cookie jar
- Home page as a centred AI chat prompt / address bar (the new-tab page is one constant, `NEW_TAB_URL`)
- Favicons are loaded straight from each site; consider caching them
- A proper icon set for the rail and chat buttons (they use emoji and text symbols for now)
- Hide or replace the default Windows menu bar (File, Edit, View...)
- Prevent a second copy of the app from starting at the same time (single-instance lock)
- Add `test:e2e` (end-to-end test of the running app)
