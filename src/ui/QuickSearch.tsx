// Quick search (Ctrl+K), drawn in the popup layer: a box over the page. The rows come
// from the app (quickSearch.ts) as you type: first what you typed (go to it, search
// for it, ask about it), then what matches in your tabs, Spaces, artifacts, chats,
// bookmarks and history. Up and Down move, Enter picks, Esc closes. The look is the
// tab search's (components.css, .tab-search).
import { useEffect, useRef, useState } from 'react';
import type { MenuEntry, MenuItem } from '../menuTypes';
import { Icon } from './Icon';

const WIDTH = 600;

// Asking the app takes a moment, so a quick burst of typing asks once.
const WAIT_MS = 60;

function RowPicture({ item }: { item: MenuEntry }) {
  const [broken, setBroken] = useState(false);
  if (item.emoji) {
    return (
      <span className="ts-icon ts-emoji" aria-hidden="true">
        {item.emoji}
      </span>
    );
  }
  if (item.image && !broken) {
    return (
      <img
        className="ts-icon"
        src={item.image}
        alt=""
        width={16}
        height={16}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="ts-icon ts-globe" aria-hidden="true">
      <Icon name={item.icon ?? 'globe'} />
    </span>
  );
}

export function QuickSearch({
  items: first,
  onChoose,
  onClose,
}: {
  // The rows for an empty box (the app sends these along with the box).
  items: MenuItem[];
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MenuItem[]>(first);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Only the newest answer is shown.
  const asked = useRef(0);

  useEffect(() => {
    if (query === '') {
      asked.current++;
      setItems(first);
      return;
    }
    const mine = ++asked.current;
    const timer = setTimeout(() => {
      void window.browserApi.quickQuery(query).then((rows) => {
        if (mine === asked.current) setItems(rows);
      });
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [query, first]);

  const rows = items.filter((i): i is MenuEntry => i.type === 'item');
  const current = Math.min(index, Math.max(0, rows.length - 1));

  // Keep the highlighted row in view as the arrows move.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [current, items]);

  return (
    <div
      className="tab-search"
      role="dialog"
      aria-label="Search everything"
      style={{
        width: `min(${WIDTH}px, calc(100vw - 32px))`,
        left: '50%',
        transform: 'translateX(-50%)',
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          setIndex(rows.length === 0 ? 0 : (current + 1) % rows.length);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setIndex(
            rows.length === 0 ? 0 : (current - 1 + rows.length) % rows.length,
          );
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const chosen = rows[current];
          if (chosen) onChoose(chosen.id);
        }
      }}
    >
      <div className="ts-input">
        <Icon name="search" />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          placeholder="Search tabs, Spaces, artifacts, chats and history, or ask"
          aria-label="Search everything"
          spellCheck={false}
          maxLength={500}
        />
      </div>
      <div className="ts-list" ref={listRef} role="listbox">
        {rows.length === 0 && (
          <p className="ts-empty">
            {query === ''
              ? 'Nothing to show yet. Type to search.'
              : 'Nothing matches.'}
          </p>
        )}
        {items.map((item, i) => {
          if (item.type === 'header') {
            return (
              <div className="ts-head" key={`h${i}`}>
                {item.label}
              </div>
            );
          }
          if (item.type !== 'item') return null;
          const selected = rows[current]?.id === item.id;
          return (
            <div
              key={item.id}
              role="option"
              aria-selected={selected}
              className={selected ? 'ts-row is-selected' : 'ts-row'}
              onMouseMove={() => {
                const at = rows.findIndex((r) => r.id === item.id);
                if (at >= 0 && at !== current) setIndex(at);
              }}
              onClick={() => onChoose(item.id)}
            >
              <RowPicture item={item} />
              <span className="ts-text">
                <span className="ts-title">{item.label}</span>
                {item.detail && (
                  <span className="ts-detail">{item.detail}</span>
                )}
              </span>
              {item.checked && <span className="ts-here">Here</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
