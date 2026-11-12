import { useEffect, useState } from 'react';
import type { ChatsInfo } from './types';
import { Button, IconButton } from './ui/controls';
import { Icon } from './ui/Icon';

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
          className="input"
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
          style={{ width: compact ? 140 : 220, height: 28 }}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          title="Switch, rename or delete chats"
          aria-label="Chats"
          aria-haspopup="menu"
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
            fontWeight: compact ? 500 : 600,
            maxWidth: compact ? 150 : 300,
            minWidth: 0,
          }}
        >
          <span className="truncate">{active?.title ?? 'Chat'}</span>
          <Icon name="chev-d" />
        </Button>
      )}
      <IconButton
        icon="plus"
        label="New chat"
        size="sm"
        onClick={() => window.browserApi.newChat()}
      />
    </div>
  );
}
