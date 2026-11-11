import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { ChatComposer } from './ChatComposer';
import { MessageList } from './ChatMessages';
import { ChatSwitcher } from './ChatSwitcher';
import { PAGE_INSET, PAGE_RADIUS, RAIL_WIDTH } from './layout';
import type { ViewMode } from './model';
import { ResizeHandle } from './ResizeHandle';
import type { ChatsInfo, LlmInfo, SpaceInfo, TabInfo } from './types';

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

// The chat. It is a card on the frame: a compact bar (one row) along the bottom
// that you can drag taller, an expanded look with the conversation, or, when the
// page is closed, the whole middle of the window.
//
// `full` is true once it is tall enough for the expanded look. The app keeps
// the --chat, --left and --panel variables up to date while the frame slides.
export function ChatBar({
  full,
  viewMode,
  chats,
  llm,
  tabs,
  spaces,
  activeTabId,
  renameRequest,
  onRenameHandled,
}: {
  full: boolean;
  viewMode: ViewMode;
  chats: ChatsInfo;
  llm: LlmInfo;
  // The Spaces and tabs (for linking them), and the tab you are looking at.
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  activeTabId: number | null;
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const regionRef = useRef<HTMLElement>(null);
  const chatOnly = viewMode === 'chat';
  const chat = chats.conversations.find((c) => c.id === chats.activeId);

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
          <MessageList chatId={chats.activeId} tabs={tabs} spaces={spaces} />
        )}
        {chat && (
          <ChatComposer
            chat={chat}
            llm={llm}
            refs={chats.refs}
            tabs={tabs}
            spaces={spaces}
            activeTabId={activeTabId}
            compact={!full}
            before={
              !full ? (
                <ChatSwitcher
                  chats={chats}
                  renameRequest={renameRequest}
                  onRenameHandled={onRenameHandled}
                  compact
                />
              ) : undefined
            }
            after={
              !full ? (
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
              ) : undefined
            }
            // The "@" list needs room: open the chat up from the one-row bar.
            onNeedRoom={() => {
              if (!full && viewMode === 'both') window.browserApi.toggleChat();
            }}
            // Sending from the one-row bar opens the chat so the reply is visible.
            onSent={() => {
              if (!full && viewMode === 'both') window.browserApi.toggleChat();
            }}
          />
        )}
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
