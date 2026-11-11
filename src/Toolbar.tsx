import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { PAGE_INSET, TOOLBAR_HEIGHT } from './layout';
import type { ViewMode } from './model';
import type { ChatsInfo } from './types';

const buttonStyle: CSSProperties = {
  width: 32,
  height: 32,
  border: 'none',
  borderRadius: 16,
  background: 'transparent',
  fontSize: 18,
  cursor: 'pointer',
};

interface ToolbarProps {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  // True when no web page is selected (e.g. on a Space's Overview).
  disabled: boolean;
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

  const text: CSSProperties = {
    flex: 1,
    minWidth: 0,
    height: 32,
    boxSizing: 'border-box',
    padding: '0 8px',
    fontSize: 18,
    outline: 'none',
  };

  if (editing && active) {
    // While renaming it is a box, so you can see where you are typing.
    return (
      <input
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
        style={{
          ...text,
          border: 'none',
          background: '#ffffff',
          borderRadius: 8,
          fontWeight: 600,
        }}
      />
    );
  }

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      title="Double-click to rename"
      style={{
        ...text,
        display: 'flex',
        alignItems: 'center',
        fontWeight: 600,
        color: '#202124',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {active?.title ?? 'Chat'}
    </div>
  );
}

// At the right end of the address bar, by the page's top corner: a × closes the
// page (leaving the chat on its own). When the chat has been closed instead, a
// "+ Chat" button brings it back.
function PaneButton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'page') {
    return (
      <button
        type="button"
        title="Open the chat"
        onClick={() => window.browserApi.setViewMode('both')}
        style={{
          ...buttonStyle,
          width: 'auto',
          padding: '0 12px',
          fontSize: 13,
        }}
      >
        + Chat
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label="Close page"
      title="Close the page (chat only)"
      onClick={() => window.browserApi.setViewMode('chat')}
      style={buttonStyle}
    >
      ×
    </button>
  );
}

// The strip along the top of the frame: back/forward buttons and the address
// bar. It always shows the active tab's address. It sits on the frame itself
// (no bar of its own), between the sidebar and the right panel; the app keeps
// the --left and --panel variables up to date while those slide (see App.tsx).
export function Toolbar({
  url,
  canGoBack,
  canGoForward,
  disabled,
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

  // With the page closed there is no address to show. The chat's name takes the
  // address bar's place, and the strip offers to bring a web view back.
  if (viewMode === 'chat') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 'var(--left)',
          right: 'calc(var(--rail) + var(--panel))',
          height: TOOLBAR_HEIGHT,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: `0 ${PAGE_INSET}px`,
        }}
      >
        <ChatTitle chats={chats} />
        <button
          type="button"
          title="Add a web view next to the chat"
          onClick={() => window.browserApi.setViewMode('both')}
          style={{
            ...buttonStyle,
            width: 'auto',
            padding: '0 14px',
            fontSize: 13,
            background: '#ffffff',
          }}
        >
          + Web view
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      style={{
        position: 'fixed',
        top: 0,
        left: 'var(--left)',
        right: 'calc(var(--rail) + var(--panel))',
        height: TOOLBAR_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: `0 ${PAGE_INSET}px`,
      }}
    >
      <button
        type="button"
        aria-label="Back"
        title="Back"
        disabled={!canGoBack}
        onClick={() => window.browserApi.goBack()}
        style={{ ...buttonStyle, opacity: canGoBack ? 1 : 0.35 }}
      >
        ←
      </button>
      <button
        type="button"
        aria-label="Forward"
        title="Forward"
        disabled={!canGoForward}
        onClick={() => window.browserApi.goForward()}
        style={{ ...buttonStyle, opacity: canGoForward ? 1 : 0.35 }}
      >
        →
      </button>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        disabled={disabled}
        placeholder={disabled ? 'Space overview' : 'Search or enter address'}
        spellCheck={false}
        style={{
          flex: 1,
          minWidth: 0,
          height: 32,
          marginLeft: 4,
          padding: '0 14px',
          border: 'none',
          background: '#ffffff',
          borderRadius: 16,
          fontSize: 14,
          outline: 'none',
        }}
      />
      <PaneButton viewMode={viewMode} />
    </form>
  );
}
