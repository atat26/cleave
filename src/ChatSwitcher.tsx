import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ChatsInfo } from './types';

const buttonStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 13,
  lineHeight: 1,
  padding: '5px 8px',
  borderRadius: 8,
  cursor: 'pointer',
  color: '#202124',
};

// The conversation's name, with controls to manage your chats: click the name to
// switch chats, start a new one, rename or delete the current one; "+" starts a
// new chat straight away. Chats are independent of Spaces and tabs.
//
// `renameRequest` is set when "Rename chat" is chosen from the menu, which turns
// the name into a text box.
export function ChatSwitcher({
  chats,
  renameRequest,
  onRenameHandled,
  compact,
}: {
  chats: ChatsInfo;
  renameRequest: number | null;
  onRenameHandled: () => void;
  // Narrow look for the one-row chat bar.
  compact: boolean;
}) {
  const active = chats.conversations.find((c) => c.id === chats.activeId);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (renameRequest !== null && renameRequest === chats.activeId) {
      setEditing(true);
      onRenameHandled();
    }
  }, [renameRequest, chats.activeId, onRenameHandled]);

  const finishRename = (value: string) => {
    setEditing(false);
    if (active && value.trim() !== '' && value !== active.title) {
      window.browserApi.renameChat(active.id, value);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      {editing && active ? (
        <input
          autoFocus
          defaultValue={active.title}
          maxLength={80}
          aria-label="Chat name"
          onFocus={(e) => e.target.select()}
          onBlur={(e) => finishRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{ width: compact ? 120 : 200, fontSize: 13 }}
        />
      ) : (
        <button
          type="button"
          title="Switch, rename or delete chats"
          aria-label="Chats"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            // The open chat in the list lines up with the name, and the list
            // runs down from there.
            window.browserApi.showChatMenu(
              undefined,
              box.left,
              box.bottom,
              (box.top + box.bottom) / 2,
            );
          }}
          style={{
            ...buttonStyle,
            fontWeight: compact ? 400 : 600,
            maxWidth: compact ? 130 : 280,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {active?.title ?? 'Chat'} ▾
        </button>
      )}
      <button
        type="button"
        aria-label="New chat"
        title="New chat"
        onClick={() => window.browserApi.newChat()}
        style={{ ...buttonStyle, fontSize: 16, padding: '4px 8px' }}
      >
        +
      </button>
    </div>
  );
}
