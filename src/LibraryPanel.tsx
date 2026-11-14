import { useEffect, useState } from 'react';
import { dayGroups } from './history';
import type { HistoryEntry } from './history';
import type { ClosedTabInfo, DeletedItemInfo } from './types';
import type { Bookmark } from './bookmarks';
import { IconButton, Input, ItemEmoji, TabList } from './ui/controls';
import { Icon } from './ui/Icon';

type Section = 'bookmarks' | 'history' | 'closed' | 'deleted';

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const timeOf = (time: number): string =>
  new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// One page in a list: its title and site, what to say at the right, and a quiet
// button (it shows when the pointer or the keyboard is on the row).
function Row({
  title,
  detail,
  aside,
  actionLabel,
  onOpen,
  onAction,
}: {
  title: string;
  detail: string;
  aside?: string;
  actionLabel?: string;
  onOpen: () => void;
  onAction?: () => void;
}) {
  return (
    <div
      className="lrow reveal-host lib-row"
      role="button"
      tabIndex={0}
      title={detail}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <Icon name="globe" />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="truncate" style={{ display: 'block' }}>
          {title}
        </span>
        <span
          className="truncate muted"
          style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
        >
          {detail}
        </span>
      </span>
      {aside && (
        <span
          className="muted"
          style={{ fontSize: 'var(--fs-xs)', flex: 'none' }}
        >
          {aside}
        </span>
      )}
      {actionLabel && onAction && (
        <IconButton
          icon="x"
          size="sm"
          className="reveal"
          label={actionLabel}
          onClick={(event) => {
            event.stopPropagation(); // Don't also open the page.
            onAction();
          }}
        />
      )}
    </div>
  );
}

// The Library: pages you have visited, and tabs you closed recently. (Recently
// deleted chats and artifacts, downloads and bookmarks join it later.)
export function LibraryPanel() {
  const [section, setSection] = useState<Section>('bookmarks');
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [closed, setClosed] = useState<ClosedTabInfo[] | null>(null);
  const [deleted, setDeleted] = useState<DeletedItemInfo[] | null>(null);
  // Bumped when the app says the lists changed.
  const [tick, setTick] = useState(0);

  useEffect(
    () => window.browserApi.onLibraryChanged(() => setTick((n) => n + 1)),
    [],
  );

  useEffect(() => {
    if (section !== 'bookmarks') return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void window.browserApi.libraryBookmarks(query).then((found) => {
          if (!cancelled) setBookmarks(found);
        });
      },
      query === '' ? 0 : 150,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [section, query, tick]);

  useEffect(() => {
    if (section !== 'history') return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void window.browserApi.libraryHistory(query).then((found) => {
          if (!cancelled) setEntries(found);
        });
      },
      query === '' ? 0 : 150,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [section, query, tick]);

  useEffect(() => {
    if (section !== 'closed') return;
    let cancelled = false;
    void window.browserApi.libraryClosed().then((found) => {
      if (!cancelled) setClosed(found);
    });
    return () => {
      cancelled = true;
    };
  }, [section, tick]);

  useEffect(() => {
    if (section !== 'deleted') return;
    let cancelled = false;
    void window.browserApi.libraryDeleted().then((found) => {
      if (!cancelled) setDeleted(found);
    });
    return () => {
      cancelled = true;
    };
  }, [section, tick]);

  return (
    <div>
      <TabList<Section>
        label="Library"
        value={section}
        onChange={(next) => {
          setSection(next);
          setQuery('');
        }}
        tabs={[
          { value: 'bookmarks', label: 'Bookmarks' },
          { value: 'history', label: 'History' },
          { value: 'closed', label: 'Closed' },
          { value: 'deleted', label: 'Deleted' },
        ]}
      />
      <div
        className="row-flex"
        style={{ gap: 'var(--s-2)', margin: 'var(--s-3) 0' }}
      >
        {section === 'history' || section === 'bookmarks' ? (
          <Input
            aria-label={
              section === 'history' ? 'Search history' : 'Search bookmarks'
            }
            placeholder={
              section === 'history' ? 'Search history' : 'Search bookmarks'
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
        ) : section === 'closed' ? (
          <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
            Recently closed tabs. Ctrl+Shift+T reopens the newest.
          </span>
        ) : (
          <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
            Recently deleted chats and artifacts. Click one to bring it back.
          </span>
        )}
        {section !== 'bookmarks' && (
          <IconButton
            icon="more"
            size="sm"
            label="Clear…"
            aria-haspopup="menu"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              window.browserApi.showLibraryMenu(
                section,
                box.right - 190,
                box.bottom + 4,
              );
            }}
          />
        )}
      </div>

      {section === 'bookmarks' &&
        (bookmarks === null ? null : bookmarks.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {query === ''
              ? 'No bookmarks yet. Click the star in the address bar (or press Ctrl+D) to bookmark a page.'
              : 'Nothing found.'}
          </p>
        ) : (
          bookmarks.map((bookmark) => (
            <Row
              key={bookmark.id}
              title={bookmark.title || hostOf(bookmark.url)}
              detail={hostOf(bookmark.url)}
              actionLabel={`Remove bookmark ${bookmark.title || hostOf(bookmark.url)}`}
              onOpen={() => window.browserApi.libraryOpen(bookmark.url)}
              onAction={() =>
                window.browserApi.libraryRemoveBookmark(bookmark.id)
              }
            />
          ))
        ))}

      {section === 'history' &&
        (entries === null ? null : entries.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {query === '' ? 'No history yet.' : 'Nothing found.'}
          </p>
        ) : (
          dayGroups(entries, Date.now()).map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="sect-title">{group.label}</h3>
              {group.entries.map((entry) => (
                <Row
                  key={entry.id}
                  title={entry.title || hostOf(entry.url)}
                  detail={hostOf(entry.url)}
                  aside={timeOf(entry.visitedAt)}
                  actionLabel={`Remove ${entry.title || hostOf(entry.url)} from history`}
                  onOpen={() => window.browserApi.libraryOpen(entry.url)}
                  onAction={() =>
                    window.browserApi.libraryRemoveVisit(entry.id)
                  }
                />
              ))}
            </section>
          ))
        ))}

      {section === 'deleted' &&
        (deleted === null ? null : deleted.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing deleted lately.
          </p>
        ) : (
          deleted.map((item) => (
            <div
              key={`${item.kind}:${item.id}`}
              className="lrow reveal-host lib-row"
              role="button"
              tabIndex={0}
              title="Bring it back"
              onClick={() =>
                window.browserApi.libraryRestore(item.kind, item.id)
              }
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  window.browserApi.libraryRestore(item.kind, item.id);
                }
              }}
            >
              <ItemEmoji emoji={item.emoji} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="truncate" style={{ display: 'block' }}>
                  {item.title}
                </span>
                <span
                  className="truncate muted"
                  style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
                >
                  {item.detail} · {item.daysLeft} day
                  {item.daysLeft === 1 ? '' : 's'} left
                </span>
              </span>
              <IconButton
                icon="undo"
                size="sm"
                className="reveal"
                label={`Bring back ${item.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  window.browserApi.libraryRestore(item.kind, item.id);
                }}
              />
              <IconButton
                icon="trash"
                size="sm"
                className="reveal"
                label={`Delete ${item.title} for good`}
                onClick={(event) => {
                  event.stopPropagation();
                  window.browserApi.libraryDeleteForever(item.kind, item.id);
                }}
              />
            </div>
          ))
        ))}

      {section === 'closed' &&
        (closed === null ? null : closed.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No recently closed tabs.
          </p>
        ) : (
          closed.map((tab) => (
            <Row
              key={tab.id}
              title={tab.title || hostOf(tab.url)}
              detail={
                tab.spaceName
                  ? `${tab.spaceEmoji ?? ''} ${tab.spaceName} · ${hostOf(tab.url)}`
                  : hostOf(tab.url)
              }
              aside={timeOf(tab.closedAt)}
              onOpen={() => window.browserApi.libraryReopenClosed(tab.id)}
            />
          ))
        ))}
    </div>
  );
}
