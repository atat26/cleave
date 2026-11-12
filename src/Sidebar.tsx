import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { IconButton, ItemEmoji, SpaceIcon } from './ui/controls';
import { Icon } from './ui/Icon';
import { ChatList, ChatStrip } from './ChatHistory';
import { PinButton } from './PinButton';
import { SPACE_COLOR_HEX } from './colors';
import { SIDEBAR_FULL_MIN_WIDTH } from './layout';
import { ResizeHandle } from './ResizeHandle';
import { iconButtonStyle, stripButton } from './sidebarStyles';
import type { ArtifactTabInfo, SpaceInfo, TabInfo, UiState } from './types';

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
        background: 'var(--c-text-3)',
        flexShrink: 0,
      }}
    />
  );
}

const showTabMenu = (tab: TabInfo) => (event: ReactMouseEvent) => {
  event.preventDefault();
  window.browserApi.showTabMenu(tab.id, event.clientX, event.clientY);
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
        background: 'var(--c-accent)',
        boxShadow: '0 0 0 3px var(--c-accent-tint)',
        flexShrink: 0,
      }}
    />
  );
}

// Pressing Enter or Space on a focused row does what clicking it does.
const rowKeys = (open: () => void) => (event: ReactKeyboardEvent) => {
  if (event.target !== event.currentTarget) return; // Not from a button inside.
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    open();
  }
};

// Every row in the sidebar (a tab, an artifact, a Space) is built the same way:
// an icon, a name, the assistant's working dot if it is busy, and buttons that
// show while the mouse is over the row.
function Row({
  active,
  dim = false,
  title,
  onOpen,
  onContextMenu,
  icon,
  children,
  trailing,
}: {
  active: boolean;
  dim?: boolean;
  title: string;
  onOpen: () => void;
  onContextMenu?: (event: ReactMouseEvent) => void;
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={
        active ? 'lrow collapse-actions is-active' : 'lrow collapse-actions'
      }
      role="button"
      tabIndex={0}
      aria-current={active || undefined}
      title={title}
      onClick={onOpen}
      onKeyDown={rowKeys(onOpen)}
      onContextMenu={onContextMenu}
      style={{ opacity: dim ? 0.6 : 1 }}
    >
      {icon}
      <span className="truncate grow">{children}</span>
      {trailing}
    </div>
  );
}

function TabRow({ tab, active }: { tab: TabInfo; active: boolean }) {
  return (
    <Row
      active={active}
      dim={!tab.loaded}
      title={labelFor(tab)}
      onOpen={() => window.browserApi.selectTab(tab.id)}
      onContextMenu={showTabMenu(tab)}
      icon={<Favicon tab={tab} />}
      trailing={
        <>
          {tab.working && <WorkingDot />}
          <IconButton
            icon="x"
            size="sm"
            className="hover-only"
            label={`Close ${labelFor(tab)}`}
            title={
              tab.spaceId === null
                ? 'Close tab (Ctrl+W)'
                : 'Close tab (Ctrl+W). The page stays in its Space.'
            }
            onClick={(event) => {
              event.stopPropagation(); // Don't also select this tab.
              window.browserApi.closeTab(tab.id);
            }}
          />
        </>
      }
    >
      {labelFor(tab)}
    </Row>
  );
}

// An open artifact in the sidebar: a document icon, its name, and a close button.
function ArtifactRow({
  tab,
  active,
}: {
  tab: ArtifactTabInfo;
  active: boolean;
}) {
  return (
    <Row
      active={active}
      title={tab.title}
      onOpen={() => window.browserApi.artifactSelect(tab.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        window.browserApi.showArtifactMenu(
          tab.id,
          event.clientX,
          event.clientY,
        );
      }}
      icon={<ItemEmoji emoji={tab.emoji} />}
      trailing={
        <IconButton
          icon="x"
          size="sm"
          className="hover-only"
          label={`Close ${tab.title}`}
          title="Close tab (Ctrl+W)"
          onClick={(event) => {
            event.stopPropagation(); // Don't also select this tab.
            window.browserApi.artifactClose(tab.id);
          }}
        />
      }
    >
      {tab.title}
    </Row>
  );
}

// A Space: a coloured, collapsible group. Its title row is built like a tab row,
// and clicking it opens the Space's overview (the name IS the overview).
function SpaceGroup({
  space,
  tabs,
  artifacts,
  active,
  renameRequest,
  onRenameHandled,
}: {
  space: SpaceInfo;
  tabs: TabInfo[];
  artifacts: ArtifactTabInfo[];
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
    window.browserApi.showSpaceMenu(space.id, event.clientX, event.clientY);
  };
  const color = SPACE_COLOR_HEX[space.color];
  const leadActive = active?.kind === 'lead' && active.spaceId === space.id;

  const finishRename = (value: string) => {
    setEditing(false);
    if (value.trim() !== '' && value !== space.name) {
      window.browserApi.renameSpace(space.id, value);
    }
  };

  const colourDot = <SpaceIcon emoji={space.emoji} tint={color} />;

  return (
    <div style={{ marginTop: 8 }}>
      {editing ? (
        <div className="lrow" onContextMenu={openMenu}>
          {colourDot}
          <input
            className="input"
            autoFocus
            defaultValue={space.name}
            maxLength={60}
            aria-label="Space name"
            onFocus={(e) => e.target.select()}
            onBlur={(e) => finishRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{ flex: 1, minWidth: 0, height: 26 }}
          />
        </div>
      ) : (
        <Row
          active={leadActive}
          title={`${space.name}: open the overview`}
          onOpen={() => window.browserApi.selectLead(space.id)}
          onContextMenu={openMenu}
          icon={
            <>
              <IconButton
                icon={space.collapsed ? 'chev-r' : 'chev-d'}
                size="sm"
                label={space.collapsed ? 'Expand Space' : 'Collapse Space'}
                title={space.collapsed ? 'Expand' : 'Collapse'}
                onClick={(event) => {
                  event.stopPropagation(); // Don't also open the overview.
                  window.browserApi.setSpaceCollapsed(
                    space.id,
                    !space.collapsed,
                  );
                }}
              />
              {colourDot}
            </>
          }
          trailing={
            <>
              {space.collapsed && (
                <span className="badge" title={`${tabs.length} tabs`}>
                  {tabs.length}
                </span>
              )}
              <IconButton
                icon="plus"
                size="sm"
                className="hover-only"
                label={`New tab in ${space.name}`}
                title="New tab in this Space"
                onClick={(event) => {
                  event.stopPropagation();
                  window.browserApi.newTab(space.id);
                }}
              />
            </>
          }
        >
          {space.name}
        </Row>
      )}

      {!space.collapsed && (
        <div
          style={{
            borderLeft: `3px solid ${color}`,
            marginLeft: 10,
            paddingLeft: 4,
          }}
        >
          {tabs.map((tab) => (
            <TabRow
              key={tab.id}
              tab={tab}
              active={active?.kind === 'tab' && active.id === tab.id}
            />
          ))}
          {artifacts.map((a) => (
            <ArtifactRow
              key={`a${a.id}`}
              tab={a}
              active={active?.kind === 'artifact' && active.id === a.id}
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
        {/* The new-tab "+" is in the same place (top left) as in the narrow strip. */}
        <button
          type="button"
          aria-label="New tab"
          title="New tab (Ctrl+T)"
          onClick={() => window.browserApi.newTab(null)}
          style={iconButtonStyle}
        >
          +
        </button>
        <span style={{ flex: 1, paddingLeft: 4 }}>Tabs</span>
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
        <PinButton pinned={state.sidebarPinned} />
      </div>

      <div style={{ overflowY: 'auto', padding: '0 6px 12px', flex: 1 }}>
        {ungrouped.map((tab) => (
          <TabRow
            key={tab.id}
            tab={tab}
            active={state.active?.kind === 'tab' && state.active.id === tab.id}
          />
        ))}
        {state.artifactTabs
          .filter((a) => a.spaceId === null)
          .map((a) => (
            <ArtifactRow
              key={`a${a.id}`}
              tab={a}
              active={
                state.active?.kind === 'artifact' && state.active.id === a.id
              }
            />
          ))}
        {state.spaces.map((space) => (
          <SpaceGroup
            key={space.id}
            space={space}
            tabs={state.tabs.filter(
              (tab) => tab.spaceId === space.id && !tab.closed,
            )}
            artifacts={state.artifactTabs.filter((a) => a.spaceId === space.id)}
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
      role="button"
      tabIndex={0}
      aria-current={active || undefined}
      aria-label={labelFor(tab)}
      onClick={() => window.browserApi.selectTab(tab.id)}
      onKeyDown={rowKeys(() => window.browserApi.selectTab(tab.id))}
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

function StripArtifact({
  tab,
  active,
}: {
  tab: ArtifactTabInfo;
  active: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active || undefined}
      aria-label={tab.title}
      onClick={() => window.browserApi.artifactSelect(tab.id)}
      onKeyDown={rowKeys(() => window.browserApi.artifactSelect(tab.id))}
      title={tab.title}
      style={stripButton(active)}
    >
      <ItemEmoji emoji={tab.emoji} />
    </div>
  );
}

function StripSpace({
  space,
  tabs,
  artifacts,
  active,
}: {
  space: SpaceInfo;
  tabs: TabInfo[];
  artifacts: ArtifactTabInfo[];
  active: UiState['active'];
}) {
  const color = SPACE_COLOR_HEX[space.color];
  const leadActive = active?.kind === 'lead' && active.spaceId === space.id;
  const openMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    window.browserApi.showSpaceMenu(space.id, event.clientX, event.clientY);
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
        role="button"
        tabIndex={0}
        aria-current={leadActive || undefined}
        aria-label={`${space.name} overview`}
        onClick={() => window.browserApi.selectLead(space.id)}
        onKeyDown={rowKeys(() => window.browserApi.selectLead(space.id))}
        onContextMenu={openMenu}
        title={`${space.name} overview`}
        style={stripButton(leadActive)}
      >
        <SpaceIcon emoji={space.emoji} tint={color} />
      </div>
      {!space.collapsed &&
        tabs.map((tab) => (
          <StripTab
            key={tab.id}
            tab={tab}
            active={active?.kind === 'tab' && active.id === tab.id}
          />
        ))}
      {!space.collapsed &&
        artifacts.map((a) => (
          <StripArtifact
            key={`a${a.id}`}
            tab={a}
            active={active?.kind === 'artifact' && active.id === a.id}
          />
        ))}
      {space.collapsed && tabs.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Show ${tabs.length} hidden tab${tabs.length === 1 ? '' : 's'}`}
          onClick={() => window.browserApi.setSpaceCollapsed(space.id, false)}
          onKeyDown={rowKeys(() =>
            window.browserApi.setSpaceCollapsed(space.id, false),
          )}
          onContextMenu={openMenu}
          title={`${tabs.length} hidden tab${tabs.length === 1 ? '' : 's'}`}
          style={{
            ...stripButton(false),
            fontSize: 11,
            color: 'var(--c-text-2)',
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
        {state.artifactTabs
          .filter((a) => a.spaceId === null)
          .map((a) => (
            <StripArtifact
              key={`a${a.id}`}
              tab={a}
              active={
                state.active?.kind === 'artifact' && state.active.id === a.id
              }
            />
          ))}
        {state.spaces.map((space) => (
          <StripSpace
            key={space.id}
            space={space}
            tabs={state.tabs.filter(
              (tab) => tab.spaceId === space.id && !tab.closed,
            )}
            artifacts={state.artifactTabs.filter((a) => a.spaceId === space.id)}
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
        background: 'var(--c-frame)',
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
            pinned={state.sidebarPinned}
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
