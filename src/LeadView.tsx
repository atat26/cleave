import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ArtifactKind } from './artifacts';
import { SPACE_COLOR_HEX } from './colors';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import { Favicon, labelFor } from './Sidebar';
import { Button, ItemEmoji, SpaceIcon } from './ui/controls';
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

// One item on the overview: a card you click to open, with its own buttons. A
// closed one is lighter and dashed. The Space's colour runs along its top edge.
function OverviewCard({
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
  // Open as a tab right now.
  open: boolean;
  onOpen: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={open ? 'card ov-card' : 'card ov-card is-closed'}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={onContextMenu}
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="row-flex" style={{ gap: 10 }}>
        {icon}
        <div className="grow">
          <div className="truncate" style={{ fontWeight: 600 }}>
            {title}
          </div>
          <div className="truncate muted" style={{ fontSize: 'var(--fs-xs)' }}>
            {subtitle}
          </div>
        </div>
      </div>
      <div
        className="ov-actions"
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
        background: 'var(--c-surface)',
        borderRadius: PAGE_RADIUS,
        padding: 'var(--s-6)',
        boxSizing: 'border-box',
        color: 'var(--c-text)',
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
        <SpaceIcon emoji={space.emoji} tint={color} />
        {editing ? (
          <input
            className="input"
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
            style={{
              fontSize: 'var(--fs-xl)',
              fontWeight: 600,
              minWidth: 0,
              width: 280,
              height: 36,
            }}
          />
        ) : (
          <h1
            onClick={() => setEditing(true)}
            title="Click to rename"
            style={{
              margin: 0,
              fontSize: 'var(--fs-xl)',
              cursor: 'text',
            }}
          >
            {space.name}
          </h1>
        )}
        <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
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

      <h2 className="sect-title ov-title">Web pages</h2>
      {tabs.length === 0 ? (
        <p
          className="muted"
          style={{ marginTop: 0, marginBottom: 'var(--s-6)' }}
        >
          No pages in this Space yet. Use the +, or Ctrl+T while you are in this
          Space.
        </p>
      ) : (
        <div className="ov-grid">
          {tabs.map((tab) => (
            <OverviewCard
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
                <Button
                  size="sm"
                  onClick={() => window.browserApi.reopenTab(tab.id)}
                >
                  Open
                </Button>
              ) : (
                <Button
                  size="sm"
                  title="Close the tab but keep the page here"
                  onClick={() => window.browserApi.closeTab(tab.id)}
                >
                  Close
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                title="Delete this page from the Space for good"
                aria-label={`Delete ${labelFor(tab)}`}
                onClick={() => window.browserApi.removeTab(tab.id)}
              >
                Delete
              </Button>
            </OverviewCard>
          ))}
        </div>
      )}

      <h2 className="sect-title ov-title">Artifacts</h2>
      {artifacts.length === 0 ? (
        <p className="muted" style={{ marginTop: 0 }}>
          No artifacts in this Space yet. Use the + to make one or add one you
          have.
        </p>
      ) : (
        <div className="ov-grid">
          {artifacts.map((a) => {
            const open = openArtifactIds.includes(a.id);
            return (
              <OverviewCard
                key={a.id}
                color={color}
                icon={<ItemEmoji emoji={a.emoji} />}
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
                  <Button
                    size="sm"
                    title="Close the tab but keep the artifact here"
                    onClick={() => window.browserApi.artifactClose(a.id)}
                  >
                    Close
                  </Button>
                )}
                <Button
                  size="sm"
                  title="Keep the artifact, but take it out of this Space"
                  onClick={() => window.browserApi.artifactMove(a.id, null)}
                >
                  Take out
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  title="Delete the artifact for good"
                  aria-label={`Delete ${a.title}`}
                  onClick={() => window.browserApi.artifactDelete(a.id)}
                >
                  Delete
                </Button>
              </OverviewCard>
            );
          })}
        </div>
      )}
    </main>
  );
}
