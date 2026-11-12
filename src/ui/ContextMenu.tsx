// A context menu, drawn from plain data (see menuTypes.ts). It handles the mouse
// and the keyboard the way a native menu does:
//   Up / Down      move between items          Home / End   first / last item
//   Right          open a submenu              Left         close a submenu
//   Enter / Space  choose (or open a submenu)  Escape       close
// It opens at a point and moves to stay inside the window. The look is in
// components.css (.menu).
import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { MenuEntry, MenuItem } from '../menuTypes';
import { Icon } from './Icon';

const MARGIN = 8;

// The indexes of the items that can be moved to.
const reachable = (items: MenuItem[]): number[] =>
  items.flatMap((item, index) =>
    item.type === 'item' && !item.disabled ? [index] : [],
  );

function MenuList({
  items,
  depth,
  onChoose,
  onCloseAll,
  onCloseSelf,
}: {
  items: MenuItem[];
  depth: number;
  onChoose: (id: string) => void;
  onCloseAll: () => void;
  // Close just this list (a submenu), returning to its parent.
  onCloseSelf: () => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(-1);
  const anyIcon = items.some((item) => item.type === 'item' && item.icon);

  // This list takes the keyboard when it appears.
  useLayoutEffect(() => {
    list.current?.focus({ preventScroll: true });
  }, []);

  // A submenu that would run off the right or bottom edge moves to the other side.
  useLayoutEffect(() => {
    const element = list.current;
    if (!element || depth === 0) return;
    const rect = element.getBoundingClientRect();
    if (rect.right > window.innerWidth - MARGIN) {
      element.style.left = 'auto';
      element.style.right = 'calc(100% - 4px)';
    }
    if (rect.bottom > window.innerHeight - MARGIN) {
      element.style.top = `${-5 - (rect.bottom - window.innerHeight + MARGIN)}px`;
    }
  }, [depth, open]);

  const move = (to: number) => {
    setActive(to);
    setOpen(-1);
  };

  const step = (direction: 1 | -1) => {
    const can = reachable(items);
    if (can.length === 0) return;
    const at = can.indexOf(active);
    const next =
      at === -1
        ? direction === 1
          ? 0
          : can.length - 1
        : (at + direction + can.length) % can.length;
    move(can[next]);
  };

  const activate = (index: number) => {
    const item = items[index];
    if (!item || item.type !== 'item' || item.disabled) return;
    if (item.submenu) {
      setActive(index);
      setOpen(index);
    } else {
      onChoose(item.id);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        step(1);
        break;
      case 'ArrowUp':
        step(-1);
        break;
      case 'Home':
        move(reachable(items)[0] ?? -1);
        break;
      case 'End':
        move(reachable(items).at(-1) ?? -1);
        break;
      case 'ArrowRight': {
        const item = items[active];
        if (item?.type === 'item' && item.submenu && !item.disabled) {
          setOpen(active);
        }
        break;
      }
      case 'ArrowLeft':
        if (depth > 0) onCloseSelf();
        break;
      case 'Enter':
      case ' ':
        if (active >= 0) activate(active);
        break;
      case 'Escape':
        if (depth > 0) onCloseSelf();
        else onCloseAll();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <ul
      ref={list}
      className={depth === 0 ? 'menu menu-root' : 'menu submenu'}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ outline: 'none' }}
    >
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <li key={`s${index}`} className="sep" role="separator" />;
        }
        if (item.type === 'header') {
          return (
            <li key={`h${index}`} className="hdr" role="presentation">
              {item.label}
            </li>
          );
        }
        return (
          <MenuRow
            key={item.id}
            item={item}
            anyIcon={anyIcon}
            highlighted={active === index || open === index}
            submenuOpen={open === index}
            onHover={() => {
              if (item.disabled) return;
              setActive(index);
              setOpen(item.submenu ? index : -1);
            }}
            onClick={() => activate(index)}
          >
            {open === index && item.submenu && (
              <MenuList
                items={item.submenu}
                depth={depth + 1}
                onChoose={onChoose}
                onCloseAll={onCloseAll}
                onCloseSelf={() => {
                  setOpen(-1);
                  list.current?.focus({ preventScroll: true });
                }}
              />
            )}
          </MenuRow>
        );
      })}
    </ul>
  );
}

function MenuRow({
  item,
  anyIcon,
  highlighted,
  submenuOpen,
  onHover,
  onClick,
  children,
}: {
  item: MenuEntry;
  anyIcon: boolean;
  highlighted: boolean;
  submenuOpen: boolean;
  onHover: () => void;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const classes = [
    item.danger ? 'danger' : '',
    highlighted ? 'is-hover' : '',
    submenuOpen ? 'open' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li
      className={classes}
      role="menuitem"
      aria-disabled={item.disabled || undefined}
      aria-haspopup={item.submenu ? 'menu' : undefined}
      aria-expanded={item.submenu ? submenuOpen : undefined}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      {item.icon ? (
        <Icon name={item.icon} />
      ) : (
        anyIcon && <span style={{ width: 16, flex: 'none' }} />
      )}
      <span className="lbl">{item.label}</span>
      {item.shortcut && <span className="sc">{item.shortcut}</span>}
      {item.submenu && <Icon name="chev-r" className="sub" />}
      {children}
    </li>
  );
}

// The menu itself, placed at (x, y) in the window and kept inside it. `onClose`
// is called for Escape; choosing an item calls `onChoose` with its id.
export function ContextMenu({
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
  const holder = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: x, top: y });

  // Once its size is known, flip to the other side of the pointer if it would run
  // off an edge, and never go past the window.
  useLayoutEffect(() => {
    const element = holder.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + width > window.innerWidth - MARGIN) left = x - width;
    if (top + height > window.innerHeight - MARGIN) top = y - height;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));
    setAt({ left, top });
  }, [x, y, items]);

  return (
    <div
      ref={holder}
      style={{ position: 'fixed', left: at.left, top: at.top, zIndex: 1000 }}
    >
      <MenuList
        items={items}
        depth={0}
        onChoose={onChoose}
        onCloseAll={onClose}
        onCloseSelf={onClose}
      />
    </div>
  );
}
