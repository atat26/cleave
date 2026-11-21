// The cards a site gets in the popup layer, drawn from the same plain menu data
// (menuTypes.ts) as the menus, but laid out like Chrome's:
//   'prompt': a site asks for something (a title, then a few big buttons).
//   'site':   what this site may do (its name and connection, then a row per
//             permission with a small Ask / Allow / Block switch, and a reset).
// Escape closes it. The look is in components.css (.site-panel).
import { useLayoutEffect, useRef, useState } from 'react';
import type { MenuEntry, MenuItem } from '../menuTypes';
import { Icon } from './Icon';
import { Button, Segmented } from './controls';

const MARGIN = 8;
const WIDTH = 340;

export function SitePanel({
  kind,
  items,
  x,
  y,
  onChoose,
  onClose,
}: {
  kind: 'prompt' | 'site';
  items: MenuItem[];
  x: number;
  y: number;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: x, top: y });

  // Stay inside the window.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    const height = box?.height ?? 0;
    setAt({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - WIDTH - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y, items]);

  // The first button gets the keyboard, so Enter answers and Tab moves on.
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    // Only when it first appears.
  }, []);

  const header = items.find((item) => item.type === 'header');
  const entries = items.filter(
    (item): item is MenuEntry => item.type === 'item',
  );

  return (
    <div
      ref={ref}
      className={`site-panel site-panel-${kind}`}
      role="dialog"
      aria-label={header?.label}
      style={{ left: at.left, top: at.top, width: WIDTH }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {header && (
        <div className="sp-head">
          {header.icon && (
            <span className="sp-icon">
              <Icon name={header.icon} />
            </span>
          )}
          <div className="sp-titles">
            <h3>{header.label}</h3>
            {header.detail && <p className="sp-detail">{header.detail}</p>}
          </div>
        </div>
      )}
      {kind === 'prompt' ? (
        <div className="sp-actions">
          {entries.map((entry, index) => (
            <Button
              key={entry.id}
              variant={index === 0 ? 'primary' : 'secondary'}
              onClick={() => onChoose(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      ) : (
        <>
          {entries.some((e) => e.submenu) && (
            <p className="sp-section">
              {entries.every((e) => !e.submenu || e.id === 'site.assistant')
                ? 'Assistant'
                : 'Permissions'}
            </p>
          )}
          {entries.map((entry) => {
            if (entry.submenu) {
              const options = entry.submenu.filter(
                (sub): sub is MenuEntry => sub.type === 'item',
              );
              const current =
                options.find((o) => o.checked)?.id ?? options[0]?.id;
              return (
                <div className="sp-row" key={entry.id}>
                  {entry.icon && <Icon name={entry.icon} />}
                  <span className="sp-label">{entry.label}</span>
                  <Segmented
                    label={entry.label}
                    value={current ?? ''}
                    options={options.map((o) => ({
                      value: o.id,
                      label: o.label,
                    }))}
                    onChange={onChoose}
                  />
                </div>
              );
            }
            if (entry.disabled) {
              return (
                <p className="sp-note" key={entry.id}>
                  {entry.label}
                </p>
              );
            }
            return (
              <div className="sp-foot" key={entry.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={entry.icon}
                  onClick={() => onChoose(entry.id)}
                >
                  {entry.label}
                </Button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
