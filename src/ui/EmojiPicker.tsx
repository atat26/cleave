// The emoji picker: a grid of emoji in groups, drawn by the popup layer. The data
// is a menu (see emojiPickerItems in menuData.ts): "headers" start a group and
// each item is one emoji. Arrow keys move around the grid, Enter chooses, Escape
// closes. Like a menu it opens at a point and moves to stay inside the window.
import { useLayoutEffect, useRef, useState } from 'react';
import type { MenuEntry, MenuItem } from '../menuTypes';

const MARGIN = 8;
const COLUMNS = 8;

interface Group {
  name: string | null;
  entries: MenuEntry[];
}

// "Use the default" first (no group name), then each named group.
const groupsOf = (items: MenuItem[]): Group[] => {
  const groups: Group[] = [{ name: null, entries: [] }];
  for (const item of items) {
    if (item.type === 'header') groups.push({ name: item.label, entries: [] });
    else if (item.type === 'item') groups[groups.length - 1].entries.push(item);
  }
  return groups.filter((g) => g.entries.length > 0);
};

export function EmojiPicker({
  items,
  x,
  y,
  onChoose,
  onClose,
}: {
  items: MenuItem[];
  x: number;
  y: number;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const groups = groupsOf(items);
  // Every choosable thing in reading order; the keyboard moves through these.
  const flat = groups.flatMap((g) => g.entries);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      flat.findIndex((e) => e.checked),
    ),
  );

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPos({
      left: Math.max(
        MARGIN,
        Math.min(x, window.innerWidth - rect.width - MARGIN),
      ),
      top: Math.max(
        MARGIN,
        Math.min(y, window.innerHeight - rect.height - MARGIN),
      ),
    });
    element.focus({ preventScroll: true });
  }, [x, y]);

  // Keep the chosen emoji in view while moving with the keyboard.
  useLayoutEffect(() => {
    box.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const move = (to: number) =>
    setActive(Math.max(0, Math.min(flat.length - 1, to)));

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowRight':
        move(active + 1);
        break;
      case 'ArrowLeft':
        move(active - 1);
        break;
      case 'ArrowDown':
        move(active + COLUMNS);
        break;
      case 'ArrowUp':
        move(active - COLUMNS);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(flat.length - 1);
        break;
      case 'Enter':
      case ' ':
        if (flat[active]) onChoose(flat[active].id);
        break;
      case 'Escape':
        onClose();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  let index = -1;
  return (
    <div
      ref={box}
      className="popup emoji-picker"
      role="listbox"
      aria-label="Choose an icon"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ position: 'fixed', left: pos.left, top: pos.top }}
    >
      {groups.map((group) => (
        <div key={group.name ?? 'default'}>
          {group.name && <div className="emoji-group">{group.name}</div>}
          <div className={group.name ? 'emoji-grid' : undefined}>
            {group.entries.map((entry) => {
              index++;
              const here = index;
              return group.name ? (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={entry.checked === true}
                  data-index={here}
                  className={
                    here === active ? 'emoji-cell is-active' : 'emoji-cell'
                  }
                  onMouseEnter={() => setActive(here)}
                  onClick={() => onChoose(entry.id)}
                >
                  {entry.label}
                </button>
              ) : (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  data-index={here}
                  className={
                    here === active
                      ? 'btn sm emoji-reset is-active'
                      : 'btn sm emoji-reset'
                  }
                  onMouseEnter={() => setActive(here)}
                  onClick={() => onChoose(entry.id)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
