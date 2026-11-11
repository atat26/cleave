# Build plan

- [x] M1: Window, one tab, address bar, back/forward
- [x] M2: Multiple tabs plus a vertical tab list
- [x] M3: Spaces as Chrome-style tab groups (create, rename, recolour, collapse, ungroup, delete, move tabs), a Lead overview tab per Space, collapsible/draggable vertical sidebar, saved to disk
- [x] M4a: Connected frame: left sidebar, top address strip, right rail with resizable panels, bottom chat (compact or expanded) around a rounded page card; everything slides together and is draggable; view modes (page only / both / chat only); context-aware rail (Skills with chat, Extensions with web, Settings always) and left panel (tabs with the page, chat list in chat-only); conversation list (new, switch, rename, delete) saved to its own file
- [ ] M4b: Settings panel, encrypted API key storage (Electron safeStorage, main process only), OpenRouter provider adapter with streaming parser, model picker, test connection
- [ ] M4c: Chat itself: streaming replies with a Stop button, per-conversation history, `@` links to Spaces and tabs (titles and addresses only until M5), error messages
- [ ] M5: Read-only agent ("summarize these tabs"), no clicking yet
- [ ] M6: Acting agent with confirmations, step limit, stop button
- [ ] M7: Module system plus builder agent
- [ ] M8: Daily-driver polish

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
