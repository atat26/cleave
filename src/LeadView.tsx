import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ArtifactKind } from './artifacts';
import { SPACE_COLOR_HEX } from './colors';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import { Favicon, labelFor } from './Sidebar';
import { Button } from './ui/controls';
import { Icon } from './ui/Icon';
import type { ArtifactInfo, SpaceInfo, TabInfo } from './types';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const KIND_WORDS: Record<ArtifactKind, string> = {
  markdown: 'Markdown',
  text: 'Plain text',
  html: 'HTML',
  code: 'Code',
};

const smallButton: CSSProperties = {
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  borderRadius: 14,
  fontSize: 12,
  padding: '3px 10px',
  cursor: 'pointer',
  color: '#202124',
};

const sectionTitle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: 13,
  fontWeight: 600,
  color: '#5f6368',
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: 12,
  marginBottom: 24,
};

// One item on the overview: a card you click to open, with its own buttons.
function Card({
  color,
  icon,
  title,
  subtitle,
  open,
  onOpen,
  onContextMenu,
  children,
}: {
  color: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  // Open as a tab right now. Closed ones are drawn lighter.
  open: boolean;
  onOpen: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onOpen}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        border: '1px solid #d0d0d0',
        borderTop: `3px solid ${color}`,
        borderRadius: 8,
        cursor: 'pointer',
        opacity: open ? 1 : 0.7,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon}
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
            {title}
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
            {subtitle}
          </div>
        </div>
      </div>
      <div
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
        // Buttons here must not also open the card.
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// A Space's Lead tab: an overview of the web pages and artifacts in it. Each can
// be opened or closed (a closed one stays here), and removed for good. It is
// drawn by our own UI page, in the area where a web page would normally be.
export function LeadView({
  space,
  tabs,
  artifacts,
  openArtifactIds,
}: {
  space: SpaceInfo;
  // Every page in the Space, open or closed.
  tabs: TabInfo[];
  // The artifacts in this Space.
  artifacts: ArtifactInfo[];
  // Which artifacts are open as tabs.
  openArtifactIds: number[];
}) {
  const color = SPACE_COLOR_HEX[space.color];
  const [editing, setEditing] = useState(false);
  // The two small forms under the header.

  const finishRename = (value: string) => {
    setEditing(false);
    if (value.trim() !== '' && value !== space.name) {
      window.browserApi.renameSpace(space.id, value);
    }
  };

  const openCount = tabs.filter((t) => !t.closed).length;

  return (
    <main
      style={{
        // The same rounded card where a web page would be. The app keeps these
        // variables up to date while the frame slides (see App.tsx).
        position: 'fixed',
        top: TOOLBAR_HEIGHT,
        left: `calc(var(--left) + ${PAGE_INSET}px)`,
        right: `calc(var(--rail) + var(--panel) + ${PAGE_INSET}px)`,
        bottom: `calc(var(--chat) + ${PAGE_INSET}px)`,
        overflowY: 'auto',
        background: '#ffffff',
        borderRadius: PAGE_RADIUS,
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          window.browserApi.showSpaceMenu(
            space.id,
            event.clientX,
            event.clientY,
          );
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{ width: 14, height: 14, borderRadius: 7, background: color }}
        />
        {editing ? (
          <input
            autoFocus
            defaultValue={space.name}
            maxLength={60}
            aria-label="Space name"
            onFocus={(e) => e.target.select()}
            onBlur={(e) => finishRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename(e.currentTarget.value);
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{ fontSize: 22, fontWeight: 600, minWidth: 0, width: 280 }}
          />
        ) : (
          <>
            <h1
              onClick={() => setEditing(true)}
              title="Click to rename"
              style={{ margin: 0, fontSize: 22, cursor: 'text' }}
            >
              {space.name}
            </h1>
            <button
              type="button"
              aria-label="Rename Space"
              title="Rename Space"
              onClick={() => setEditing(true)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 16,
                color: '#5f6368',
              }}
            >
              ✎
            </button>
          </>
        )}
        <span style={{ color: '#5f6368', fontSize: 14 }}>
          {tabs.length} {tabs.length === 1 ? 'page' : 'pages'} ({openCount}{' '}
          open) · {artifacts.length}{' '}
          {artifacts.length === 1 ? 'artifact' : 'artifacts'}
        </span>
        <Button
          variant="primary"
          icon="plus"
          aria-haspopup="menu"
          aria-label="Add to this Space"
          title="Add a page or an artifact"
          style={{ marginLeft: 'auto' }}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            window.browserApi.showSpaceAddMenu(
              space.id,
              box.left,
              box.bottom + 4,
            );
          }}
        >
          Add
          <Icon name="chev-d" />
        </Button>
      </div>

      <h2 style={sectionTitle}>Web pages</h2>
      {tabs.length === 0 ? (
        <p style={{ color: '#5f6368', marginTop: 0, marginBottom: 24 }}>
          No pages in this Space yet. Use the +, or Ctrl+T while you are in this
          Space.
        </p>
      ) : (
        <div style={grid}>
          {tabs.map((tab) => (
            <Card
              key={tab.id}
              color={color}
              icon={<Favicon tab={tab} />}
              title={labelFor(tab)}
              subtitle={`${hostOf(tab.url)} · ${
                tab.closed ? 'closed' : tab.loaded ? 'open' : 'open, sleeping'
              }`}
              open={!tab.closed}
              onOpen={() => window.browserApi.selectTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                window.browserApi.showTabMenu(
                  tab.id,
                  event.clientX,
                  event.clientY,
                );
              }}
            >
              {tab.closed ? (
                <button
                  type="button"
                  style={smallButton}
                  onClick={() => window.browserApi.reopenTab(tab.id)}
                >
                  Open
                </button>
              ) : (
                <button
                  type="button"
                  title="Close the tab but keep the page here"
                  style={smallButton}
                  onClick={() => window.browserApi.closeTab(tab.id)}
                >
                  Close
                </button>
              )}
              <button
                type="button"
                title="Delete this page from the Space for good"
                aria-label={`Delete ${labelFor(tab)}`}
                style={{ ...smallButton, color: '#b3261e' }}
                onClick={() => window.browserApi.removeTab(tab.id)}
              >
                Delete
              </button>
            </Card>
          ))}
        </div>
      )}

      <h2 style={sectionTitle}>Artifacts</h2>
      {artifacts.length === 0 ? (
        <p style={{ color: '#5f6368', marginTop: 0 }}>
          No artifacts in this Space yet. Use the + to make one or add one you
          have.
        </p>
      ) : (
        <div style={grid}>
          {artifacts.map((a) => {
            const open = openArtifactIds.includes(a.id);
            return (
              <Card
                key={a.id}
                color={color}
                icon={<span style={{ fontSize: 16 }}>📄</span>}
                title={a.title}
                subtitle={`${KIND_WORDS[a.kind]} · ${open ? 'open' : 'closed'}`}
                open={open}
                onOpen={() => window.browserApi.artifactOpen(a.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  window.browserApi.showArtifactMenu(
                    a.id,
                    event.clientX,
                    event.clientY,
                  );
                }}
              >
                {open && (
                  <button
                    type="button"
                    title="Close the tab but keep the artifact here"
                    style={smallButton}
                    onClick={() => window.browserApi.artifactClose(a.id)}
                  >
                    Close
                  </button>
                )}
                <button
                  type="button"
                  title="Keep the artifact, but take it out of this Space"
                  style={smallButton}
                  onClick={() => window.browserApi.artifactMove(a.id, null)}
                >
                  Take out
                </button>
                <button
                  type="button"
                  title="Delete the artifact for good"
                  aria-label={`Delete ${a.title}`}
                  style={{ ...smallButton, color: '#b3261e' }}
                  onClick={() => window.browserApi.artifactDelete(a.id)}
                >
                  Delete
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
