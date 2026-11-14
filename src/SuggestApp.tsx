// The address-bar suggestions' own page. It is drawn in a small view of its own
// under the address bar (see tabs.ts), so it can sit over the web page. It never
// takes the keyboard: the address bar sends it the rows and which one is
// highlighted; a click on a row picks it.
import { useEffect, useState } from 'react';
import type { Suggestion, SuggestionKind } from './suggest';
import { Icon } from './ui/Icon';
import type { IconName } from './ui/Icon';

const ICON: Record<SuggestionKind, IconName> = {
  search: 'search',
  go: 'globe',
  bookmark: 'star',
  history: 'clock',
  tab: 'page',
};

export function SuggestApp() {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(-1);
  // The row the mouse is over (it wins over the keyboard's until the rows change).
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    // This page shows nothing but the list.
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const stop = window.browserApi.onSuggestRows((payload) => {
      setRows(payload.rows);
      setSelected(payload.selected);
      setHover(-1);
    });
    window.browserApi.suggestReady();
    return stop;
  }, []);

  const active = hover >= 0 ? hover : selected;
  return (
    <div className="popup suggest-list" role="listbox" aria-label="Suggestions">
      {rows.map((row, index) => (
        <div
          key={`${row.kind}:${row.url}`}
          role="option"
          aria-selected={index === active}
          className={index === active ? 'suggest-row is-active' : 'suggest-row'}
          onMouseMove={() => setHover(index)}
          // Pick at once (before the address bar can lose the keyboard and close
          // the list).
          onMouseDown={(event) => {
            event.preventDefault();
            window.browserApi.suggestPick(index);
          }}
        >
          <Icon name={ICON[row.kind]} />
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="truncate" style={{ display: 'block' }}>
              {row.title}
            </span>
            <span
              className="truncate muted"
              style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
            >
              {row.detail}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
