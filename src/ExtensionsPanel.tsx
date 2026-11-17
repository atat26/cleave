import { useEffect, useState } from 'react';
import type { ExtensionRow } from './types';
import { Button, IconButton, Switch } from './ui/controls';
import { Icon } from './ui/Icon';

// One extension: its picture, name and version, and a switch. Click the row (or
// press Enter) to see what it can do, in plain words. Remove shows when the
// pointer or the keyboard is on the row; it is also in the right-click menu and
// on the Delete key.
function Row({ item }: { item: ExtensionRow }) {
  const [open, setOpen] = useState(false);
  const summary = item.words[0] ?? 'No special access';
  return (
    <div
      style={{
        borderBottom: '1px solid var(--c-border)',
        opacity: item.enabled ? 1 : 0.65,
      }}
    >
      <div
        className="lrow reveal-host lib-row"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title={open ? 'Hide details' : 'Show what it can do'}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((v) => !v);
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            void window.browserApi.extensionsRemove(item.key);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          window.browserApi.showExtensionMenu(
            item.key,
            event.clientX,
            event.clientY,
          );
        }}
      >
        {item.icon ? (
          <img
            src={item.icon}
            alt=""
            width={24}
            height={24}
            style={{ flex: 'none', borderRadius: 4 }}
          />
        ) : (
          <span
            style={{
              flex: 'none',
              width: 24,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Icon name="puzzle" />
          </span>
        )}
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="truncate" style={{ display: 'block' }}>
            {item.name}
          </span>
          <span
            className="truncate muted"
            style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
          >
            {item.review
              ? item.review
              : item.enabled && !item.loaded
                ? 'Could not start'
                : `Version ${item.version}`}
          </span>
        </span>
        <IconButton
          icon="x"
          size="sm"
          className="reveal"
          label={`Remove ${item.name}`}
          onClick={(event) => {
            event.stopPropagation();
            void window.browserApi.extensionsRemove(item.key);
          }}
        />
        <span onClick={(event) => event.stopPropagation()}>
          <Switch
            label={`${item.name} on or off`}
            checked={item.enabled}
            onChange={(next) =>
              void window.browserApi.extensionsSetEnabled(item.key, next)
            }
          />
        </span>
      </div>
      {open && (
        <div
          className="muted"
          style={{
            fontSize: 'var(--fs-sm)',
            padding: '0 var(--s-2) var(--s-3) 36px',
          }}
        >
          {item.words.length <= 1 && <div>{summary}</div>}
          {item.words.length > 1 && (
            <ul style={{ margin: 0, paddingLeft: 'var(--s-4)' }}>
              {item.words.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// The Extensions panel: the extensions you added. Add one from the Chrome Web Store
// or from a folder; switch it off, pin it, or remove it.
export function ExtensionsPanel() {
  const [items, setItems] = useState<ExtensionRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void window.browserApi.extensionsList().then((found) => {
        if (!cancelled) setItems(found);
      });
    load();
    const stop = window.browserApi.onExtensionsChanged(load);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // What came of adding one from a folder.
  useEffect(() => window.browserApi.onExtensionsMessage(setMessage), []);

  return (
    <div>
      <div
        className="row-flex"
        style={{ gap: 'var(--s-2)', margin: '0 0 var(--s-3)' }}
      >
        <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
          Only add ones you trust.
        </span>
        <Button
          size="sm"
          icon="plus"
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMessage(null);
            window.browserApi.showExtensionsAddMenu(
              box.right - 220,
              box.bottom + 4,
            );
          }}
        >
          Add extension…
        </Button>
      </div>
      {message !== null && (
        <p
          role="status"
          style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--fs-sm)' }}
        >
          {message}
        </p>
      )}
      {items === null ? null : items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No extensions yet. Choose “Add extension…” to get one from the Chrome
          Web Store or from a folder.
        </p>
      ) : (
        items.map((item) => <Row key={item.key} item={item} />)
      )}
    </div>
  );
}
