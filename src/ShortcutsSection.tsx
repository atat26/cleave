import { useState } from 'react';
import { filterShortcuts, SHORTCUT_GROUPS } from './shortcuts';
import { Input, Kbd } from './ui/controls';

// Settings > Keyboard shortcuts: every shortcut, grouped, with a search. (It only
// lists them; the keys cannot be changed yet.)
export function ShortcutsSection() {
  const [query, setQuery] = useState('');
  const groups = filterShortcuts(SHORTCUT_GROUPS, query);
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search shortcuts"
        aria-label="Search shortcuts"
      />
      {groups.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No shortcut matches.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.title}>
          <div className="sect-title">{group.title}</div>
          <div className="pv-list">
            {group.shortcuts.map((shortcut) => (
              <div className="pv-row" key={shortcut.keys}>
                <span className="grow">{shortcut.does}</span>
                <span
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--s-1)',
                    justifyContent: 'flex-end',
                  }}
                >
                  {shortcut.keys.split(' / ').map((keys) => (
                    <Kbd key={keys}>{keys}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
