import { useState } from 'react';
import type { CSSProperties } from 'react';
import { SPACE_COLOR_HEX } from './colors';
import { SIDEBAR_WIDTH } from './layout';
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

function TabRow({ tab, active }: { tab: TabInfo; active: boolean }) {
  return (
    <div
      onClick={() => window.browserApi.selectTab(tab.id)}
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
}: {
  space: SpaceInfo;
  tabs: TabInfo[];
  active: UiState['active'];
}) {
  const [editing, setEditing] = useState(false);
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
            onFocus={(e) => e.target.select()}
            onBlur={(e) => finishRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename(e.currentTarget.value);
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

// The vertical tab list on the left.
export function Sidebar({ state }: { state: UiState }) {
  const ungrouped = state.tabs.filter((tab) => tab.spaceId === null);

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        width: SIDEBAR_WIDTH,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: '#e8eaed',
        borderRight: '1px solid #d0d0d0',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 12px',
          height: 48,
          boxSizing: 'border-box',
          fontWeight: 600,
          fontSize: 13,
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

      <div style={{ overflowY: 'auto', padding: '0 6px 12px' }}>
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
          />
        ))}
      </div>
    </nav>
  );
}
