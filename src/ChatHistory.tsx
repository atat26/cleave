import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  ellipsis,
  iconButtonStyle,
  rowStyle,
  stripButton,
} from './sidebarStyles';
import type { ChatInfo, ChatsInfo } from './types';

// The chat history and manager. When only the chat is open (the page is
// closed) the left panel shows this instead of your tabs, since the tabs have
// nothing to do with the chat then. Chats are independent of Spaces and tabs.
//
// Right-click a chat to rename or delete it; double-click to rename it in place.

// Newest first.
const newestFirst = (chats: ChatsInfo): ChatInfo[] =>
  [...chats.conversations].reverse();

const openMenu = (chat: ChatInfo) => (event: ReactMouseEvent) => {
  event.preventDefault();
  window.browserApi.showChatMenu(chat.id, event.clientX, event.clientY);
};

function ChatRow({
  chat,
  active,
  renameRequest,
  onRenameHandled,
}: {
  chat: ChatInfo;
  active: boolean;
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
      onClick={() => window.browserApi.selectChat(chat.id)}
      onDoubleClick={() => setEditing(true)}
      onContextMenu={openMenu(chat)}
      title={chat.title}
      style={rowStyle(active)}
    >
      <span aria-hidden="true" style={{ filter: 'grayscale(1)' }}>
        💬
      </span>
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
      ) : (
        <span style={ellipsis}>{chat.title}</span>
      )}
      <button
        type="button"
        aria-label={`Delete ${chat.title}`}
        title="Delete chat"
        onClick={(event) => {
          event.stopPropagation(); // Don't also select this chat.
          window.browserApi.deleteChat(chat.id);
        }}
        style={iconButtonStyle}
      >
        ×
      </button>
    </div>
  );
}

// The full-width list.
export function ChatList({
  chats,
  renameRequest,
  onRenameHandled,
}: {
  chats: ChatsInfo;
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  return (
    <>
      <div
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
        <span style={{ flex: 1 }}>Chats</span>
        <button
          type="button"
          aria-label="New chat"
          title="New chat"
          onClick={() => window.browserApi.newChat()}
          style={{
            ...iconButtonStyle,
            width: 'auto',
            padding: '0 8px',
            fontSize: 12,
          }}
        >
          + New chat
        </button>
      </div>
      <div style={{ overflowY: 'auto', padding: '0 6px 12px', flex: 1 }}>
        {newestFirst(chats).map((chat) => (
          <ChatRow
            key={chat.id}
            chat={chat}
            active={chat.id === chats.activeId}
            renameRequest={renameRequest}
            onRenameHandled={onRenameHandled}
          />
        ))}
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
        <button
          type="button"
          aria-label="New chat"
          title="New chat"
          onClick={() => window.browserApi.newChat()}
          style={iconButtonStyle}
        >
          +
        </button>
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
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {chat.title.trim().charAt(0).toUpperCase() || '?'}
          </div>
        ))}
      </div>
    </>
  );
}
