import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ArtifactKind } from './artifacts';
import { SPACE_COLOR_HEX } from './colors';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import { MAX_ABOUT_CHARS } from './model';
import { agoWords, overviewContent, summaryLine } from './overviewModel';
import { Favicon, labelFor } from './Sidebar';
import { NameButton } from './NameButton';
import { Button, IconButton, Input, ItemEmoji, SpaceIcon } from './ui/controls';
import { Icon } from './ui/Icon';
import type { ArtifactInfo, ChatInfo, SpaceInfo, TabInfo } from './types';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
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

const sizeWords = (chars: number) =>
  chars < 1000 ? `${chars} chars` : `${(chars / 1000).toFixed(1)}k chars`;

// One item on the overview: a card you click to open. Its other actions are in one
// "…" menu that shows while the pointer or the keyboard is on the card (the same
// menu as right-click). A closed page is lighter and dashed.
function OverviewCard({
  icon,
  title,
  subtitle,
  badge,
  closed = false,
  active = false,
  onOpen,
  onMenu,
  moreLabel,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  // A small note at the right of the subtitle (for example "Open").
  badge?: string;
  closed?: boolean;
  active?: boolean;
  onOpen: () => void;
  // Show the item's menu at a place in the window (none: no menu).
  onMenu?: (x: number, y: number) => void;
  moreLabel: string;
}) {
  return (
    <div
      className={[
        'ov-card',
        'reveal-host',
        closed ? 'is-closed' : '',
        active ? 'is-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      title={title}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
    >
      <span className="ov-card-icon">{icon}</span>
      <span className="ov-card-text">
        <span className="ov-card-title">{title}</span>
        <span className="ov-card-sub">
          <span className="truncate">{subtitle}</span>
          {badge && <span className="ov-badge">{badge}</span>}
        </span>
      </span>
      {onMenu && (
        <IconButton
          icon="more"
          size="sm"
          className="reveal ov-more"
          label={moreLabel}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation(); // Don't also open the card.
            const box = event.currentTarget.getBoundingClientRect();
            onMenu(box.left, box.bottom + 2);
          }}
        />
      )}
    </div>
  );
}

// The note you wrote about the Space (its goal, a budget, what to keep in mind). It
// is told to the assistant when the Space is linked to a chat. Click it to change it;
// it is saved when you click away (Ctrl+Enter also saves, Escape leaves it as it was).
function AboutBlock({ space }: { space: SpaceInfo }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(space.about);

  const start = () => {
    setDraft(space.about);
    setEditing(true);
  };
  const finish = (save: boolean) => {
    setEditing(false);
    if (save && draft.trim() !== space.about) {
      window.browserApi.setSpaceAbout(space.id, draft);
    }
  };

  if (editing) {
    return (
      <div className="ov-about is-editing">
        <textarea
          className="input ov-about-input"
          aria-label="About this Space"
          autoFocus
          value={draft}
          maxLength={MAX_ABOUT_CHARS}
          rows={3}
          placeholder="What is this Space for? Its goal, a budget, anything to keep in mind…"
          onFocus={(event) => {
            const end = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(end, end);
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              finish(false);
            } else if (
              event.key === 'Enter' &&
              (event.ctrlKey || event.metaKey)
            ) {
              event.preventDefault();
              finish(true);
            }
          }}
        />
        <div className="ov-about-hint muted">
          Only you see this, and the assistant when this Space is linked to a
          chat. Ctrl+Enter saves.
          {draft.length > MAX_ABOUT_CHARS - 200 && (
            <span> {MAX_ABOUT_CHARS - draft.length} characters left.</span>
          )}
        </div>
      </div>
    );
  }

  if (space.about === '') {
    return (
      <button type="button" className="ov-about is-empty" onClick={start}>
        <Icon name="pencil" />
        Add a note about this Space: its goal, a budget, what to keep in mind
      </button>
    );
  }
  return (
    <div className="ov-about reveal-host">
      <div
        className="ov-about-text"
        role="button"
        tabIndex={0}
        title="Click to change"
        onClick={start}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            start();
          }
        }}
      >
        {space.about}
      </div>
    </div>
  );
}

// A titled part of the page. Click the title to fold it away (remembered), and the
// section's own buttons show while the pointer or keyboard is on its title.
function Section({
  id,
  title,
  count,
  actions,
  children,
}: {
  id: string;
  title: string;
  count: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const key = `overviewFold:${id}`;
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setFolded((now) => {
      try {
        localStorage.setItem(key, now ? '0' : '1');
      } catch {
        // Not remembered; fine.
      }
      return !now;
    });
  };
  return (
    <section className="ov-section" aria-label={title}>
      <div className="ov-section-head reveal-host">
        <button
          type="button"
          className="ov-fold"
          aria-expanded={!folded}
          onClick={toggle}
        >
          <Icon name={folded ? 'chev-r' : 'chev-d'} />
          <span className="ov-section-title">{title}</span>
          <span className="ov-count">{count}</span>
        </button>
        {actions && <span className="ov-section-actions">{actions}</span>}
      </div>
      {!folded && children}
    </section>
  );
}

// A Space's overview: everything in it at a glance (its pages, artifacts and chats),
// with a search box that narrows all of them. It is drawn by our own UI page, in the
// area where a web page would normally be.
export function LeadView({
  space,
  tabs,
  artifacts,
  chats,
  activeChatId,
  openArtifactIds,
}: {
  space: SpaceInfo;
  // Every page in the Space, open or closed.
  tabs: TabInfo[];
  // The artifacts in this Space.
  artifacts: ArtifactInfo[];
  // The chats linked to this Space.
  chats: ChatInfo[];
  activeChatId: number;
  // Which artifacts are open as tabs.
  openArtifactIds: number[];
}) {
  const color = SPACE_COLOR_HEX[space.color];
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  // "5 min ago" moves on while the page is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const finishRename = (value: string) => {
    setEditing(false);
    if (value.trim() !== '' && value !== space.name) {
      window.browserApi.renameSpace(space.id, value);
    }
  };

  const shown = useMemo(
    () => overviewContent({ query, pages: tabs, artifacts, chats }),
    [query, tabs, artifacts, chats],
  );
  const openCount = tabs.filter((t) => !t.closed).length;
  const empty =
    tabs.length === 0 && artifacts.length === 0 && chats.length === 0;
  const nothingFound =
    !empty &&
    shown.open.length +
      shown.closed.length +
      shown.artifacts.length +
      shown.chats.length ===
      0;

  const openChat = (id: number) => {
    window.browserApi.selectChat(id);
    window.browserApi.setViewMode('chat');
  };

  return (
    <main
      className="ov"
      style={
        {
          // The same rounded card where a web page would be. The app keeps these
          // variables up to date while the frame slides (see App.tsx).
          position: 'fixed',
          top: TOOLBAR_HEIGHT,
          left: `calc(var(--left) + ${PAGE_INSET}px)`,
          right: `calc(var(--rail) + var(--panel) + ${PAGE_INSET}px)`,
          bottom: `calc(var(--chat) + ${PAGE_INSET}px)`,
          borderRadius: PAGE_RADIUS,
          '--ov-color': color,
        } as React.CSSProperties
      }
    >
      <header
        className="ov-hero reveal-host"
        onContextMenu={(event) => {
          event.preventDefault();
          window.browserApi.showSpaceMenu(
            space.id,
            event.clientX,
            event.clientY,
          );
        }}
      >
        <span className="ov-hero-icon">
          <SpaceIcon emoji={space.emoji} tint={color} />
        </span>
        <div className="ov-hero-main">
          <div className="ov-name-row">
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
                  fontSize: 'var(--fs-2xl)',
                  fontWeight: 650,
                  minWidth: 0,
                  width: 320,
                  height: 42,
                }}
              />
            ) : (
              <h1
                className="ov-name truncate"
                onClick={() => setEditing(true)}
                title="Click to rename"
              >
                {space.name}
              </h1>
            )}
            <NameButton kind="space" id={space.id} />
          </div>
          <div className="ov-summary">
            {summaryLine({
              pages: tabs.length,
              open: openCount,
              artifacts: artifacts.length,
              chats: chats.length,
            })}
          </div>
        </div>
        <div className="ov-hero-actions">
          <Button
            variant="primary"
            icon="plus"
            aria-haspopup="menu"
            aria-label="Add to this Space"
            title="Add a page or an artifact"
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
          <IconButton
            icon="more"
            label="More: rename, colour, close all pages and more"
            aria-haspopup="menu"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              window.browserApi.showSpaceMenu(
                space.id,
                box.right - 220,
                box.bottom + 4,
              );
            }}
          />
        </div>
      </header>

      <div className="ov-body">
        <AboutBlock key={space.id} space={space} />
        {empty ? (
          <div className="ov-empty">
            <p className="ov-empty-title">This Space is empty.</p>
            <p className="muted">
              Open a page while you are in it, make an artifact here, or link it
              to a chat with @. Everything in the Space shows up on this page.
            </p>
          </div>
        ) : (
          <>
            <div className="ov-tools">
              <label className="ov-search">
                <Icon name="search" />
                <Input
                  aria-label="Search this Space"
                  placeholder="Search this Space"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && query !== '') {
                      event.preventDefault();
                      setQuery('');
                    }
                  }}
                />
              </label>
            </div>
            {nothingFound && (
              <p className="muted" role="status">
                Nothing in this Space matches “{query.trim()}”.
              </p>
            )}

            {shown.open.length > 0 && (
              <Section
                id="pages"
                title="Open pages"
                count={shown.open.length}
                actions={
                  <Button
                    size="sm"
                    className="reveal"
                    onClick={() =>
                      window.browserApi.spaceBulk(space.id, 'close-all')
                    }
                  >
                    Close all
                  </Button>
                }
              >
                <div className="ov-grid">
                  {shown.open.map((tab) => (
                    <OverviewCard
                      key={tab.id}
                      icon={<Favicon tab={tab} />}
                      title={labelFor(tab)}
                      subtitle={hostOf(tab.url)}
                      badge={tab.loaded ? undefined : 'Sleeping'}
                      onOpen={() => window.browserApi.selectTab(tab.id)}
                      onMenu={(x, y) =>
                        window.browserApi.showTabMenu(tab.id, x, y)
                      }
                      moreLabel={`More actions for ${labelFor(tab)}`}
                    />
                  ))}
                </div>
              </Section>
            )}

            {shown.artifacts.length > 0 && (
              <Section
                id="artifacts"
                title="Artifacts"
                count={shown.artifacts.length}
              >
                <div className="ov-grid">
                  {shown.artifacts.map((a) => {
                    const open = openArtifactIds.includes(a.id);
                    return (
                      <OverviewCard
                        key={a.id}
                        icon={<ItemEmoji emoji={a.emoji} />}
                        title={a.title}
                        subtitle={`${KIND_WORDS[a.kind]} · ${sizeWords(a.size)}`}
                        badge={open ? 'Open' : undefined}
                        onOpen={() => window.browserApi.artifactOpen(a.id)}
                        onMenu={(x, y) =>
                          window.browserApi.showArtifactMenu(a.id, x, y)
                        }
                        moreLabel={`More actions for ${a.title}`}
                      />
                    );
                  })}
                </div>
              </Section>
            )}

            {shown.chats.length > 0 && (
              <Section id="chats" title="Chats" count={shown.chats.length}>
                <div className="ov-grid">
                  {shown.chats.map((c) => (
                    <OverviewCard
                      key={c.id}
                      icon={<ItemEmoji emoji={c.emoji} />}
                      title={c.title}
                      subtitle={`${c.messageCount} ${
                        c.messageCount === 1 ? 'message' : 'messages'
                      } · ${agoWords(c.updatedAt, now)}`}
                      active={c.id === activeChatId}
                      onOpen={() => openChat(c.id)}
                      onMenu={(x, y) =>
                        window.browserApi.showChatMenu(c.id, x, y)
                      }
                      moreLabel={`More actions for ${c.title}`}
                    />
                  ))}
                </div>
              </Section>
            )}

            {shown.closed.length > 0 && (
              <Section
                id="closed"
                title="Closed pages"
                count={shown.closed.length}
                actions={
                  <Button
                    size="sm"
                    className="reveal"
                    onClick={() =>
                      window.browserApi.spaceBulk(space.id, 'reopen-all')
                    }
                  >
                    Reopen all
                  </Button>
                }
              >
                <div className="ov-grid">
                  {shown.closed.map((tab) => (
                    <OverviewCard
                      key={tab.id}
                      closed
                      icon={<Favicon tab={tab} />}
                      title={labelFor(tab)}
                      subtitle={hostOf(tab.url)}
                      badge="Closed"
                      onOpen={() => window.browserApi.selectTab(tab.id)}
                      onMenu={(x, y) =>
                        window.browserApi.showTabMenu(tab.id, x, y)
                      }
                      moreLabel={`More actions for ${labelFor(tab)}`}
                    />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
