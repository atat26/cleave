import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { ChatList, ChatStrip } from './ChatHistory';
import { SPACE_COLOR_HEX } from './colors';
import { FRAME_COLOR, SIDEBAR_FULL_MIN_WIDTH } from './layout';
import { ResizeHandle } from './ResizeHandle';
import {
  ellipsis,
  iconButtonStyle,
  rowStyle,
  stripButton,
} from './sidebarStyles';
import type { SpaceInfo, TabInfo, UiState } from './types';

// What to write on a tab: its title, else its site name, else "New Tab".
export function labelFor(tab: TabInfo): string {
  if (tab.title) return tab.title;
  try {
    return new URL(tab.url).hostname || 'New Tab';
  } catch {
    return 'New Tab';
  }
}

export function Favicon({ tab }: { tab: TabInfo }) {
  return tab.favicon ? (
    <img
      src={tab.favicon}
      alt=""
      width={16}
      height={16}
      style={{ flexShrink: 0 }}
    />
  ) : (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        background: '#b0b4ba',
        flexShrink: 0,
      }}
    />
  );
}

const showTabMenu = (tab: TabInfo) => (event: ReactMouseEvent) => {
  event.preventDefault();
  window.browserApi.showTabMenu(tab.id);
};

// ---------------------------------------------------------------------------
// Full-width sidebar
// ---------------------------------------------------------------------------

// A small blue dot: the assistant is working in this tab right now.
function WorkingDot() {
  return (
    <span
      role="img"
      aria-label="The assistant is working in this tab"
      title="The assistant is working in this tab"
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        background: '#1a73e8',
        boxShadow: '0 0 0 3px rgba(26, 115, 232, 0.25)',
        flexShrink: 0,
      }}
    />
  );
}

function TabRow({ tab, active }: { tab: TabInfo; active: boolean }) {
  return (
    <div
      onClick={() => window.browserApi.selectTab(tab.id)}
      onContextMenu={showTabMenu(tab)}
      title={labelFor(tab)}
      style={{ ...rowStyle(active), opacity: tab.loaded ? 1 : 0.6 }}
    >
      <Favicon tab={tab} />
      <span style={ellipsis}>{labelFor(tab)}</span>
      {tab.working && <WorkingDot />}
      <button
        type="button"
        aria-label={`Close ${labelFor(tab)}`}
        title="Close tab (Ctrl+W)"
        onClick={(event) => {
          event.stopPropagation(); // Don't also select this tab.
          window.browserApi.closeTab(tab.id);
        }}
        style={iconButtonStyle}
      >
        ×
      </button>
    </div>
  );
}

// A Space: a coloured, collapsible group with a Lead (overview) row and its tabs.
function SpaceGroup({
  space,
  tabs,
  active,
  renameRequest,
  onRenameHandled,
}: {
  space: SpaceInfo;
  tabs: TabInfo[];
  active: UiState['active'];
  // Set when "Rename Space" was chosen from this Space's right-click menu.
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (renameRequest === space.id) {
      setEditing(true);
      onRenameHandled();
    }
  }, [renameRequest, space.id, onRenameHandled]);

  const openMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    window.browserApi.showSpaceMenu(space.id);
  };
  const color = SPACE_COLOR_HEX[space.color];
  const leadActive = active?.kind === 'lead' && active.spaceId === space.id;

  const finishRename = (value: string) => {
    setEditing(false);
    if (value.trim() !== '' && value !== space.name) {
      window.browserApi.renameSpace(space.id, value);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div
        onContextMenu={openMenu}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 28,
          padding: '0 6px',
        }}
      >
        <button
          type="button"
          aria-label={space.collapsed ? 'Expand Space' : 'Collapse Space'}
          title={space.collapsed ? 'Expand' : 'Collapse'}
          onClick={() =>
            window.browserApi.setSpaceCollapsed(space.id, !space.collapsed)
          }
          style={{ ...iconButtonStyle, width: 20, fontSize: 11 }}
        >
          {space.collapsed ? '▶' : '▼'}
        </button>
        {editing ? (
          <input
            autoFocus
            defaultValue={space.name}
            maxLength={60}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => finishRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600 }}
          />
        ) : (
          <span
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
            style={{
              ...ellipsis,
              background: color,
              color: '#fff',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 12,
              fontWeight: 600,
              flex: '0 1 auto',
            }}
          >
            {space.name}
          </span>
        )}
        <span style={{ flex: 1, fontSize: 11, color: '#5f6368' }}>
          {space.collapsed ? ` ${tabs.length}` : ''}
        </span>
        <button
          type="button"
          aria-label={`New tab in ${space.name}`}
          title="New tab in this Space"
          onClick={() => window.browserApi.newTab(space.id)}
          style={iconButtonStyle}
        >
          +
        </button>
      </div>

      {!space.collapsed && (
        <div
          style={{
            borderLeft: `3px solid ${color}`,
            marginLeft: 10,
            paddingLeft: 4,
          }}
        >
          <div
            onClick={() => window.browserApi.selectLead(space.id)}
            onContextMenu={openMenu}
            style={rowStyle(leadActive)}
          >
            <span style={{ width: 16, textAlign: 'center', color }}>★</span>
            <span style={ellipsis}>Overview</span>
          </div>
          {tabs.map((tab) => (
            <TabRow
              key={tab.id}
              tab={tab}
              active={active?.kind === 'tab' && active.id === tab.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FullSidebar({
  state,
  renameRequest,
  onRenameHandled,
}: {
  state: UiState;
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const ungrouped = state.tabs.filter((tab) => tab.spaceId === null);

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
        <span style={{ flex: 1 }}>Tabs</span>
        <button
          type="button"
          aria-label="New Space"
          title="New Space"
          onClick={() => window.browserApi.newSpace()}
          style={{
            ...iconButtonStyle,
            width: 'auto',
            padding: '0 8px',
            fontSize: 12,
          }}
        >
          + Space
        </button>
        <button
          type="button"
          aria-label="New tab"
          title="New tab (Ctrl+T)"
          onClick={() => window.browserApi.newTab(null)}
          style={iconButtonStyle}
        >
          +
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '0 6px 12px', flex: 1 }}>
        {ungrouped.map((tab) => (
          <TabRow
            key={tab.id}
            tab={tab}
            active={state.active?.kind === 'tab' && state.active.id === tab.id}
          />
        ))}
        {state.spaces.map((space) => (
          <SpaceGroup
            key={space.id}
            space={space}
            tabs={state.tabs.filter((tab) => tab.spaceId === space.id)}
            active={state.active}
            renameRequest={renameRequest}
            onRenameHandled={onRenameHandled}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Narrow icon strip (the collapsed sidebar)
// ---------------------------------------------------------------------------

function StripTab({ tab, active }: { tab: TabInfo; active: boolean }) {
  return (
    <div
      onClick={() => window.browserApi.selectTab(tab.id)}
      onContextMenu={showTabMenu(tab)}
      title={labelFor(tab)}
      style={{
        ...stripButton(active),
        opacity: tab.loaded ? 1 : 0.6,
        position: 'relative',
      }}
    >
      <Favicon tab={tab} />
      {tab.working && (
        <span style={{ position: 'absolute', top: 2, right: 2 }}>
          <WorkingDot />
        </span>
      )}
    </div>
  );
}

function StripSpace({
  space,
  tabs,
  active,
}: {
  space: SpaceInfo;
  tabs: TabInfo[];
  active: UiState['active'];
}) {
  const color = SPACE_COLOR_HEX[space.color];
  const leadActive = active?.kind === 'lead' && active.spaceId === space.id;
  const openMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    window.browserApi.showSpaceMenu(space.id);
  };

  return (
    <div
      style={{
        marginTop: 8,
        marginLeft: 3,
        borderLeft: `3px solid ${color}`,
        paddingLeft: 1,
      }}
    >
      <div
        onClick={() => window.browserApi.selectLead(space.id)}
        onContextMenu={openMenu}
        title={`${space.name} overview`}
        style={{ ...stripButton(leadActive), color, fontSize: 14 }}
      >
        ★
      </div>
      {!space.collapsed &&
        tabs.map((tab) => (
          <StripTab
            key={tab.id}
            tab={tab}
            active={active?.kind === 'tab' && active.id === tab.id}
          />
        ))}
      {space.collapsed && tabs.length > 0 && (
        <div
          onClick={() => window.browserApi.setSpaceCollapsed(space.id, false)}
          onContextMenu={openMenu}
          title={`${tabs.length} hidden tab${tabs.length === 1 ? '' : 's'}`}
          style={{
            ...stripButton(false),
            fontSize: 11,
            color: '#5f6368',
          }}
        >
          {tabs.length}
        </div>
      )}
    </div>
  );
}

function Strip({ state }: { state: UiState }) {
  const ungrouped = state.tabs.filter((tab) => tab.spaceId === null);

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
          aria-label="New tab"
          title="New tab (Ctrl+T)"
          onClick={() => window.browserApi.newTab(null)}
          style={iconButtonStyle}
        >
          +
        </button>
      </div>
      <div style={{ overflowY: 'hidden', flex: 1, paddingBottom: 12 }}>
        {ungrouped.map((tab) => (
          <StripTab
            key={tab.id}
            tab={tab}
            active={state.active?.kind === 'tab' && state.active.id === tab.id}
          />
        ))}
        {state.spaces.map((space) => (
          <StripSpace
            key={space.id}
            space={space}
            tabs={state.tabs.filter((tab) => tab.spaceId === space.id)}
            active={state.active}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The sidebar page: opens when you rest the mouse on it, and can be dragged
// wider or narrower. It fills its own view, which the main process sizes and
// layers above the web pages.
// ---------------------------------------------------------------------------

const OPEN_DELAY_MS = 150;

// How wide is this page right now? The app resizes the sidebar's view (sliding
// it open or closed, or following a drag), so the page simply looks at its own
// width to decide whether to draw the full list or just icons.
function useViewWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function Sidebar({
  state,
  renameRequest,
  onRenameHandled,
  chatRenameRequest,
  onChatRenameHandled,
}: {
  state: UiState;
  renameRequest: number | null;
  onRenameHandled: () => void;
  // Set when "Rename chat" was chosen from a chat's right-click menu.
  chatRenameRequest: number | null;
  onChatRenameHandled: () => void;
}) {
  // With only the chat open, the tabs are not relevant: the left panel shows the
  // chat history instead.
  const chatOnly = state.viewMode === 'chat';
  const width = useViewWidth();
  const full = width >= SIDEBAR_FULL_MIN_WIDTH;
  const hoverTimer = useRef<number | undefined>(undefined);

  // Resting the mouse on the strip opens the sidebar after a short delay, so
  // just passing over it does not make it flicker. (Closing is decided by the
  // app, from how far the mouse has moved away.)
  const onMouseEnter = () => {
    if (state.sidebarPinned) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => window.browserApi.hoverSidebar(),
      OPEN_DELAY_MS,
    );
  };
  const onMouseLeave = () => window.clearTimeout(hoverTimer.current);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  return (
    <nav
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        // Same colour as the rest of the frame, so it reads as part of it.
        background: FRAME_COLOR,
        // A shadow shows it floating over the page (when it is open but not pinned).
        boxShadow:
          full && !state.sidebarPinned
            ? '2px 0 8px rgba(0, 0, 0, 0.25)'
            : 'none',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {chatOnly ? (
        full ? (
          <ChatList
            chats={state.chats}
            renameRequest={chatRenameRequest}
            onRenameHandled={onChatRenameHandled}
          />
        ) : (
          <ChatStrip chats={state.chats} />
        )
      ) : full ? (
        <FullSidebar
          state={state}
          renameRequest={renameRequest}
          onRenameHandled={onRenameHandled}
        />
      ) : (
        <Strip state={state} />
      )}
      <ResizeHandle
        kind="sidebar"
        axis="x"
        grows={1}
        measure={() => window.innerWidth}
        title="Drag to resize. Drag all the way left to collapse."
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 8 }}
      />
    </nav>
  );
}
