# Build plan

- [x] M1: Window, one tab, address bar, back/forward
- [x] M2: Multiple tabs plus a vertical tab list
- [x] M3: Spaces as Chrome-style tab groups (create, rename, recolour, collapse, ungroup, delete, move tabs), a Lead overview tab per Space, collapsible/draggable vertical sidebar, saved to disk
- [ ] M3b: Lead tab whiteboard: replace each Space's overview with a whiteboard you can draft on (choose the drawing approach together first; `leadData` is already reserved in the saved model)
- [ ] M4: Settings, provider adapter (OpenRouter, then OpenCode), streaming chat
- [ ] M5: Read-only agent ("summarize these tabs"), no clicking yet
- [ ] M6: Acting agent with confirmations, step limit, stop button
- [ ] M7: Module system plus builder agent
- [ ] M8: Daily-driver polish

## Backlog (ideas, not scheduled)

- Drag-and-drop tabs between and within Spaces (right-click "Move to Space" covers it for now)
- Remember window size and position
- Separate logins per Space (profiles); currently all Spaces share one cookie jar
- Home page as a centred AI chat prompt / address bar (the new-tab page is one constant, `NEW_TAB_URL`)
- Favicons are loaded straight from each site; consider caching them
- A GitHub check that runs `npm run check` on every pull request
- Add `test:e2e` (end-to-end test of the running app)
