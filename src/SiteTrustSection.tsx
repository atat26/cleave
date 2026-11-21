import { useEffect, useState } from 'react';
import type { SiteTrustRow } from './siteTrust';
import { Button, Input, Select } from './ui/controls';

// Settings > Assistant and sites: the websites the assistant may act on freely (Trusted), and the ones
// it may not read, act on or open (Blocked). Every other site is "ask first": your standing settings
// for typing, filling and going to an address stop at Ask there, and "Allow the rest of this reply"
// still works. Only you can change this list; the assistant has no way to.
export function SiteTrustSection() {
  const [rows, setRows] = useState<SiteTrustRow[] | null>(null);
  const [site, setSite] = useState('');
  const [level, setLevel] = useState<'trusted' | 'blocked'>('trusted');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.browserApi.siteTrustList().then(setRows);
  }, []);

  const change = async (
    name: string,
    to: 'trusted' | 'blocked' | 'unknown',
  ) => {
    const result = await window.browserApi.siteTrustSet(name, to);
    if (result.ok) {
      setRows(result.rows);
      setError(null);
      return true;
    }
    setError(result.error);
    return false;
  };

  const add = async () => {
    if (site.trim() === '') return;
    if (await change(site, level)) setSite('');
  };

  if (rows === null) return null;
  const trusted = rows.filter((r) => r.level === 'trusted');
  const blocked = rows.filter((r) => r.level === 'blocked');

  const list = (items: SiteTrustRow[], empty: string) =>
    items.length === 0 ? (
      <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
        {empty}
      </div>
    ) : (
      <div role="list">
        {items.map((row) => (
          <div
            key={row.host}
            role="listitem"
            tabIndex={0}
            className="reveal-host row-flex"
            style={{
              justifyContent: 'space-between',
              gap: 'var(--s-3)',
              padding: 'var(--s-2) 0',
            }}
            // A key for the hidden button: Delete takes the site off the list.
            onKeyDown={(event) => {
              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                void change(row.host, 'unknown');
              }
            }}
          >
            <span style={{ wordBreak: 'break-all' }}>{row.host}</span>
            <Button
              size="sm"
              variant="ghost"
              className="reveal"
              onClick={() => void change(row.host, 'unknown')}
              title="Take it off the list (the assistant asks first there again). Delete does the same."
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    );

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
        <strong>Trusted</strong>: the assistant can type, fill in forms, click
        and move around on that site without asking (anything that cannot be
        undone, like a Buy button, still asks). <strong>Blocked</strong>: it
        does not read, act on or open that site at all. Every other site is “ask
        first”: your standing settings for those actions stop at Ask, and “Allow
        the rest of this reply” still works. A site is exactly the name in the
        address bar: <code>www.example.com</code> is not{' '}
        <code>example.com</code>. You can also set it from the lock in the
        address bar, or from a card.
      </div>

      <form
        className="row-flex"
        style={{ gap: 'var(--s-3)' }}
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label="Website to add"
          placeholder="www.example.com"
          value={site}
          onChange={(event) => setSite(event.target.value)}
          style={{ flex: '1 1 0', minWidth: 0, width: 'auto' }}
          invalid={error !== null}
        />
        <Select
          aria-label="What the assistant may do there"
          style={{ flex: '0 0 auto', width: 'auto' }}
          value={level}
          onChange={(event) =>
            setLevel(event.target.value === 'blocked' ? 'blocked' : 'trusted')
          }
        >
          <option value="trusted">Trusted</option>
          <option value="blocked">Blocked</option>
        </Select>
        <Button type="submit" variant="primary" disabled={site.trim() === ''}>
          Add
        </Button>
      </form>
      {error !== null && (
        <div
          role="alert"
          style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-danger)' }}
        >
          {error}
        </div>
      )}

      <div>
        <div style={{ fontWeight: 600 }}>Trusted sites</div>
        {list(trusted, 'None yet. The assistant asks first everywhere.')}
      </div>
      <div>
        <div style={{ fontWeight: 600 }}>Blocked sites</div>
        {list(blocked, 'None.')}
      </div>
    </div>
  );
}
