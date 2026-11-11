import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { SPACE_COLOR_HEX } from './colors';
import type { SpaceInfo, TabInfo, UiState } from './types';

const iconButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  border: 'none',
  borderRadius: 12,
  background: 'transparent',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
};

const rowStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 32,
  padding: '0 6px 0 8px',
  marginBottom: 2,
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
  background: active ? '#ffffff' : 'transparent',
  boxShadow: active ? '0 1px 2px rgba(0, 0, 0, 0.15)' : 'none',
});

const ellipsis: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

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
  onRenameDone,
}: {
  space: SpaceInfo;
  tabs: TabInfo[];
  active: UiState['active'];
  // Set when "Rename Space" was chosen from this Space's right-click menu.
  renameRequest: number | null;
  onRenameHandled: () => void;
  onRenameDone: () => void;
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
    onRenameDone();
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
              if (e.key === 'Escape') {
                setEditing(false);
                onRenameDone();
              }
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
  onRenameDone,
}: {
  state: UiState;
  renameRequest: number | null;
  onRenameHandled: () => void;
  onRenameDone: () => void;
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
          aria-label={state.sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
          title={
            state.sidebarPinned
              ? 'Unpin (collapse when not in use)'
              : 'Pin open'
          }
          onClick={() =>
            window.browserApi.setSidebarPinned(!state.sidebarPinned)
          }
          style={{
            ...iconButtonStyle,
            width: 'auto',
            padding: '0 8px',
            fontSize: 12,
            background: state.sidebarPinned ? '#ffffff' : 'transparent',
          }}
        >
          {state.sidebarPinned ? 'Pinned' : 'Pin'}
        </button>
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
            onRenameDone={onRenameDone}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Narrow icon strip (the collapsed sidebar)
// ---------------------------------------------------------------------------

const stripButton = (active: boolean): CSSProperties => ({
  width: 32,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 2px',
  borderRadius: 8,
  cursor: 'pointer',
  background: active ? '#ffffff' : 'transparent',
  boxShadow: active ? '0 1px 2px rgba(0, 0, 0, 0.15)' : 'none',
});

function StripTab({ tab, active }: { tab: TabInfo; active: boolean }) {
  return (
    <div
      onClick={() => window.browserApi.selectTab(tab.id)}
      onContextMenu={showTabMenu(tab)}
      title={labelFor(tab)}
      style={{ ...stripButton(active), opacity: tab.loaded ? 1 : 0.6 }}
    >
      <Favicon tab={tab} />
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
// The sidebar page: opens when you hover it, closes when you leave (unless
// pinned). It fills its own view, which the main process sizes and layers.
// ---------------------------------------------------------------------------

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 350;

export function Sidebar({
  state,
  renameRequest,
  onRenameHandled,
}: {
  state: UiState;
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // Ask the app to open/close after a short delay, so just passing the mouse
  // over the strip does not make it flicker.
  const requestHover = (hovering: boolean) => {
    if (state.sidebarPinned) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => window.browserApi.setSidebarHover(hovering),
      hovering ? OPEN_DELAY_MS : CLOSE_DELAY_MS,
    );
  };

  // After a rename the mouse may be elsewhere (e.g. it was started from a
  // menu on the overview page), so close if the mouse is not over us.
  const closeIfMouseAway = () => {
    if (!rootRef.current?.matches(':hover')) requestHover(false);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <nav
      ref={rootRef}
      onMouseEnter={() => requestHover(true)}
      onMouseLeave={() => requestHover(false)}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        background: '#e8eaed',
        borderRight: '1px solid #d0d0d0',
        boxShadow:
          state.sidebarExpanded && !state.sidebarPinned
            ? '2px 0 8px rgba(0, 0, 0, 0.25)'
            : 'none',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {state.sidebarExpanded ? (
        <FullSidebar
          state={state}
          renameRequest={renameRequest}
          onRenameHandled={onRenameHandled}
          onRenameDone={closeIfMouseAway}
        />
      ) : (
        <Strip state={state} />
      )}
    </nav>
  );
}
