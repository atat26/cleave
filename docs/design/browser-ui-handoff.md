# Desktop AI browser — UI hand-off (first complete attempt)

Companion to `browser-ui.html`. Every value below exists as a CSS custom property on `:root` in that file (dark overrides on `:root[data-theme="dark"]`). Components carry `data-component="Name"`. Items marked **(suggested)** are mine, not on your list.

Two notes about the HTML file you should know before reading on:

- Icons are written as `<i class="i" data-i="name">` and swapped for `<svg class="i"><use href="#i-name"/></svg>` at load by 5 lines of JS. In the app, write the `<svg>` directly (sprite at the end of the file).
- Context menus are built from one JS data object (`MENUS`) so the gallery, the live right-click menus and section (e) of this document cannot drift apart. The real app should keep that single source too.

---

## (a) Design tokens

### Colour

| Token                  | Light              | Dark                            | Usage                                                                                                                                        |
| ---------------------- | ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--c-frame`            | #E6E9EF            | #121419                         | Window frame, behind cards, sidebar, toolbar, rail                                                                                           |
| `--c-surface`          | #FFFFFF            | #1B1E26                         | Page card, chat, panel, popups, inputs                                                                                                       |
| `--c-surface-2`        | #F4F6FA            | #232731                         | User message bubble, closed cards, code blocks                                                                                               |
| `--c-surface-3`        | #ECEFF5            | #2B303B                         | Favicon placeholder, badges, kbd, progress track                                                                                             |
| `--c-hover`            | rgba(23,27,38,.06) | rgba(233,236,243,.07)           | Hover fill on any row/button/menu item                                                                                                       |
| `--c-active`           | rgba(23,27,38,.12) | rgba(233,236,243,.14)           | Pressed fill                                                                                                                                 |
| `--c-border`           | #DCE0E8            | #2E3340                         | Decorative dividers, card edges                                                                                                              |
| `--c-border-strong`    | #7C869B            | #6D7589                         | Input, button and select borders (≥3:1 against surface)                                                                                      |
| `--c-text`             | #171B26            | #E9ECF3                         | Primary text                                                                                                                                 |
| `--c-text-2`           | #465065            | #B4BBCB                         | Secondary text, icons                                                                                                                        |
| `--c-text-3`           | #5A6479            | #9AA2B5                         | Tertiary text, placeholders (still ≥4.5:1 on surface and frame)                                                                              |
| `--c-on-accent`        | #FFFFFF            | #0E1530                         | Text on accent fill                                                                                                                          |
| `--c-accent`           | #2750D9            | #8EA8FF                         | Primary buttons, links, active state, working dot, focus ring                                                                                |
| `--c-accent-hover`     | #1F42B8            | #A9BDFF                         | Primary button hover                                                                                                                         |
| `--c-accent-tint`      | #E4EAFB            | rgba(142,168,255,.16)           | Selected row, mention pill, pressed toggle                                                                                                   |
| `--c-focus`            | #2750D9            | #8EA8FF                         | Focus ring colour                                                                                                                            |
| `--c-danger` / `-tint` | #B3261E / #FCE9E7  | #FF8F85 / rgba(255,143,133,.14) | Destructive text, error banner, error tool row                                                                                               |
| `--c-warn` / `-tint`   | #8A5300 / #FFF1D6  | #F2B552 / rgba(242,181,82,.14)  | Risky approval, "always allow" warning, conflict banner                                                                                      |
| `--c-ok` / `-tint`     | #11713B / #DDF3E5  | #6FD39A / rgba(111,211,154,.14) | Success, tool ok, "Open" badge                                                                                                               |
| `--c-info` / `-tint`   | #2750D9 / #E4EAFB  | #8EA8FF / rgba(142,168,255,.16) | Info banner                                                                                                                                  |
| `--sp-blue`            | #3B6FE0            | #6C97FF                         | Space colour 1 (bar, dot, pill tint)                                                                                                         |
| `--sp-teal`            | #0F8F83            | #3CC1B3                         | Space colour 2                                                                                                                               |
| `--sp-amber`           | #C77A00            | #F0A93A                         | Space colour 3                                                                                                                               |
| `--sp-rose`            | #D1456B            | #F57FA1                         | Space colour 4                                                                                                                               |
| `--sp-violet`          | #7B55D6            | #A58BFF                         | Space colour 5                                                                                                                               |
| `--sp-green`           | #3F8F2F            | #7CCB63                         | Space colour 6                                                                                                                               |
| `--sp-tint-mix`        | 26%                | 22%                             | How much Space colour is mixed into a pill/icon background. Pill text is always `--c-text`, so contrast does not depend on the Space colour. |

### Shadow

| Token        | Light                                                        | Dark                                                         | Usage                               |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------- |
| `--sh-popup` | 0 10px 32px rgba(15,20,40,.20), 0 1px 3px rgba(15,20,40,.14) | 0 12px 36px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06) | Every popup, menu and hover-sidebar |
| `--sh-card`  | 0 1px 2px rgba(15,20,40,.06)                                 | none                                                         | Cards                               |
| `--sh-drag`  | 0 8px 20px rgba(15,20,40,.25)                                | 0 8px 24px rgba(0,0,0,.6)                                    | Drag ghost                          |

### Single-value tokens (same in both themes)

| Token                                            | Value                                                | Usage                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--font`                                         | Segoe UI Variable Text, Segoe UI, system-ui          | All UI text                                                                                                               |
| `--font-mono`                                    | Cascadia Mono, Consolas                              | Code, tool details, artifact editor                                                                                       |
| `--fs-xs / sm / md / lg / xl / 2xl`              | 12 / 13 / 14 / 16 / 20 / 26 px                       | xs: badges, help. sm: controls, rows, menus. md: chat text, body. lg: panel titles. xl: Space name. 2xl: new-tab heading  |
| `--fw-normal / medium / bold`                    | 400 / 500 / 600                                      |                                                                                                                           |
| `--lh-tight / body`                              | 1.25 / 1.5                                           |                                                                                                                           |
| `--s-1 … s-10`                                   | 4, 8, 12, 16, 20, 24, 32, 40 px                      | Spacing scale (s-1, s-2, s-3, s-4, s-5, s-6, s-8, s-10)                                                                   |
| `--r-sm / md / lg / xl / pill`                   | 6 / 8 / 10 / 14 / 999 px                             | sm: menu items. md: buttons, inputs, rows. lg: page card, chat, panel, cards, menus. xl: popups. pill: chips, address bar |
| `--h-sm / md / lg`                               | 28 / 32 / 40 px                                      | Control heights                                                                                                           |
| `--icon / --icon-lg`                             | 16 / 20 px                                           | Icon sizes                                                                                                                |
| `--inset`                                        | 6 px                                                 | Gap between frame and cards                                                                                               |
| `--w-strip / --w-sidebar / --w-rail / --w-panel` | 48 / 248 / 48 / 340 px                               | Region widths (sidebar and panel are user-resizable)                                                                      |
| `--h-toolbar / --h-chat-compact / --chat-h`      | 48 / 64 / 360 px                                     | Region heights (`--chat-h` resizable)                                                                                     |
| `--dur-fast / med / slow`                        | 120 / 220 / 320 ms                                   | Motion. All go to 0 with `prefers-reduced-motion`                                                                         |
| `--ease-out / --ease-inout`                      | cubic-bezier(.2,.8,.2,1) / cubic-bezier(.65,0,.35,1) | Motion curves                                                                                                             |
| `--focus-ring`                                   | 2px solid `--c-focus`, 2px offset                    | Every focusable control (`:focus-visible` only)                                                                           |

Contrast checked by hand against the pairs in use: text on surface/frame ≥ 5:1 in both themes; accent on white 6.5:1; borders used on controls ≥ 3:1. Please run an automated pass once built.

---

## (b) Layout dimensions

Window minimum 1100 × 700. Everything is one CSS grid: `[sidebar] [main] [panel] [rail]`.

| Region              | Size                                        | Resize limits                                         | Notes                                                                                                                                                                          |
| ------------------- | ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidebar strip       | 48 px wide                                  | fixed                                                 | Collapsed state                                                                                                                                                                |
| Sidebar (pinned)    | 248 px default                              | 200–360 px, drag the right edge (keyboard: ←/→ 16 px) | Occupies a grid column                                                                                                                                                         |
| Sidebar (hover)     | 248 px                                      | fixed                                                 | **Popup window over the page**, `--sh-popup`, right corners 14 px. Closes on mouse leave                                                                                       |
| Toolbar             | 48 px high                                  | fixed                                                 | Sits on the frame, not on a card                                                                                                                                               |
| Page card           | fills remaining height                      | min height 200 px                                     | 10 px radius, 6 px inset left/right/bottom                                                                                                                                     |
| Chat compact        | 64 px high                                  | fixed                                                 | One line                                                                                                                                                                       |
| Chat expanded       | 360 px default, capped at 50% of the column | 200 px – 70% of window height, drag the top edge      |                                                                                                                                                                                |
| Chat only           | fills the column                            |                                                       | Page card collapses to 0                                                                                                                                                       |
| Right panel         | 340 px default                              | 280–560 px; dragging below 220 px closes it           | Opens left of the rail, 6 px inset top/bottom                                                                                                                                  |
| Rail                | 48 px                                       | fixed                                                 |                                                                                                                                                                                |
| Centre column (min) | 420 px                                      |                                                       | **Rule:** if opening the panel or pinning the sidebar would push the centre below 420 px, collapse the sidebar to the strip first, then shrink the panel to its 280 px minimum |

Toolbar container queries (the toolbar is its own container): below 640 px the pinned extension icons fold into the puzzle menu; below 560 px the downloads button folds into the "⋯" menu and the site chip loses its label; below 470 px the three-way view switch becomes one cycle button.

Check at 1100 × 700: sidebar pinned (248) + panel (340) + rail (48) leaves 464 px centre. With the sidebar collapsed the centre is 664 px.

---

## (c) Component inventory

Shared states for every control: **default, hover** (`--c-hover`), **active** (`--c-active`), **focus** (`--focus-ring`, keyboard only), **disabled** (45% opacity, no pointer). "Loading" and "error" apply only where listed.

### Shared components

| Component           | Contains                                                                                                         | States                                                                                                           | Spacing                                                             | Tokens                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Button `.btn`       | Label and/or icon. Variants: secondary (default), primary, ghost, danger, icon-only. Sizes sm 28 / md 32 / lg 40 | all shared + loading (spinner replaces icon) + pressed (`aria-pressed`: accent tint)                             | padding 0 12 px, gap 8, radius `--r-md`                             | `--c-border-strong`, `--c-accent`, `--c-on-accent`, `--c-danger` |
| Input / Textarea    | Text field, optional help text                                                                                   | + error (danger border + help text)                                                                              | height 32, padding 0 12, radius md                                  | `--c-border-strong`, `--c-focus`                                 |
| Dropdown `.select`  | Native `<select>` with chevron                                                                                   | + open (native list for now)                                                                                     | as input, right padding 28                                          | same as input                                                    |
| Switch              | Track + knob, `role="switch"`                                                                                    | on/off, focus, disabled                                                                                          | 34 × 20                                                             | `--c-accent`, `--c-border-strong`                                |
| Segmented `.seg`    | 2–4 icon or text buttons                                                                                         | pressed per item, focus                                                                                          | item height 30                                                      | `--c-accent-tint`                                                |
| Tabs                | Text tabs with 2 px underline                                                                                    | selected, hover, focus                                                                                           | padding 8 12                                                        | `--c-accent`                                                     |
| Chip `.chip`        | Icon, label, open, remove                                                                                        | default, hover, **closed** (dashed, grey, "Reopen"), focus                                                       | height 28, radius pill, max 200                                     | `--c-surface-2`, `--c-border`                                    |
| Pill `.pill`        | Space name or @mention                                                                                           | default; mention variant                                                                                         | height 22, radius pill                                              | `--sp-*`, `--sp-tint-mix`, `--c-accent-tint`                     |
| Badge               | Short status text                                                                                                | neutral, ok, warn, danger, ai ("Suggested")                                                                      | height 18, 11 px bold                                               | status tints                                                     |
| Space icon `.sicon` | One emoji on a tinted square                                                                                     | default, **suggested** (dashed accent ring)                                                                      | 22 × 22, radius 6                                                   | `--sp-*`                                                         |
| List row `.lrow`    | Icon, label, trailing actions                                                                                    | default, hover (shows hover-only actions), **active** (current), focus, disabled                                 | min-height 32, padding 0 8, gap 8                                   | `--c-hover`, `--c-accent-tint`                                   |
| Card                | Title, meta, actions                                                                                             | default, hover (border-strong), **closed** (lighter, dashed), selected                                           | padding 12, radius lg                                               | `--c-border`, `--sh-card`                                        |
| Banner              | Icon, message, optional action buttons                                                                           | info, warn, error, ok                                                                                            | padding 12, radius md                                               | status tints                                                     |
| Panel `.panel`      | Header (48 px, title + close) and scrolling body                                                                 | opening/closing (opacity + column width)                                                                         | body padding 12 16 20                                               | `--c-surface`, `--c-border`                                      |
| Popup `.popup`      | Self-contained window: own radius, border, shadow                                                                | enter animation                                                                                                  | padding 12, radius xl, width 260–420                                | `--sh-popup`                                                     |
| ContextMenu `.menu` | Items, separators, headers, submenus                                                                             | item: default, hover, **keyboard focus**, disabled (`aria-disabled`), destructive, submenu-open, "suggested" tag | item height 30, padding 0 8, menu padding 4, min 220 / max 300 wide | `--sh-popup`, `--c-danger`                                       |
| DropIndicator       | 2 px accent line with a dot at the left end                                                                      | visible only while dragging                                                                                      |                                                                     | `--c-accent`                                                     |
| Progress            | 4 px bar                                                                                                         | determinate                                                                                                      |                                                                     | `--c-accent`                                                     |

### Regional components

| Component                                                                                                   | Contains                                                                                                                                                                                                                                                                 | States                                                                                                                 | Notes                                            |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| SidebarStrip                                                                                                | One "+" at the top (new tab; new chat in chat-only view — never a second +), favicons, doc icon per open artifact, one Space icon per Space with a 3 px colour bar on its left, pin button at the bottom (chat icons appear only in chat-only view, never in split view) | default, hover over strip → Sidebar popup opens, active item                                                           | 48 px, buttons 36 × 34                           |
| Sidebar                                                                                                     | Header ("Tabs"/"Chats", **+ Space**, **+**, pin), scroll area, footer "Recently closed"                                                                                                                                                                                  | pinned, hover (popup), dragging, chat-only (chat list replaces tabs)                                                   |                                                  |
| SpaceGroup                                                                                                  | Drag grip (hover), collapse triangle, Space icon, name pill, rename pencil + "+" (hover), count badge (collapsed), body with 2 px coloured left border                                                                                                                   | expanded, collapsed, hover, **drop target** (dashed accent outline), **suggested** (italic name, sparkle, ✓ to accept) |                                                  |
| TabRow                                                                                                      | Favicon, title, blue working dot, close ✕ (hover)                                                                                                                                                                                                                        | default, hover, active, focus, dragging (40% opacity), working                                                         | height 32                                        |
| ArtifactRow                                                                                                 | Doc icon (code icon for HTML), title, ✕                                                                                                                                                                                                                                  | as TabRow                                                                                                              |                                                  |
| Toolbar                                                                                                     | Back, Forward, Reload/Stop, AddressBar, Downloads, pinned extension icons, puzzle, view-mode switch, "⋯"; thin load bar under it                                                                                                                                         | loading (stop icon + load bar), chat-only variant (title + Add web view)                                               | 48 px                                            |
| AddressBar                                                                                                  | Site-info chip (lock + host), input, zoom chip (only when not 100%), bookmark star **(suggested)**                                                                                                                                                                       | default, hover, focus-within, typing (suggestions popup), insecure (warn icon)                                         | pill, height 32, max 760                         |
| PageCard                                                                                                    | One of: web page, SpaceOverview, ArtifactEditor, NewTabPage                                                                                                                                                                                                              |                                                                                                                        |                                                  |
| SpaceOverview                                                                                               | Icon, name (click to rename), counts, **Add** with inline choices, Web pages grid, Artifacts grid                                                                                                                                                                        | card open / closed                                                                                                     | grid min 220 px                                  |
| ArtifactEditor                                                                                              | Title input, kind badge, Saved/Saving, conflict banner, text area                                                                                                                                                                                                        | saved, saving, conflict ("Use the assistant's version" / "Keep mine"), read-only while assistant writes                |                                                  |
| NewTabPage **(suggested)**                                                                                  | Search field, Spaces, recent chats, skills                                                                                                                                                                                                                               |                                                                                                                        |                                                  |
| ChatBar                                                                                                     | Header (ChatHeader), MessageList, LinkChips, banners, Composer                                                                                                                                                                                                           | compact, expanded, chat-only                                                                                           |                                                  |
| ChatHeader                                                                                                  | Chat-name dropdown, New chat, shrink, close chat                                                                                                                                                                                                                         |                                                                                                                        | Hidden in chat-only (title is in the toolbar)    |
| MessageList                                                                                                 | UserMessage, AssistantMessage                                                                                                                                                                                                                                            |                                                                                                                        | `role="log"`, scrolls to newest                  |
| UserMessage                                                                                                 | Text with @pills                                                                                                                                                                                                                                                         |                                                                                                                        | max 80% width                                    |
| AssistantMessage                                                                                            | Markdown, collapsible thinking, ToolCallRows, ApprovalCard, ChoiceButtons, actions                                                                                                                                                                                       | **Retry** on newest only, **Branch** on older, Copy                                                                    |                                                  |
| ToolCallRow                                                                                                 | Status icon, tool icon, label, chevron; details = "Called" and "Found"                                                                                                                                                                                                   | waiting (clock), running (spinner), ok (check), error (red ✕ + badge), declined (ban + badge), expanded                |                                                  |
| ApprovalCard                                                                                                | What it wants, Allow, Allow the rest, Deny                                                                                                                                                                                                                               | normal, **risky** (amber, "Changes a page" badge), resolved                                                            |                                                  |
| ChoiceButtons                                                                                               | Pill buttons                                                                                                                                                                                                                                                             | default, chosen, disabled after choice                                                                                 |                                                  |
| LinkChips                                                                                                   | Chips + "+"                                                                                                                                                                                                                                                              | open, closed ("Reopen")                                                                                                |                                                  |
| Composer                                                                                                    | Text field with @pills, model chip, Send/Stop; in compact also "+" and expand                                                                                                                                                                                            | default, focus-within, sending (Send becomes Stop), disabled (no key)                                                  |                                                  |
| AtPicker                                                                                                    | Search + groups This page / Spaces / Tabs / Artifacts                                                                                                                                                                                                                    | item active, empty                                                                                                     | Popup                                            |
| Rail                                                                                                        | One stack from the top with equal spacing (4 px gap, 36 px buttons), ordered web → chat: Extensions, Library, Artifacts, Skills, Tools. Settings alone at the bottom. In page-only view the chat group hides; in chat-only view Extensions hides                         | pressed, hover, hidden-by-mode                                                                                         |                                                  |
| RightPanel                                                                                                  | Resize edge + one of the panels below                                                                                                                                                                                                                                    |                                                                                                                        |                                                  |
| ToolsPanel                                                                                                  | Groups, each tool: title, summary, approval dropdown, "Return to default", warning banner                                                                                                                                                                                | as listed                                                                                                              |                                                  |
| ArtifactsPanel                                                                                              | "New" form (type + Space), list grouped by Space                                                                                                                                                                                                                         |                                                                                                                        |                                                  |
| SettingsPanel                                                                                               | List → section screen with back link                                                                                                                                                                                                                                     | list, section                                                                                                          | New rows are marked "New"                        |
| LibraryPanel **(suggested)**                                                                                | Tabs History / Downloads / Uploads / Bookmarks                                                                                                                                                                                                                           |                                                                                                                        |                                                  |
| SkillsPanel                                                                                                 | Make a skill, draft card, skill cards with Run                                                                                                                                                                                                                           | draft, saved                                                                                                           |                                                  |
| ExtensionsPanel                                                                                             | Extension rows with pin + enable                                                                                                                                                                                                                                         |                                                                                                                        |                                                  |
| FindBar, DownloadsPopup, PermissionPrompt, SiteInfo, ZoomPopup, ExtensionsMenu, Print and Shortcuts dialogs | Popups                                                                                                                                                                                                                                                                   |                                                                                                                        | All `data-component="Popup"` with `data-variant` |

---

## (d) Icon list (one set, 24 px grid, 1.75 px stroke, round caps)

plus, minus, x, check, chev-d, chev-u, chev-r, arrow-left, arrow-right, reload, retry, star, doc, file, code, folder, layers, sidebar, page, split, chat, lock, search, zoom, download, upload, puzzle, more, grip, settings, tools, sparkle, history, clock, send, pencil, edit, trash, copy, link, warn, info, globe, image, mic, camera, pin, bell, print, ext-link, branch, bookmark, keyboard, eye, cursor, shield, move, circle-x, ban, spinner, play, moon, undo, cut, paste, select-all.

Emoji appear only inside `.sicon` (Space icons). A stop (■) glyph for the Send→Stop state still needs adding to the set.

---

## (e) Context menus

Legend: `—` separator · **(D)** destructive (red) · _(off)_ disabled in the sample state · ▸ submenu · **(suggested)** feature is mine. Shortcuts shown right-aligned.

### Tab (sidebar row, strip favicon) (`tab`)

- New tab below `Ctrl+T`
- Reload `Ctrl+R`
- Duplicate
- —
- Add to chat
- Move to Space ▸
  - Route planning
  - Invoices
  - Q4 vendor research
  - —
  - New Space…
- Copy link
- Save to a Space (bookmark) **(suggested)**
- —
- Reopen closed tab `Ctrl+Shift+T` _(off)_
- Close other tabs
- Close tab `Ctrl+W`

### Space (group header, strip icon) (`space`)

- Open overview
- New tab in Space
- Add Space to chat
- —
- Rename `F2`
- Change icon…
- Suggest icon and name **(suggested)**
- Colour ▸
  - Blue
  - Teal
  - Amber
  - Rose
  - Violet
  - Green
- —
- Collapse
- Close all tabs in Space
- —
- Delete Space… **(D)**

### Space overview “Add” button (`space-add`)

- New page `Ctrl+T`
- New artifact ▸
  - Markdown
  - Text
  - HTML
  - Code
- —
- _Header: From another Space_
- Existing artifact ▸
  - Meeting notes ▸
    - Move here
    - Copy here
  - Quarterly report.html ▸
    - Move here
    - Copy here

### Space overview card (web page) (`overview-card`)

- Open
- Close _(off)_
- Add to chat
- Copy link
- Move to Space ▸
  - Route planning
  - Invoices
  - Q4 vendor research
  - —
  - New Space…
- —
- Delete **(D)**

### Artifact (sidebar row, overview card, panel row) (`artifact`)

- Open
- Close
- Rename `F2`
- Add to chat
- —
- Move to Space ▸
  - Route planning
  - Invoices
  - Q4 vendor research
  - —
  - New Space…
- Take out of Space
- Export as file… **(suggested)**
- —
- Delete **(D)**

### Chat row (chat list) (`chat-row`)

- Open
- Rename `F2`
- Suggest a name **(suggested)**
- Copy as Markdown **(suggested)**
- —
- Delete chat **(D)**

### Chat-name dropdown (chat header) (`chat-switch`)

- _Header: Switch chat_
- Depot schedule summary
- Invoice questions
- Warehouse layout ideas
- —
- Rename
- Delete chat **(D)**

### Chat message (`chat-msg`)

- Copy `Ctrl+C`
- Copy as Markdown **(suggested)**
- Save as artifact **(suggested)**
- —
- Retry (newest message only) _(off)_
- Branch from here

### Link chip (`link-chip`)

- Open
- Reopen _(off)_
- Show in Space
- —
- Remove from chat **(D)**

### Chat “+” menu (`chat-add`)

- Add page ▸
  - This page
  - Fleet maintenance calendar
  - Regional road closures
- Add artifact ▸
  - Route summary
  - Meeting notes
- Upload file… **(suggested)**

### Address bar (`address`)

- Undo `Ctrl+Z` _(off)_
- —
- Cut `Ctrl+X`
- Copy `Ctrl+C`
- Paste `Ctrl+V`
- Paste and go
- —
- Select all `Ctrl+A`

### Composer (`composer`)

- Cut `Ctrl+X` _(off)_
- Copy `Ctrl+C` _(off)_
- Paste `Ctrl+V`
- Select all `Ctrl+A`
- —
- Insert @ link ▸
  - This page
  - Spaces
  - Tabs
  - Artifacts
- Upload file… **(suggested)**

### Web page — empty area (`web-page`)

- Back `Alt+←` _(off)_
- Forward `Alt+→` _(off)_
- Reload `Ctrl+R`
- —
- Add page to chat
- Save to a Space (bookmark) **(suggested)**
- Save page as… `Ctrl+S`
- Print… `Ctrl+P`

### Web page — link (`web-link`)

- Open in new tab
- Open in new tab in Space ▸
  - Route planning
  - Invoices
  - Q4 vendor research
  - —
  - New Space…
- Add link to chat
- —
- Copy link address
- Save link as…

### Web page — image (`web-image`)

- Open image in new tab
- Copy image
- Copy image address
- Save image as…

### Web page — selected text (`web-selection`)

- Copy `Ctrl+C`
- Search the web for “this selected…”
- —
- Add selection to chat
- Ask the assistant about this **(suggested)**

### Sidebar background (`sidebar-bg`)

- New tab `Ctrl+T`
- New Space
- Reopen closed tab `Ctrl+Shift+T`
- —
- Pin sidebar open
- Recently closed…

### Toolbar “⋯” menu (`toolbar-more`)

- Find in page `Ctrl+F`
- Zoom ▸
  - Zoom in
  - Zoom out
  - Reset (100%)
- Print… `Ctrl+P`
- —
- Downloads `Ctrl+J`
- History `Ctrl+H`
- Keyboard shortcuts `Ctrl+/`
- Settings

Common behaviour: opens at the pointer (or under the button for menu buttons) and flips to stay inside the window; ↑/↓ move, Home/End jump, → opens a submenu, ← closes it, Enter activates, Esc closes; focus returns to the element that opened it. Menus are separate popup windows.

---

## (f) Interactions and motion

| What                           | Behaviour                                                                                                                                                                                                                                                                                                                           | Duration / easing  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Sidebar collapse ↔ pinned      | Grid column width animates 48 ↔ 248                                                                                                                                                                                                                                                                                                 | 220 ms, ease-out   |
| Sidebar hover                  | Slides in from 24 px left with fade, as a popup over the page; closes on leave                                                                                                                                                                                                                                                      | 220 ms, ease-out   |
| Right panel open/close         | Grid column width 0 ↔ 340 and panel fades                                                                                                                                                                                                                                                                                           | 220 ms, ease-out   |
| View mode (both / page / chat) | Page card and chat change flex size together; the hidden one fades and loses margin                                                                                                                                                                                                                                                 | 220 ms, ease-out   |
| Chat compact ↔ expanded        | Chat height animates; header, messages and chips appear at the end                                                                                                                                                                                                                                                                  | 220 ms, ease-out   |
| Popups, menus                  | Fade + 4 px drop + scale .98 → 1                                                                                                                                                                                                                                                                                                    | 220 ms, ease-out   |
| Hover/press fills              | Background                                                                                                                                                                                                                                                                                                                          | 120 ms             |
| Space collapse                 | Triangle rotates −90°; body hides                                                                                                                                                                                                                                                                                                   | 120 ms             |
| Working dot                    | Opacity pulses                                                                                                                                                                                                                                                                                                                      | 1.4 s loop         |
| Load bar                       | Scales to 95% and loops while loading                                                                                                                                                                                                                                                                                               | 1.6 s, ease-in-out |
| Spinner                        | Rotation                                                                                                                                                                                                                                                                                                                            | 1 s linear         |
| Drag and drop                  | Ghost row follows pointer (tilted −1.5°); insertion line shows between rows or Space headers; Space header gets a dashed outline and tint when a tab will join it; dropping animates the row into place; Esc cancels. Auto-expand a collapsed Space after hovering it 600 ms. Reordering Spaces uses the grip that appears on hover | 120 ms             |
| Reduced motion                 | All durations become 0                                                                                                                                                                                                                                                                                                              |                    |

Keyboard: every control is a real `<button>`, `<input>`, `<select>` or `[role]` element with a visible focus ring. Resize handles are focusable separators (arrow keys move 16 px). Tab order: sidebar → toolbar → page → chat → panel → rail.

---

## (g) Change list versus the current layout

| Element                                        | Change                                                                                                                                                                  | Reason                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| View-mode buttons ("close page", "close chat") | **Merged** into one three-way switch (Page / Page+chat / Chat) at the right end of the toolbar                                                                          | One obvious place; replaces two buttons whose meaning changed with the mode |
| Chat header "close chat"                       | **Kept**, but now sets Page-only                                                                                                                                        | Same result, still where people look                                        |
| Chat-only title + "Add web view"               | **Moved** inside the same toolbar slot as the address bar                                                                                                               | The toolbar keeps a constant height and position                            |
| Collapsed strip: star per Space                | **Changed** to the Space's icon with a coloured bar; the star stays on the Overview row                                                                                 | The star is now free to mean "Overview"; icons are what you asked for       |
| Space name pill                                | **Added** an icon chip before it and a "suggested" state                                                                                                                | AI-suggested icons and names                                                |
| Sidebar header                                 | **Added** pin button                                                                                                                                                    | Pin was only reachable by hover behaviour                                   |
| Sidebar footer "Recently closed"               | **Added** (suggested)                                                                                                                                                   | Restore closed tabs, Spaces, chats without opening a panel                  |
| Right rail                                     | **Added** Library (history, downloads, uploads, bookmarks)                                                                                                              | One home for all lists of past things                                       |
| Toolbar                                        | **Added** site-info chip, zoom chip, bookmark star (suggested), Downloads, pinned extensions, puzzle, "⋯"                                                               | Standard browser features with a place each                                 |
| Reload button                                  | **Added** (turns into Stop while loading)                                                                                                                               | Standard; load bar under the toolbar                                        |
| Rail order                                     | **Reordered**: web-related buttons at the top, one equally spaced stack from the top, most web-relevant first and most chat-relevant last; Settings alone at the bottom | Reads top-to-bottom as page → chat, matching the layout                     |
| Extensions rail icon                           | **Kept**, plus a puzzle menu in the toolbar                                                                                                                             | Rail = manage, toolbar = use                                                |
| Find in page, zoom, print, shortcut help       | **Added** as popups, reached from "⋯" and shortcuts                                                                                                                     | Don't need permanent buttons                                                |
| Permission prompts, pop-up blocked             | **Added** as popups anchored under the site-info chip                                                                                                                   | Where the user's eye already is                                             |
| Settings                                       | **Added** rows: Default search engine, Appearance, Site permissions (suggested), Keyboard shortcuts                                                                     | New settings you listed                                                     |
| Skills panel                                   | **Filled in**: list, Run, "Make a skill" draft card                                                                                                                     | Was a placeholder                                                           |
| Extensions panel                               | **Filled in**: list with pin and enable                                                                                                                                 | Was a placeholder                                                           |
| Tools panel                                    | **Unchanged** in structure; warning shown inline under the row                                                                                                          | Keeps it with the setting it belongs to                                     |
| Artifact editor conflict banner                | **Restyled** with the shared warn banner                                                                                                                                | Consistent banners                                                          |
| Native context menus                           | **Replaced** by `ContextMenu` popups                                                                                                                                    | As requested                                                                |
| Hover sidebar                                  | **Clarified** as a popup window                                                                                                                                         | Page is OS-drawn                                                            |
| Chat banners                                   | **Kept**, shared banner style                                                                                                                                           |                                                                             |
| New tab page                                   | **Added** (suggested)                                                                                                                                                   | Needed for "+"                                                              |

Nothing was removed.

---

## (h) Proposed build order

1. **Tokens and base**: put all `:root` tokens (light and dark) in one file; base reset; focus ring; reduced-motion switch.
2. **Icon sprite** and an `Icon` component.
3. **Shared controls**: Button, Input, Select, Switch, Segmented, Tabs, Chip, Pill, Badge, SpaceIcon, ListRow, Card, Banner, Progress. Build the "kit" page from the HTML as a visual test.
4. **Popup layer**: one popup-window manager (position, flip, shadow, Esc, focus return, close on blur). Everything after this depends on it.
5. **ContextMenu** component and the menu data; replace native menus one surface at a time (tab, then Space, chat, message…).
6. **Layout shell**: grid with sidebar, toolbar, page card, chat, panel, rail; resize handles; view modes; container queries on the toolbar.
7. **Sidebar** with the new rows (TabRow, ArtifactRow, SpaceGroup), strip, hover popup, pin.
8. **Toolbar** and AddressBar (site chip, zoom chip, loading).
9. **Chat**: compact/expanded, messages, tool rows, approval, link chips, composer, AtPicker, model menu.
10. **Right panels**: Tools, Artifacts, Settings (existing), then fill Skills and Extensions.
11. **Space overview** and **artifact editor** restyle (incl. conflict banner).
12. **Drag and drop** in the sidebar (tab → Space, tab reorder, Space reorder).
13. **Space icons and AI-suggested names** (suggested state, accept/edit).
14. **Library panel**: History (+ Recently closed, Clear), Downloads (toolbar popup + tab), Uploads.
15. **Permission prompts, pop-up handling, find, zoom, print, shortcuts dialog**.
16. **Extensions in the toolbar**: puzzle menu, pinned icons, extension popups.
17. **Skills**: run, "make a skill" flow.
18. **New tab page, bookmarks (suggested), default search engine setting**.
19. Accessibility pass (contrast tool, keyboard walkthrough, screen reader labels) and a 1100×700 / 1920×1080 pass.

---

## (i) Open questions and assumptions

Assumptions:

1. Product name and brand are not decided; accent is a calm blue (#2750D9 / #8EA8FF). Fonts are the Windows system fonts, so no files are loaded.
2. Mock web content, extensions ("Page Notes"), skills and Space names are invented placeholders.
3. History, downloads, uploads and bookmarks share one **Library** rail panel; the toolbar downloads button is a quick view of the same list.
4. A bookmark is "save this page into a Space" (suggested). Closed-but-kept pages remain the Space overview's job.
5. The hover sidebar, permission prompts, menus, find bar, zoom, downloads, extension popups, print and shortcut dialogs are all separate popup windows; there is no dimming scrim over the page, because the page cannot be dimmed from the window UI. Dialogs rely on their own strong shadow instead.
6. The "@" picker and model menu open upward from the composer and can overlap the page card, so they are popups too.
7. The Settings sections beyond Model are shown as list rows only; I drew Model fully.
8. Tool-call status icons use shape as well as colour (check, ✕, ban, clock, spinner).
9. Window chrome (title bar, minimise/close) is the OS or Electron default and not drawn.
10. Space colours are six fixed choices; custom colours are not designed.

Open questions:

- Should Send turn into Stop in place, or should Stop sit beside Send? (I drew Send only; Stop needs the ■ icon.)
- Is "Allow the rest" per message or per chat?
- Where should Space overview "Add → Existing artifact" show the Space picker: an inline list (drawn as a chevron only) or a popup?
- Should the sidebar auto-collapse when the window is narrower than ~1200 px with the panel open (rule in (b) says yes)?
- Do extension popups need to be draggable or resizable?
- Should chat "Branch" create a new chat in the list or a sub-thread?
