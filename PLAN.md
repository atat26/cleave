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

**Search and between features**

- Ctrl+K quick search across tabs, closed pages, Spaces, artifacts, chats, bookmarks and history, with Go to, Search and Ask.

## Next

- Settings page brainstorm: a planning session before any building. What belongs in Settings and what should not, how it is grouped and found (search?), what each part looks like, and what is missing (for example model and provider choices, privacy, shortcuts, extensions, skills and tools, appearance). Output: a short plan, then branches.
- Settings menu revamp: rework the Settings page's own menu of sections and the sub-sections inside each one (the order, the names, the grouping, what each shows, and how you move between them), following the brainstorm above and keeping the design language and the quiet-UI rule. This is about Settings only, not the toolbar "…" menu.
- AI prompt pipeline inspection: a full review of the life of every feature that calls the model (chat, the assistant's tool use, skills, naming chats and Spaces, quick-search Ask, and so on). For each one, trace what is sent at every stage: the system prompt, the context built from links and pages, the tools offered, the history kept, and what comes back. Then work out what to cut, shrink, reorder or add, to get better behaviour with smaller context windows. Output: a map of each pipeline with token counts, a list of changes, and a way to see exactly what was sent (for example a "what the model saw" view per message).
- Browser-use visuals: polish how the assistant's work looks, both in the chat and on the page (tool calls, approval cards, what it is looking at or clicking). Not designed yet; to be shaped with a designer hand-off, like the new-tab page. Ideas to start from: a clearer live view of what the assistant is doing in a tab, a better look for approval cards and step lists, and a calmer way to show screenshots and page reads in the chat.
- Multiple windows, then incognito (a private window that keeps no history, cookies or chats, plus a private chat mode). Incognito needs multiple windows first.
- Packaging: installer, auto-update, and shipping the extension library's preload file (`node_modules/electron-chrome-extensions/dist/chrome-extension-api.preload.js`) so extension popups work when packaged. Parked until the features are done, since it matters only once there are other users.

## Backlog (ideas, not scheduled)

- Mini-apps: artifacts that can save their own data and be pinned to the rail, so the assistant can build you a small tool (a price tracker, say) that stays.
- AI-generated extensions: the assistant writes a browser extension for you, shown for review and installed only after you approve it. It must never get file-editing tools while it reads web pages.
- More model providers (only OpenRouter today; the provider interface leaves room): OpenCode, and direct providers with your own key.
- More web search providers (only Brave Search today): other search APIs, or a SearXNG address you run yourself.
- Rich message blocks: diagrams and richer buttons in a sandboxed frame with allow-listed actions. (Choice buttons from the assistant already exist.)
- Remember the window's size and position.
- Prevent a second copy of the app from starting at the same time (single-instance lock).
- An end-to-end test of the running app (`npm run test:e2e`).

## Decided against (do not re-propose)

- A whiteboard or notes canvas on Space overviews.
- Separate logins per Space (all Spaces share one profile).
- A built-in password manager or autofill (use extensions).
- Pinned tabs (tried, dropped).
- OpenRouter's built-in web search (the app's own Brave search tool replaces it).
