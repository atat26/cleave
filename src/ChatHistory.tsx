import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { byRecency } from './chats';
import type { ChatMatch } from './chats';
import { PinButton } from './PinButton';
import { IconButton, ItemEmoji } from './ui/controls';
import { ellipsis, rowStyle, stripButton } from './sidebarStyles';
import type { ChatInfo, ChatsInfo } from './types';

// The chat history and manager. When only the chat is open (the page is
// closed) the left panel shows this instead of your tabs, since the tabs have
// nothing to do with the chat then. Chats are independent of Spaces and tabs.
//
// Right-click a chat to rename or delete it; double-click to rename it in place.

// The most recently used first.
const newestFirst = (chats: ChatsInfo): ChatInfo[] =>
  byRecency(chats.conversations);

const openMenu = (chat: ChatInfo) => (event: ReactMouseEvent) => {
  event.preventDefault();
  window.browserApi.showChatMenu(chat.id, event.clientX, event.clientY);
};

function ChatRow({
  chat,
  active,
  snippet,
  renameRequest,
  onRenameHandled,
}: {
  chat: ChatInfo;
  active: boolean;
  // Search: a piece of what was said that matched (the row is taller with it).
  snippet?: string | null;
  // Set when "Rename chat" was chosen from this chat's right-click menu.
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (renameRequest === chat.id) {
      setEditing(true);
      onRenameHandled();
    }
  }, [renameRequest, chat.id, onRenameHandled]);

  const finishRename = (value: string) => {
    setEditing(false);
    if (value.trim() !== '' && value !== chat.title) {
      window.browserApi.renameChat(chat.id, value);
    }
  };

  return (
    <div
      className="reveal-host"
      onClick={() => window.browserApi.selectChat(chat.id)}
      onDoubleClick={() => setEditing(true)}
      onContextMenu={openMenu(chat)}
      title={chat.title}
      style={
        snippet
          ? { ...rowStyle(active), height: 46, alignItems: 'center' }
          : rowStyle(active)
      }
    >
      <ItemEmoji emoji={chat.emoji} />
      {chat.generating && (
        <span
          role="img"
          aria-label="Writing a reply"
          title="Writing a reply"
          style={{ order: 3, color: 'var(--c-accent)', fontSize: 10 }}
        >
          ●
        </span>
      )}
      {!chat.generating && chat.unread && (
        <span
          role="img"
          aria-label="Reply waiting"
          title="Reply waiting"
          style={{ order: 3, color: 'var(--c-accent)', fontSize: 10 }}
        >
          ●
        </span>
      )}
      {editing ? (
        <input
          autoFocus
          defaultValue={chat.title}
          maxLength={80}
          aria-label="Chat name"
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => finishRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{ flex: 1, minWidth: 0, fontSize: 13 }}
        />
      ) : snippet ? (
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span style={ellipsis}>{chat.title}</span>
          <span
            style={{
              ...ellipsis,
              fontSize: 11,
              color: 'var(--c-text-2)',
            }}
          >
            {snippet}
          </span>
        </span>
      ) : (
        <span style={ellipsis}>{chat.title}</span>
      )}
      {/* Only shown while the pointer (or the keyboard) is on the row. "Delete
          chat" is also in the row's right-click menu. */}
      <IconButton
        icon="x"
        size="sm"
        className="reveal"
        label={`Delete ${chat.title}`}
        title="Delete chat"
        onClick={(event) => {
          event.stopPropagation(); // Don't also select this chat.
          window.browserApi.deleteChat(chat.id);
        }}
      />
    </div>
  );
}

// The full-width list.
export function ChatList({
  chats,
  pinned,
  renameRequest,
  onRenameHandled,
}: {
  chats: ChatsInfo;
  pinned: boolean;
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  // The search box above the list: finds chats by name and by what was said.
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ChatMatch[] | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const text = query.trim();
    if (text === '') {
      setFound(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void window.browserApi.searchChats(text).then((result) => {
        if (current) setFound(result);
      });
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, chats]);
  // "Search chats…" in a menu puts the keyboard here.
  useEffect(
    () =>
      window.browserApi.onFocusChatSearch(() => {
        searchBox.current?.focus();
        searchBox.current?.select();
      }),
    [],
  );
  const byId = new Map(chats.conversations.map((c) => [c.id, c]));
  const shown =
    found === null
      ? newestFirst(chats).map((chat) => ({ chat, snippet: null }))
      : found.flatMap((m) => {
          const chat = byId.get(m.id);
          return chat ? [{ chat, snippet: m.snippet }] : [];
        });

  return (
    <>
      <div
        className="reveal-host"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 10px 0 12px',
          height: 48,
          boxSizing: 'border-box',
          fontWeight: 600,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {/* The new-chat "+" is in the same place (top left) as in the narrow strip. */}
        <IconButton
          icon="plus"
          label="New chat"
          title="New chat"
          onClick={() => window.browserApi.newChat()}
        />
        <span style={{ flex: 1, paddingLeft: 4 }}>Chats</span>
        <PinButton pinned={pinned} />
      </div>
      <div style={{ padding: '0 10px 8px', flexShrink: 0 }}>
        <input
          ref={searchBox}
          type="search"
          className="input"
          value={query}
          placeholder="Search chats"
          aria-label="Search chats"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('');
              e.currentTarget.blur();
            }
          }}
          style={{ width: '100%', height: 28, fontSize: 13 }}
        />
      </div>
      <div style={{ overflowY: 'auto', padding: '0 6px 12px', flex: 1 }}>
        {shown.map(({ chat, snippet }) => (
          <ChatRow
            key={chat.id}
            chat={chat}
            active={chat.id === chats.activeId}
            snippet={snippet}
            renameRequest={renameRequest}
            onRenameHandled={onRenameHandled}
          />
        ))}
        {found !== null && shown.length === 0 && (
          <p
            style={{
              margin: '8px 10px',
              color: 'var(--c-text-2)',
              fontSize: 13,
            }}
          >
            No chats match.
          </p>
        )}
      </div>
    </>
  );
}

// The narrow icon strip: a "+" and one button per chat (its first letter).
export function ChatStrip({ chats }: { chats: ChatsInfo }) {
  return (
    <>
      <div
        style={{
          height: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconButton
          icon="plus"
          label="New chat"
          title="New chat"
          onClick={() => window.browserApi.newChat()}
        />
      </div>
      <div style={{ overflowY: 'hidden', flex: 1, paddingBottom: 12 }}>
        {newestFirst(chats).map((chat) => (
          <div
            key={chat.id}
            onClick={() => window.browserApi.selectChat(chat.id)}
            onContextMenu={openMenu(chat)}
            title={chat.title}
            style={{
              ...stripButton(chat.id === chats.activeId),
              position: 'relative',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {chat.emoji}
            {chat.unread && !chat.generating && (
              <span
                role="img"
                aria-label="Reply waiting"
                title="Reply waiting"
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 3,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--c-accent)',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
