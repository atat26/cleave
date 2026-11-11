import { SPACE_COLOR_HEX } from './colors';
import { SIDEBAR_WIDTH, TOOLBAR_HEIGHT } from './layout';
import { Favicon, labelFor } from './Sidebar';
import type { SpaceInfo, TabInfo } from './types';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// A Space's Lead tab: an overview of the tabs in it. (A whiteboard comes later.)
// It is drawn by our own UI page, in the area where a web page would normally be.
export function LeadView({
  space,
  tabs,
}: {
  space: SpaceInfo;
  tabs: TabInfo[];
}) {
  const color = SPACE_COLOR_HEX[space.color];

  return (
    <main
      style={{
        position: 'fixed',
        top: TOOLBAR_HEIGHT,
        left: SIDEBAR_WIDTH,
        right: 0,
        bottom: 0,
        overflowY: 'auto',
        background: '#ffffff',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <span
          style={{ width: 14, height: 14, borderRadius: 7, background: color }}
        />
        <h1 style={{ margin: 0, fontSize: 22 }}>{space.name}</h1>
        <span style={{ color: '#5f6368', fontSize: 14 }}>
          {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}
        </span>
        <button
          type="button"
          onClick={() => window.browserApi.newTab(space.id)}
          style={{ marginLeft: 'auto', padding: '6px 12px', cursor: 'pointer' }}
        >
          + New tab here
        </button>
      </div>

      {tabs.length === 0 ? (
        <p style={{ color: '#5f6368' }}>
          No tabs in this Space yet. Use “+ New tab here”, or Ctrl+T while you
          are in this Space.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => window.browserApi.selectTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                border: '1px solid #d0d0d0',
                borderTop: `3px solid ${color}`,
                borderRadius: 8,
                cursor: 'pointer',
                opacity: tab.loaded ? 1 : 0.7,
              }}
            >
              <Favicon tab={tab} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {labelFor(tab)}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#5f6368',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hostOf(tab.url)}
                  {tab.loaded ? '' : ' · sleeping'}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Close ${labelFor(tab)}`}
                title="Close tab"
                onClick={(event) => {
                  event.stopPropagation();
                  window.browserApi.closeTab(tab.id);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
