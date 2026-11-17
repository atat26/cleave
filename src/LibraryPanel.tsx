import { useEffect, useState } from 'react';
import { dayGroups } from './history';
import type { HistoryEntry } from './history';
import { byteText, progressOf, statusText } from './downloadList';
import type { DownloadItem } from './downloadList';
import type { ClosedTabInfo, DeletedItemInfo, LibraryList } from './types';
import type { Bookmark } from './bookmarks';
import { IconButton, Input, ItemEmoji, Progress, Select } from './ui/controls';
import { Icon } from './ui/Icon';

type Section = LibraryList;

const LISTS: { value: Section; label: string }[] = [
  { value: 'bookmarks', label: 'Bookmarks' },
  { value: 'history', label: 'History' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'closed', label: 'Recently closed' },
  { value: 'deleted', label: 'Recently deleted' },
];

// The list you used last (remembered, if the browser allows it).
const lastList = (): Section => {
  try {
    const saved = localStorage.getItem('libraryList');
    return LISTS.find((l) => l.value === saved)?.value ?? 'bookmarks';
  } catch {
    return 'bookmarks';
  }
};

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
  onOpenBackground,
  onAction,
}: {
  title: string;
  detail: string;
  aside?: string;
  actionLabel?: string;
  onOpen: () => void;
  // Middle-click or Ctrl+click: open it behind the page you are on.
  onOpenBackground?: () => void;
  onAction?: () => void;
}) {
  return (
    <div
      className="lrow reveal-host lib-row"
      role="button"
      tabIndex={0}
      title={detail}
      onClick={(event) =>
        (event.ctrlKey || event.metaKey) && onOpenBackground
          ? onOpenBackground()
          : onOpen()
      }
      onMouseDown={(event) => {
        if (event.button === 1 && onOpenBackground) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== 1 || !onOpenBackground) return;
        event.preventDefault();
        onOpenBackground();
      }}
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

// One download: its name and how it stands, with a bar while it is going. Click a
// finished one to open it. The buttons (and the right-click menu) show when the
// pointer or keyboard is on the row.
function DownloadRow({ item }: { item: DownloadItem }) {
  const act = (
    action: 'open' | 'show' | 'pause' | 'resume' | 'cancel' | 'remove',
  ) => window.browserApi.downloadsAct(item.id, action);
  const going = item.state === 'downloading' || item.state === 'paused';
  const open = () => item.state === 'done' && act('open');
  const share = progressOf(item);
  return (
    <div
      className="lrow reveal-host lib-row"
      role="button"
      tabIndex={0}
      title={item.path || item.url}
      onClick={open}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        window.browserApi.showDownloadMenu(
          item.id,
          event.clientX,
          event.clientY,
        );
      }}
      style={{
        opacity:
          item.state === 'blocked' || item.state === 'cancelled' ? 0.6 : 1,
      }}
    >
      <Icon name={item.state === 'done' ? 'file' : 'download'} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="truncate" style={{ display: 'block' }}>
          {item.name}
        </span>
        <span
          className="truncate muted"
          style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
        >
          {statusText(item)}
        </span>
        {going && share !== null && (
          <Progress
            value={share}
            label={`${item.name}: ${byteText(item.receivedBytes)}`}
          />
        )}
      </span>
      {item.state === 'done' && (
        <IconButton
          icon="folder"
          size="sm"
          className="reveal"
          label={`Show ${item.name} in its folder`}
          onClick={(event) => {
            event.stopPropagation();
            act('show');
          }}
        />
      )}
      {going && (
        <IconButton
          icon={item.state === 'paused' ? 'play' : 'stop'}
          size="sm"
          className="reveal"
          label={
            item.state === 'paused'
              ? `Resume ${item.name}`
              : `Pause ${item.name}`
          }
          onClick={(event) => {
            event.stopPropagation();
            act(item.state === 'paused' ? 'resume' : 'pause');
          }}
        />
      )}
      <IconButton
        icon="x"
        size="sm"
        className="reveal"
        label={
          going ? `Cancel ${item.name}` : `Remove ${item.name} from the list`
        }
        onClick={(event) => {
          event.stopPropagation();
          act(going ? 'cancel' : 'remove');
        }}
      />
    </div>
  );
}

// The Library: pages you have visited, and tabs you closed recently. (Recently
// deleted chats and artifacts, downloads and bookmarks join it later.)
export function LibraryPanel() {
  const [section, setSection] = useState<Section>(lastList);
  const [downloads, setDownloads] = useState<DownloadItem[] | null>(null);
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
  useEffect(
    () => window.browserApi.onDownloadsChanged(() => setTick((n) => n + 1)),
    [],
  );
  // The download indicator opens the Library on Downloads.
  useEffect(
    () => window.browserApi.onLibrarySelectList((list) => setSection(list)),
    [],
  );
  useEffect(() => {
    try {
      localStorage.setItem('libraryList', section);
    } catch {
      // Not remembered; fine.
    }
  }, [section]);

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
    if (section !== 'downloads') return;
    let cancelled = false;
    void window.browserApi.downloadsList().then((found) => {
      if (!cancelled) setDownloads([...found].reverse());
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
      <Select
        aria-label="Library list"
        value={section}
        onChange={(event) => {
          setSection(event.target.value as Section);
          setQuery('');
        }}
        style={{ width: '100%' }}
      >
        {LISTS.map((list) => (
          <option key={list.value} value={list.value}>
            {list.label}
          </option>
        ))}
      </Select>
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
        ) : section === 'downloads' ? (
          <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
            Files your pages downloaded. Click one to open it.
          </span>
        ) : section === 'closed' ? (
          <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
            Recently closed tabs. Ctrl+Shift+T reopens the newest.
          </span>
        ) : (
          <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
            Recently deleted chats, artifacts and Spaces. Click one to bring it
            back.
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
              onOpenBackground={() =>
                window.browserApi.libraryOpen(bookmark.url, true)
              }
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
                  onOpenBackground={() =>
                    window.browserApi.libraryOpen(entry.url, true)
                  }
                  onAction={() =>
                    window.browserApi.libraryRemoveVisit(entry.id)
                  }
                />
              ))}
            </section>
          ))
        ))}

      {section === 'downloads' &&
        (downloads === null ? null : downloads.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing downloaded yet.
          </p>
        ) : (
          downloads.map((item) => <DownloadRow key={item.id} item={item} />)
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
