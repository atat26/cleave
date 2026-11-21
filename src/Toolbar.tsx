import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { SPACE_COLOR_HEX } from './colors';
import { PAGE_INSET, TOOLBAR_HEIGHT, WINDOW_CONTROLS_WIDTH } from './layout';
import type { ViewMode } from './model';
import { ExtensionActions } from './ExtensionActions';
import { NameButton } from './NameButton';
import { describeSite } from './site';
import { zoomLabel } from './zoom';
import type { DownloadSummary } from './downloadList';
import type { Suggestion } from './suggest';
import type { ChatsInfo, SpaceInfo } from './types';
import { IconButton, ItemEmoji, Segmented } from './ui/controls';
import { Icon } from './ui/Icon';

interface ToolbarProps {
  url: string;
  // Which tab (or document, or nothing) the address belongs to: a different one shows its own address
  // even if the box still has the keyboard.
  tabKey: string;
  canGoBack: boolean;
  canGoForward: boolean;
  // True when no web page is selected (e.g. on a Space's Overview).
  disabled: boolean;
  // The selected page is still loading (the reload button becomes Stop).
  loading: boolean;
  // How far the page is zoomed (1 = 100%); a chip shows when it is not.
  zoom: number;
  // Whether anything on screen can be zoomed (a web page, an image or a PDF).
  zoomable: boolean;
  // The page is bookmarked (the star is filled).
  bookmarked: boolean;
  // Downloads going on, or one that just finished (the indicator shows only then).
  downloads: DownloadSummary;
  // The site's certificate is wrong and you went on anyway: never shown as secure.
  certBypassed: boolean;
  // Pop-ups blocked on this page (the chip shows only when there are some).
  blockedPopups: number;
  // What the middle of the window shows right now.
  viewMode: ViewMode;
  // The chats (the active one's name is shown here when only the chat is open).
  chats: ChatsInfo;
  // The Space you are in, if any (shown as a chip that opens the Space switcher).
  space: SpaceInfo | null;
}

// The active chat's name, as plain text on the frame (not in a box like the
// address bar). Double-click it to rename the chat.
function ChatTitle({ chats }: { chats: ChatsInfo }) {
  const active = chats.conversations.find((c) => c.id === chats.activeId);
  const [editing, setEditing] = useState(false);

  const finish = (value: string) => {
    setEditing(false);
    if (active && value.trim() !== '' && value !== active.title) {
      window.browserApi.renameChat(active.id, value);
    }
  };

  if (editing && active) {
    // While renaming it is a box, so you can see where you are typing.
    return (
      <input
        className="input"
        autoFocus
        defaultValue={active.title}
        maxLength={80}
        aria-label="Chat name"
        onFocus={(e) => e.target.select()}
        onBlur={(e) => finish(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing)
            e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{ flex: 1, minWidth: 0, fontWeight: 600 }}
      />
    );
  }

  return (
    <>
      {active && <ItemEmoji emoji={active.emoji} />}
      <h1
        className="tb-title truncate"
        onDoubleClick={() => setEditing(true)}
        // Right-click for the same menu as a chat's row in the chat list.
        onContextMenu={(event) => {
          if (!active) return;
          event.preventDefault();
          window.browserApi.showChatMenu(
            active.id,
            event.clientX,
            event.clientY,
          );
        }}
        title="Double-click to rename"
      >
        {active?.title ?? 'Chat'}
      </h1>
      {active && <NameButton kind="chat" id={active.id} />}
    </>
  );
}

// The download indicator: only there while something is downloading (with a ring
// that fills as it goes) or for a few seconds after one finishes or fails. Click it
// to open the Downloads list.
const RING = 2 * Math.PI * 14;
function DownloadIndicator({ info }: { info: DownloadSummary }) {
  if (info.active === 0 && info.recent === null) return null;
  const going = info.active > 0;
  const label = going
    ? `${info.active} download${info.active === 1 ? '' : 's'} in progress. Show downloads`
    : info.recent === 'failed'
      ? 'A download failed. Show downloads'
      : 'Download finished. Show downloads';
  return (
    <span className="dl-indicator">
      {going && (
        <svg className="dl-ring" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="14" className="dl-ring-track" />
          <circle
            cx="16"
            cy="16"
            r="14"
            className={
              info.progress === null ? 'dl-ring-bar spin' : 'dl-ring-bar'
            }
            strokeDasharray={
              info.progress === null
                ? `${RING * 0.25} ${RING}`
                : `${RING * info.progress} ${RING}`
            }
          />
        </svg>
      )}
      <IconButton
        icon={going ? 'download' : info.recent === 'failed' ? 'warn' : 'check'}
        label={label}
        onClick={() => {
          // Remembered first, so a panel that is not open yet starts on Downloads.
          try {
            localStorage.setItem('libraryList', 'downloads');
          } catch {
            // Not remembered; the message below still switches an open panel.
          }
          window.browserApi.showLibrary('downloads');
        }}
      />
    </span>
  );
}

const VIEW_ORDER: ViewMode[] = ['page', 'both', 'chat'];
const VIEW_ICON = { page: 'page', both: 'split', chat: 'chat' } as const;

// Page only, page and chat, or chat only: one switch for what used to be two
// buttons. In a narrow toolbar it becomes one button that cycles through them.
function ViewSwitch({ viewMode }: { viewMode: ViewMode }) {
  const next = VIEW_ORDER[(VIEW_ORDER.indexOf(viewMode) + 1) % 3];
  return (
    <>
      <div className="tb-view">
        <Segmented<ViewMode>
          label="View mode"
          value={viewMode}
          onChange={(mode) => window.browserApi.setViewMode(mode)}
          options={[
            { value: 'page', label: 'Page only', icon: 'page', iconOnly: true },
            {
              value: 'both',
              label: 'Page and chat',
              icon: 'split',
              iconOnly: true,
            },
            { value: 'chat', label: 'Chat only', icon: 'chat', iconOnly: true },
          ]}
        />
      </div>
      <IconButton
        className="tb-view-compact"
        icon={VIEW_ICON[viewMode]}
        label="Change view (page, page and chat, chat)"
        onClick={() => window.browserApi.setViewMode(next)}
      />
    </>
  );
}

// The strip along the top of the frame: back, forward and reload, the address
// bar, and the view switch. It sits on the frame itself (no bar of its own),
// between the sidebar and the right panel; the app keeps the --left and --panel
// variables up to date while those slide (see App.tsx). With only the chat open
// there is no address: the chat's name takes the address bar's place.
export function Toolbar({
  url,
  tabKey,
  canGoBack,
  canGoForward,
  disabled,
  loading,
  zoom,
  zoomable,
  bookmarked,
  downloads,
  certBypassed,
  blockedPopups,
  viewMode,
  chats,
  space,
}: ToolbarProps) {
  const [text, setText] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+L (or Alt+D): the keyboard goes to the address bar, with it all selected.
  useEffect(
    () =>
      window.browserApi.onFocusAddress(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }),
    [],
  );

  // Follow the active tab's address, unless the user is typing in the box.
  const urlNow = useRef(url);
  urlNow.current = url;
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(url);
  }, [url]);
  // Another tab was chosen (for example by clicking it in the sidebar, which leaves the box holding
  // the keyboard): show that tab's address, whatever was typed.
  useEffect(() => {
    setText(urlNow.current);
  }, [tabKey]);
  // Pressing Enter sends the address, so leaving the box then must not put the old one back.
  const sent = useRef(false);

  // The suggestions under the address bar (drawn by a view of their own).
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(-1);
  const latest = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);

  const showRows = (next: Suggestion[], index: number) => {
    const box = barRef.current?.getBoundingClientRect();
    if (!box || next.length === 0) {
      window.browserApi.suggestHide();
      return;
    }
    window.browserApi.suggestShow(next, index, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
  };
  const closeSuggestions = () => {
    latest.current++;
    setRows([]);
    setSelected(-1);
    window.browserApi.suggestHide();
  };
  const askSuggestions = (value: string) => {
    const mine = ++latest.current;
    if (value.trim() === '') {
      closeSuggestions();
      return;
    }
    void window.browserApi.suggestQuery(value).then((found) => {
      if (mine !== latest.current) return; // You have typed more since.
      setRows(found);
      setSelected(-1);
      showRows(found, -1);
    });
  };
  // A new page (or a new tab): the list is over.
  useEffect(closeSuggestions, [url]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const row = selected >= 0 ? rows[selected] : undefined;
    if (row) window.browserApi.suggestPick(selected);
    else window.browserApi.navigate(text);
    closeSuggestions();
    sent.current = true;
    inputRef.current?.blur();
  };

  const described = disabled ? null : describeSite(url);
  const site =
    described && certBypassed ? { ...described, secure: false } : described;
  const chatOnly = viewMode === 'chat';

  return (
    <>
      {/* The top strip you drag the window by (the buttons and boxes in the toolbar
        opt out; see .toolbar in components.css). */}
      <div
        className="drag-strip"
        aria-hidden="true"
        style={{ height: TOOLBAR_HEIGHT }}
      />
      <form
        className="toolbar"
        data-loading={loading && !chatOnly ? 'on' : 'off'}
        role="toolbar"
        aria-label="Browser toolbar"
        onSubmit={submit}
        style={{
          position: 'fixed',
          top: 0,
          left: 'var(--left)',
          // Ends before the window's own buttons when no panel is open.
          right: `max(calc(var(--rail) + var(--panel)), ${WINDOW_CONTROLS_WIDTH}px)`,
          height: TOOLBAR_HEIGHT,
          boxSizing: 'border-box',
          padding: `0 ${PAGE_INSET}px`,
        }}
      >
        {chatOnly ? (
          <>
            <div className="tb-chat reveal-host">
              <ChatTitle chats={chats} />
            </div>
          </>
        ) : (
          <>
            <div className="tb-nav">
              <IconButton
                icon="arrow-left"
                label="Back"
                disabled={!canGoBack}
                onClick={() => window.browserApi.goBack()}
              />
              <IconButton
                icon="arrow-right"
                label="Forward"
                disabled={!canGoForward}
                onClick={() => window.browserApi.goForward()}
              />
              <IconButton
                icon={loading ? 'x' : 'reload'}
                label={loading ? 'Stop loading' : 'Reload'}
                disabled={disabled}
                onClick={() =>
                  loading
                    ? window.browserApi.stopLoading()
                    : window.browserApi.reloadPage()
                }
              />
            </div>
            {space && (
              <button
                type="button"
                className="tb-space"
                aria-haspopup="menu"
                aria-label={`Space: ${space.name}. Switch Space (Ctrl+Shift+S)`}
                title={`In the Space “${space.name}”. Switch Space (Ctrl+Shift+S)`}
                style={
                  { '--sp': SPACE_COLOR_HEX[space.color] } as CSSProperties
                }
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  window.browserApi.showSpaceSwitcher(box.left, box.bottom + 4);
                }}
              >
                <span aria-hidden="true" className="tb-space-emoji">
                  {space.emoji}
                </span>
                <span className="tb-space-name truncate">{space.name}</span>
              </button>
            )}
            <div ref={barRef} className="addressbar" role="search">
              {site && (
                <button
                  type="button"
                  className="site"
                  aria-haspopup="menu"
                  title={
                    site.secure
                      ? 'Secure connection. Site permissions'
                      : certBypassed
                        ? 'Not secure: the certificate is not valid. Site permissions'
                        : 'Not secure. Site permissions'
                  }
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    window.browserApi.showSiteMenu(box.left, box.bottom + 4);
                  }}
                >
                  <Icon name={site.secure ? 'lock' : 'warn'} />
                  <span className="truncate">{site.host}</span>
                </button>
              )}
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  askSuggestions(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (
                    rows.length > 0 &&
                    (e.key === 'ArrowDown' || e.key === 'ArrowUp')
                  ) {
                    e.preventDefault();
                    const count = rows.length;
                    const next =
                      e.key === 'ArrowDown'
                        ? selected + 1 >= count
                          ? -1
                          : selected + 1
                        : selected - 1 < -1
                          ? count - 1
                          : selected - 1;
                    setSelected(next);
                    showRows(rows, next);
                  } else if (e.key === 'Escape') {
                    // First Escape closes the suggestions; then it puts the page's address back.
                    e.preventDefault();
                    if (rows.length > 0) closeSuggestions();
                    else {
                      setText(urlNow.current);
                      e.currentTarget.select();
                    }
                  }
                }}
                // A moment's grace, so a click on a suggestion is not lost.
                onBlur={() => {
                  setTimeout(closeSuggestions, 150);
                  // Leaving the box drops what was typed (unless it was just sent).
                  if (sent.current) sent.current = false;
                  else setText(urlNow.current);
                }}
                onFocus={(e) => e.target.select()}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const box = event.currentTarget;
                  window.browserApi.showEditMenu(
                    'address',
                    event.clientX,
                    event.clientY,
                    box.selectionStart !== box.selectionEnd,
                  );
                }}
                disabled={disabled}
                aria-label="Address or search"
                placeholder={
                  disabled ? 'Space overview' : 'Search or enter address'
                }
                spellCheck={false}
              />
              {zoom !== 1 && zoomable && (
                <button
                  type="button"
                  className="zoom-chip"
                  title="Zoom options for this site"
                  aria-haspopup="menu"
                  aria-label={`Zoom ${zoomLabel(zoom)}. Open zoom options`}
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    window.browserApi.showZoomMenu(box.left, box.bottom + 4);
                  }}
                >
                  <Icon name="zoom" />
                  {zoomLabel(zoom)}
                </button>
              )}
              {!disabled && blockedPopups > 0 && (
                <IconButton
                  icon="ext-link"
                  size="sm"
                  aria-haspopup="dialog"
                  label={`${blockedPopups} pop-up${blockedPopups === 1 ? '' : 's'} blocked. Show`}
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    window.browserApi.showPopupsMenu(
                      box.right - 340,
                      box.bottom + 4,
                    );
                  }}
                />
              )}
              {!disabled && /^https?:/i.test(url) && (
                <IconButton
                  icon="star"
                  size="sm"
                  className={bookmarked ? 'star-btn is-on' : 'star-btn'}
                  aria-haspopup="menu"
                  aria-pressed={bookmarked}
                  label={
                    bookmarked
                      ? 'Bookmarked. Bookmark and Space options'
                      : 'Bookmark this page or save it to a Space'
                  }
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    window.browserApi.showStarMenu(
                      box.left - 180,
                      box.bottom + 4,
                    );
                  }}
                />
              )}
            </div>
          </>
        )}
        <div className="tb-actions">
          {!chatOnly && <ExtensionActions />}
          <ViewSwitch viewMode={viewMode} />
          <DownloadIndicator info={downloads} />
          <IconButton
            icon="more"
            label="More: find in page and other tools"
            aria-haspopup="menu"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              window.browserApi.showToolsMenu(box.right, box.bottom + 4);
            }}
          />
        </div>
        <div className="loadbar" aria-hidden="true" />
      </form>
    </>
  );
}
