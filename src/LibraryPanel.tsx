import { useEffect, useState } from 'react';
import { dayGroups } from './history';
import type { HistoryEntry } from './history';
import type { ClosedTabInfo } from './types';
import { IconButton, Input, Segmented } from './ui/controls';
import { Icon } from './ui/Icon';

type Section = 'history' | 'closed';

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
  const [section, setSection] = useState<Section>('history');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [closed, setClosed] = useState<ClosedTabInfo[] | null>(null);
  // Bumped when the app says the lists changed.
  const [tick, setTick] = useState(0);

  useEffect(
    () => window.browserApi.onLibraryChanged(() => setTick((n) => n + 1)),
    [],
  );

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

  return (
    <div>
      <Segmented<Section>
        label="Library"
        value={section}
        onChange={setSection}
        options={[
          { value: 'history', label: 'History' },
          { value: 'closed', label: 'Recently closed' },
        ]}
      />
      <div
        className="row-flex"
        style={{ gap: 'var(--s-2)', margin: 'var(--s-3) 0' }}
      >
        {section === 'history' ? (
          <Input
            aria-label="Search history"
            placeholder="Search history"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
        ) : (
          <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
            The last tabs you closed. Ctrl+Shift+T reopens the newest.
          </span>
        )}
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
      </div>

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
