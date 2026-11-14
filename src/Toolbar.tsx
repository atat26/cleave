import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PAGE_INSET, TOOLBAR_HEIGHT, WINDOW_CONTROLS_WIDTH } from './layout';
import type { ViewMode } from './model';
import { NameButton } from './NameButton';
import { describeSite } from './site';
import { zoomLabel } from './zoom';
import type { ChatsInfo } from './types';
import { IconButton, ItemEmoji, Segmented } from './ui/controls';
import { Icon } from './ui/Icon';

interface ToolbarProps {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  // True when no web page is selected (e.g. on a Space's Overview).
  disabled: boolean;
  // The selected page is still loading (the reload button becomes Stop).
  loading: boolean;
  // How far the page is zoomed (1 = 100%); a chip shows when it is not.
  zoom: number;
  // What the middle of the window shows right now.
  viewMode: ViewMode;
  // The chats (the active one's name is shown here when only the chat is open).
  chats: ChatsInfo;
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
          if (e.key === 'Enter') e.currentTarget.blur();
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
  canGoBack,
  canGoForward,
  disabled,
  loading,
  zoom,
  viewMode,
  chats,
}: ToolbarProps) {
  const [text, setText] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the active tab's address, unless the user is typing in the box.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(url);
  }, [url]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    window.browserApi.navigate(text);
    inputRef.current?.blur();
  };

  const site = disabled ? null : describeSite(url);
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
            <div className="addressbar" role="search">
              {site && (
                <span
                  className="site"
                  title={
                    site.secure
                      ? 'The connection to this site is secure'
                      : 'The connection to this site is not secure'
                  }
                >
                  <Icon name={site.secure ? 'lock' : 'warn'} />
                  <span className="truncate">{site.host}</span>
                </span>
              )}
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
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
              {zoom !== 1 && !disabled && (
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
            </div>
          </>
        )}
        <div className="tb-actions">
          <ViewSwitch viewMode={viewMode} />
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
