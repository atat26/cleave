import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { ChatSwitcher } from './ChatSwitcher';
import { PAGE_INSET, PAGE_RADIUS, RAIL_WIDTH } from './layout';
import type { ViewMode } from './model';
import { ResizeHandle } from './ResizeHandle';
import type { ChatsInfo } from './types';

const smallButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 14,
  lineHeight: 1,
  padding: '4px 6px',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#5f6368',
};

// The chat. For now this is the container and the chat management; the
// conversation itself arrives in a later update. It is a card on the frame:
// a compact bar (one row) along the bottom that you can drag taller, an expanded
// look, or, when the page is closed, the whole middle of the window.
//
// `full` is true once it is tall enough for the expanded look. The app keeps
// the --chat, --left and --panel variables up to date while the frame slides.
export function ChatBar({
  full,
  viewMode,
  chats,
  renameRequest,
  onRenameHandled,
}: {
  full: boolean;
  viewMode: ViewMode;
  chats: ChatsInfo;
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const regionRef = useRef<HTMLElement>(null);
  const chatOnly = viewMode === 'chat';

  const closeChat = (
    <button
      type="button"
      aria-label="Close chat"
      title="Close chat (show only the page)"
      onClick={() => window.browserApi.setViewMode('page')}
      style={smallButton}
    >
      ×
    </button>
  );

  return (
    <section
      ref={regionRef}
      aria-label="Chat"
      style={{
        position: 'fixed',
        left: 'var(--left)',
        right: `calc(${RAIL_WIDTH}px + var(--panel))`,
        bottom: 0,
        height: 'var(--chat)',
        boxSizing: 'border-box',
        padding: `0 ${PAGE_INSET}px ${PAGE_INSET}px`,
      }}
    >
      <div
        style={{
          height: '100%',
          boxSizing: 'border-box',
          background: '#ffffff',
          borderRadius: PAGE_RADIUS,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflow: 'hidden',
          fontSize: 13,
        }}
      >
        {/* With only the chat open, its name is shown up in the top strip
            and the chat list is in the sidebar, so no header is needed here. */}
        {full && !chatOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ChatSwitcher
                chats={chats}
                renameRequest={renameRequest}
                onRenameHandled={onRenameHandled}
                compact={false}
              />
            </div>
            <button
              type="button"
              aria-label="Shrink chat"
              title="Shrink chat (Ctrl+J)"
              onClick={() => window.browserApi.toggleChat()}
              style={smallButton}
            >
              ⌄
            </button>
            {closeChat}
          </div>
        )}
        {full && (
          <div style={{ flex: 1, minHeight: 0, color: '#5f6368' }}>
            Your conversation will appear here. Chat arrives in a later update.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!full && (
            <ChatSwitcher
              chats={chats}
              renameRequest={renameRequest}
              onRenameHandled={onRenameHandled}
              compact
            />
          )}
          <input
            disabled
            placeholder="Chat arrives in a later update. Ask anything, or link a tab with @"
            aria-label="Message"
            style={{
              flex: 1,
              minWidth: 0,
              height: 32,
              padding: '0 14px',
              border: '1px solid #d0d0d0',
              borderRadius: 16,
              fontSize: 13,
              background: '#f8f9fa',
              margin: '0 6px',
            }}
          />
          {!full && (
            <>
              <button
                type="button"
                aria-label="Expand chat"
                title="Expand chat (Ctrl+J)"
                onClick={() => window.browserApi.toggleChat()}
                style={smallButton}
              >
                ⌃
              </button>
              {closeChat}
            </>
          )}
        </div>
      </div>
      {viewMode === 'both' && (
        <ResizeHandle
          kind="chat"
          axis="y"
          grows={-1}
          measure={() => regionRef.current?.offsetHeight ?? 0}
          title="Drag to resize. Drag all the way down to shrink to one line."
          style={{
            position: 'absolute',
            top: 0,
            left: PAGE_INSET,
            right: PAGE_INSET,
            height: 8,
          }}
        />
      )}
    </section>
  );
}
