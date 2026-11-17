# New tab page: hand-off (direction B, "One box")

Status: design approved by the team. Reference build: `newtab.html` (working prototype, open in any browser, review controls at the top are not part of the product). Design canvas boards: States, Behaviour, Stage 2 frames.

## 1. What it is

The new tab page is one large field that takes an address, a search or a request to the assistant. A hint row names what Enter will do before it happens. Under the box sit up to three unfinished items from the current Space ("Pick up") and a row of Space pills. The card is tinted with the current Space colour. There is no bottom chat bar on this page: the box is the composer, so there is never a second input on screen.

## 2. Anatomy and `data-component` names

| Component     | Notes                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `newtab`      | The page card. Container-query root. Background is the Space colour at 8% over `--surface` (token `--card-tint`).                                                    |
| `newtab-box`  | 76 px min height, radius 20, 2 px `--accent` border, `--shadow`. Dashed border when dragging over. Idle: search icon + placeholder. Typing: mode chip + send button. |
| `mode-hint`   | "Enter will" + 3-segment control (Go to, Search `<engine>`, Ask) + "Tab to switch". Shown only while there is text. Live region.                                     |
| `pickup`      | Header, up to 3 rows, optional "Show all N" link.                                                                                                                    |
| `space-pills` | 3 most recent Spaces + "+ N more" + dashed New Space. Current Space filled and outlined.                                                                             |
| Label         | "New tab in [Space pill]", top left of the card.                                                                                                                     |

Sizing: content column 600 px wide at about 1100 px, 760 px at 1920 px (never wider); greeting 24 px, 28 px from a 1200 px card; first content about 16% down the card. At a card width of about 420 px the column is the card minus 16 px gutters and Pick up shows two rows. Rows are 44 px, pills 26 px (info) and 30 px (Space row). These do not scale.

## 3. Tokens

All existing tokens are reused (`--surface`, `--s2`, `--s3`, `--border`, `--bstrong`, `--text`, `--t2`, `--t3`, `--accent`, `--atint`, `--onacc`, `--hover`, `--shadow`, Space colours, `--mix`). Values are in `newtab.html`.

New:

- `--card-tint: 8%`. Card background is `color-mix(in srgb, <space colour> var(--card-tint), var(--surface))`. Text contrast must be checked on the tinted value for every Space colour (QA item).

## 4. New components and icons (flagged)

- Mode hint control (segmented, 3 options, Tab cycles).
- Pick-up row with reveal actions.
- One new icon: **eye** (`eye.svg`), used in the private window note. The lock in the Private badge already exists.

## 5. States

| State                      | Behaviour                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Light use, idle            | Box focused, placeholder "Go to, search, or ask", no hint row. Pick up shows 3 rows. Greeting by time of day.                                                                                                                        |
| Heavy use                  | Pick up still 3 rows plus "Show all N in this Space" (opens the Space overview). Pills: 3 recent + "+ N more". Row never wraps.                                                                                                      |
| First run                  | No Spaces: neutral card, greeting "Welcome.", no Pick up, no pills except New Space, one sentence saying what a Space is. No tour, no promo.                                                                                         |
| Typing                     | Pick up and Space pills hidden. Mode chip + send button appear, hint row appears.                                                                                                                                                    |
| Typing an address          | Mode switches to Go to. Local suggestions list (history and Space items only).                                                                                                                                                       |
| Keyboard focus             | Order: box, mode segments, suggestions, Pick up rows (and their Resume/Hide), Space pills, New Space. Same reveal as hover.                                                                                                          |
| Dragging over              | A link, file or tab dragged onto the page: dashed border, "Drop to add to the box". Dropping adds a chip to "The assistant can see". Nothing is sent.                                                                                |
| Second new tab in a row    | If the previous tab is an untouched new tab: no greeting, no Pick up. Box and Space pills only. Third in a row is the same.                                                                                                          |
| Private window             | Neutral card, "Private window." greeting, Private badge in the toolbar, eye note, no Pick up, no pills, no suggestions, no history-based rows. Box offers Go to and Search only (Ask is off). Same layout so the page does not jump. |
| Narrow card (about 420 px) | See sizing above. Pills scroll sideways.                                                                                                                                                                                             |
| Light / dark               | Tokens only. Private window shown in dark in the canvas but is theme independent.                                                                                                                                                    |

## 6. Behaviour rules

**Arrival.** A new tab opens in the current Space (the Space of the tab it was opened from; with none open, the last active Space). The box takes focus with the caret in it. Ctrl+T and the + button are identical. On launch with no tabs restored the page is the same but the greeting is "Welcome back." and Pick up leads with the last tab. Pages opened from links, bookmarks or other apps never show this page. Ctrl+L still focuses the address bar; the address bar and box share one draft.

**Auto mode** (on by default, can be turned off in Settings):

1. URL-like text (scheme, `www.`, `host.tld/path`, `localhost`) selects **Go to**.
2. Text of **15 words or more** selects **Ask**. The threshold is a single constant (`LONG_WORDS`); the team may raise it to 20.
3. Anything else selects **Search**.
4. The user can override at any time: Tab / Shift+Tab or clicking a segment. A manual choice sticks until the box is emptied. In a private window Ask is not offered and Tab cycles Go to and Search only.

**Enter.** Runs the highlighted mode.

- Go to and Search open in the same tab.
- Ask opens a normal chat in the current Space with the box text as the first message and the chips as linked context. The chat uses the same composer, model and history as the rest of the app.

**Esc.** First press clears the box, second press moves focus to the page. The draft is kept if the user switches tabs and comes back.

**Pick up (suggestions).**

- Source is local activity only, in the current Space, ordered by last touched. A chat with an unread reply shows "Reply waiting". Nothing is fetched, no remote service, no model call to build it.
- Max 3 rows. Hide removes the item from Pick up only; it is not deleted. Resume opens the item.
- Resume, Hide and "Turn off suggestions" appear only on hover or keyboard focus (quiet-UI rule). They are also reachable by Tab, never hover only.
- Turning suggestions off removes the section and header and moves the box up. The same switch is in Settings.
- Hidden when typing, in a private window, in first run and on a second new tab in a row.

**Space pills.** Clicking a pill opens a new tab in that Space. Pills do not wrap.

**Motion.** Nothing on this page animates, so reduced motion needs no special case. Do not add transitions on mount.

## 7. Accessibility

- Box is a combobox, labelled "Go to, search, or ask". The hint row is a live region: a screen reader hears "Enter will Search DuckDuckGo" when the mode changes.
- Pick up is a list with a heading; Space pills are a navigation landmark labelled "Spaces".
- Contrast: text 4.5:1, control borders 3:1 (`--bstrong`), 2 px focus ring with 2 px offset on every control. Mode is never colour only (label + icon).
- Verify the Space-tinted card in both themes for all Space colours.

## 8. Constraints honoured

System fonts only. No images, no network. No favicon tile grid, no news, weather, promo cards or auto-updating content. Personalisation is local only and can be switched off. New tab opens in the current Space.

## 9. Decisions made in review

1. Option B chosen over A (Desk) and C (Shelf).
2. Auto mode is on. Ask is the default from 15 words (try 20 if it triggers too often).
3. Private window: Go to and Search only; Ask off.
4. Lock icon already exists; only the eye icon is new.

## 10. Open items for the team

- Confirm the 15-word threshold with real use (raise to 20 if short questions are mis-routed to Ask).
- Greeting copy per time of day (placeholder: "Monday morning.").
- Whether the Ask box should accept images/files via paste, or only via drop (not specified in the brief).
- Settings copy for "Auto mode" and "Turn off suggestions".

## Files

- `newtab.html`: working reference (state, theme, window size, Space and auto mode controls).
- `eye.svg`: new icon.
- `newtab-handoff.md`: this document.
