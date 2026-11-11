import type { CSSProperties } from 'react';
import { SIDEBAR_WIDTH } from './layout';
import type { TabInfo } from './types';

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

// What to write on a tab: its title, else its site name, else "New Tab".
function labelFor(tab: TabInfo): string {
  if (tab.title) return tab.title;
  try {
    return new URL(tab.url).hostname || 'New Tab';
  } catch {
    return 'New Tab';
  }
}

interface SidebarProps {
  tabs: TabInfo[];
  activeId: number;
}

// The vertical tab list on the left.
export function Sidebar({ tabs, activeId }: SidebarProps) {
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
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 48,
          boxSizing: 'border-box',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        Tabs
        <button
          type="button"
          aria-label="New tab"
          title="New tab (Ctrl+T)"
          onClick={() => window.browserApi.newTab()}
          style={iconButtonStyle}
        >
          +
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '0 6px' }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              onClick={() => window.browserApi.switchTab(tab.id)}
              title={labelFor(tab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 34,
                padding: '0 6px 0 8px',
                marginBottom: 2,
                borderRadius: 8,
                fontSize: 13,
                cursor: 'pointer',
                background: isActive ? '#ffffff' : 'transparent',
                boxShadow: isActive ? '0 1px 2px rgba(0, 0, 0, 0.15)' : 'none',
              }}
            >
              {tab.favicon ? (
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
              )}
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {labelFor(tab)}
              </span>
              <button
                type="button"
                aria-label={`Close ${labelFor(tab)}`}
                title="Close tab (Ctrl+W)"
                onClick={(event) => {
                  event.stopPropagation(); // Don't also switch to this tab.
                  window.browserApi.closeTab(tab.id);
                }}
                style={iconButtonStyle}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
