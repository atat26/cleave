// Tab search, drawn in the popup layer: a box over the page with a list of open and
// recently closed tabs, filtered as you type. Up and Down move, Enter opens, Esc
// closes. It is described by the same plain menu data as menus (menuTypes.ts), with
// the filtering in tabSearch.ts. The look is in components.css (.tab-search).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MenuEntry, MenuItem } from '../menuTypes';
import { filterTabSearch } from '../tabSearch';
import { Icon } from './Icon';

const WIDTH = 560;

function SiteImage({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img
      className="ts-icon"
      src={src}
      alt=""
      width={16}
      height={16}
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="ts-icon ts-globe" aria-hidden="true">
      <Icon name="globe" />
    </span>
  );
}

export function TabSearch({
  items,
  onChoose,
  onClose,
}: {
  items: MenuItem[];
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => filterTabSearch(items, query), [items, query]);
  const rows = shown.filter((i): i is MenuEntry => i.type === 'item');
  const current = Math.min(index, Math.max(0, rows.length - 1));

  // Keep the highlighted row in view as the arrows move.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [current, query]);

  return (
    <div
      className="tab-search"
      role="dialog"
      aria-label="Search tabs"
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
          placeholder="Search your tabs"
          aria-label="Search your tabs"
          spellCheck={false}
        />
      </div>
      <div className="ts-list" ref={listRef} role="listbox">
        {rows.length === 0 && (
          <p className="ts-empty">
            {items.length === 0 ? 'No tabs yet.' : 'No tab matches.'}
          </p>
        )}
        {shown.map((item, i) => {
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
              <SiteImage src={item.image} />
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
