# Browser-use visuals: design brief

For the designer (another agent). Companion to `browser-ui.html` and `browser-ui-handoff.md` (the design system: tokens, components, menus). Please read those first and stay inside that language.

## The goal

**While the assistant is working in the browser, it must be obvious, at a glance and without reading, what is going on.**

At any moment the person should be able to answer, in about a second:

1. **Is it working, waiting for me, finished, or stuck?**
2. **Where?** Which tab, which site, which Space.
3. **Doing what?** A plain verb and its target ("Clicking _Add to cart_", "Reading 3 pages", "Closing 4 tabs").
4. **How far along?** Is this the first of many steps, or the last one?
5. **What can I do about it?** Allow, don't allow, stop. And what happens if I do nothing.
6. **What did it find or change?** The result, in plain words.

The assistant can read pages, click and type in them, open and close tabs, and make things. Anything it does to the person's browser or data must be visible and stoppable. Quiet when nothing is happening, unmistakable when something is.

## Context you need

- It is a personal desktop browser (Electron). One user. Light and dark themes (system, light, dark). Nothing here is marketed; clarity beats polish.
- **Layout zones** where a visual could live:
  - **Left sidebar:** tabs and Spaces (tab groups) as rows; can collapse to an icon strip that opens on hover.
  - **Top strip:** back/forward/reload, the address bar, a Space chip, the view switcher, the "…" menu.
  - **Page card:** the web page (or a Space's overview, or an artifact editor) in a rounded card.
  - **Chat:** a bar under the page. It is _compact_ (one line plus a preview of the latest reply) or _expanded_ (a full chat timeline, message box below). It can also take over the whole window.
  - **Right rail:** panels (Tools, Skills, Artifacts, Library, Extensions, Settings), 280 px wide.
  - **Popup layer:** menus and cards drawn above everything, including the page.
- **View modes:** _Page only_ (no chat on screen!), _Page and chat_, _Chat only_ (no page on screen). The visuals must still work in each. In page-only view the person has to see the assistant is working without the chat; in chat-only view they have to see which page it is acting on without seeing it.
- The assistant's reply is a **timeline** in this order: its thinking (collapsed), text, then each tool call as a row, then more text. Today a tool row is one line with a status icon and a plain label (running, waiting, ok, declined, error); expanding it shows raw details.
- **Approvals** today: a card in the chat with the action as text and buttons **Allow**, **Allow the rest of this reply**, **Don't allow** (and **Stop**). Risky actions always ask and show a warning badge and have no "allow the rest".
- **Rule for this project (quiet UI):** no always-visible buttons for secondary actions. Reveal on hover or keyboard focus, or put them in a right-click menu. Only the main action of a view stays visible. Every hidden control needs a keyboard path and a menu equivalent.

## Safety constraints that shape the design

- **Web pages are untrusted.** Anything drawn _on_ the page (a frame, a highlight on the element it is about to click) must be drawn by the app in its own layer above the page, never inside the page, so a page cannot fake it or hide it. Show page titles and addresses only in cleaned form (no query strings, no markup).
- Page text, screenshots and typed text are sensitive. Screenshots shown in the chat would be kept for the session only, never saved. Anything typed into a field is shown to the person before it happens; it never types into password, card or code fields.
- The assistant acts **only in tabs linked to the chat**, and some things are always refused (typing into password/card/code fields, accepting terms or cookies, downloads, private-network addresses). When a refusal happens the person should see _why_, in plain words, in the same place they'd see an action.
- Limits per reply (for example 25 actions): reaching one should read as "I stopped here, and here is where things stand", not an error.

## The actions to visualise

Group them by what the person needs to understand. Names in _italics_ are the tools' plain titles in the app. "Asks" means it asks the person first by default.

**1. Looking (changes nothing; usually just happens)**
_List linked tabs, Look at a page_ (its buttons, links, fields), _Read a page_, _Find text on a page_ (the page scrolls to the match and highlights it), _Read tables_, _Take a screenshot_ (asks on sign-in/account/payment pages), _Read a link_ (reads a page in a hidden private window, no tab opens; asks), _Search the web_ (asks; results listed).
→ Needs: which page, how many, and a calm "reading" feel. A screenshot and a find are the two that have something to _show_.

**2. Acting in a page (changes the page; asks by default)**
_Click_, _Type_ (what text, which field), _Press a key_ (Enter is risky), _Scroll_ (just happens), _Choose from a dropdown_, _Go to an address_ (the destination), _Go back_, _Open a new tab_ (it becomes linked).
→ Needs: the **target in plain words** ("the _Add to cart_ button", "the _Search_ box"), pointed at on the page; the text or address involved; and a clear "this will submit/buy/send" marking for risky ones.

**3. Organising tabs and Spaces (changes the person's workspace; asks)**
_List all tabs_ (sees everything; asks), _Move tabs between Spaces_ (several at once, listed on one card), _Close a tab_ (always asks), _Put a tab to sleep_, _Open a closed tab again_, _Read a Space's note_, _Add to a Space's note_.
→ Needs: a **before/after** feel for a batch ("4 tabs → Space 'Shopping'"), a list of exactly which tabs, and a hint that closing can be undone.

**4. Recalling the person's own data (private; asks)**
_Search your history, Search your bookmarks, Search your earlier chats, Read an earlier chat_.
→ Needs: a distinct "looking through your own history/chats" treatment, because what is found goes to the model; make that visible.

**5. Making things (writes to the app's own store; asks, and always asks again if it has read web pages in the same reply)**
_Save a page as an artifact_, _Bookmark a page_, _Make an artifact_ (in a Space or loose), _Edit an artifact_, _Make a Space_, _Check an HTML artifact for errors_, _Make a skill / Change a skill_ (the **full text** is on the approval card).
→ Needs: what is being created and where; for text, enough of a preview to approve it; a link to open the result afterwards.

**6. Talking back**
_Offer choice buttons_ (the assistant shows buttons to pick from), _Use a skill_ (loads steps it will follow; show the skill's name).

**7. Run-level moments**
Starting (thinking), the wait while a page loads, a sleeping tab being woken to be read, a tab closed by the person mid-task, a limit reached, **the person pressing Stop**, the reply finishing, and the reply finishing while the person is looking elsewhere (a "Reply waiting" marker exists today).

## States every action can be in

_Queued / about to happen_, _running_, _waiting for the person_, _allowed_, _declined by the person_, _blocked by a safety rule_ (with the reason), _done_ (with a result), _failed_ (with a reason), _stopped by the person_. Decide how each looks in the chat, and which of them also appear on the page and in the sidebar.

## Surfaces to design

1. **The step list in the chat** (compact bar and expanded): readable at a glance, grouped when there are many ("Read 3 pages"), each step with the site's icon and name, a status, and a calm way to expand for details (the raw tool name and arguments move behind a "Details" fold).
2. **The approval card:** show where and what, not just a sentence: a site chip, the target described in plain words, what will be typed or where a link goes, the risk level, the three answers, and a keyboard path.
3. **Live on the page** while the assistant acts: a frame or edge treatment around the page card, a small "Assistant is working · Stop" control, and a marker on the exact element it is about to click or type in (and what it did, briefly, afterwards).
4. **Sidebar:** the tab the assistant is working in, the tabs it opened, and the tabs it will change (a batch) marked in a quiet way.
5. **Page-only and chat-only views:** how "it is working" shows with no chat, and "it is working on _this_ page" shows with no page.
6. **Screenshots and page reads in the chat:** a small thumbnail of what it looked at, and a calm way to show "read this page" without dumping text.
7. **Finished and stopped states:** a clear end to a run, so it never looks like it is still working.
8. **Dark and light** for all of the above, and a reduced-motion version (no animation needed to understand anything).

## Scenarios to mock up (please show these, light and dark)

1. **Research:** "Compare prices for this GPU." The assistant searches the web, reads three pages in three tabs, and writes a summary. Mostly reading; many steps; no approvals except a web search.
2. **A form:** it fills in a shipping form (several _Type_ steps, one _Choose from a dropdown_) and then asks to **press Submit**, which is risky.
3. **Organising:** "Tidy my tabs." It lists all tabs (asks), then proposes moving 6 tabs into 2 Spaces and closing 3 (one batch card each).
4. **Blocked:** it reaches a sign-in page: the screenshot asks first, typing in the password field is refused, and the reason is shown.
5. **Making things:** it saves a page as an artifact and proposes a new skill whose full text needs approving.
6. **Interrupted:** the person presses Stop in the middle of step 4 of 7; show what is left undone.
7. **Page-only view,** the assistant working in the background while the person watches the page.

## What to deliver

- An HTML file in the style of `browser-ui.html` (real tokens, light and dark, icons from the same set) showing each surface and each scenario, plus a short hand-off note like `browser-ui-handoff.md`: new tokens or components, measurements, states, motion, and anything that needs a new icon.
- Use the existing components where you can (rows, badges, banners, buttons, chips, the approval card, the tool row). List any you change.
- Say which parts are **settings-worthy** (for example: the live highlight on the page, screenshot thumbnails, how much step detail to show) so they can be added to Settings later.

## Out of scope

Settings pages, the shape of the tools themselves, multi-window and incognito, and any change to what the assistant is allowed to do.
