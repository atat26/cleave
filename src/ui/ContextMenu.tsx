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
  maxHeight,
  scrollTo,
}: {
  items: MenuItem[];
  depth: number;
  onChoose: (id: string) => void;
  onCloseAll: () => void;
  // Close just this list (a submenu), returning to its parent.
  onCloseSelf: () => void;
  // The most room the list may take (it scrolls beyond that).
  maxHeight?: number;
  // Scroll the list to this much from its top.
  scrollTo?: number;
}) {
  const list = useRef<HTMLUListElement>(null);
  // A menu opened from a control starts on the row that lines up with it.
  const [active, setActive] = useState(() =>
    depth === 0
      ? items.findIndex((item) => item.type === 'item' && item.anchor)
      : -1,
  );
  const [open, setOpen] = useState(-1);
  const anyIcon = items.some(
    (item) => item.type === 'item' && (item.icon || item.swatch || item.emoji),
  );
  // A long menu scrolls instead of running off the window. (A menu that opens
  // submenus cannot scroll: that would cut the submenus off. They are short.)
  const scrolls = !items.some((item) => item.type === 'item' && item.submenu);

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

  // Moving with the keyboard keeps the chosen item in view.
  useLayoutEffect(() => {
    if (active < 0 || scrollTo !== undefined) return;
    const rows = list.current?.querySelectorAll(':scope > li');
    rows?.[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, scrollTo]);

  // A menu lined up with its control is scrolled so the row stays lined up.
  useLayoutEffect(() => {
    if (scrollTo !== undefined && list.current)
      list.current.scrollTop = scrollTo;
  }, [scrollTo, maxHeight]);

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
    if (item.submenu && !item.choosable) {
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
      style={{
        outline: 'none',
        ...(scrolls
          ? {
              maxHeight: maxHeight ?? window.innerHeight - 2 * MARGIN,
              overflowY: 'auto',
            }
          : {}),
      }}
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
      {item.swatch ? (
        <span
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            margin: '0 2px',
            borderRadius: 3,
            background: item.swatch,
            flex: 'none',
          }}
        />
      ) : item.emoji ? (
        <span aria-hidden="true" className="menu-emoji">
          {item.emoji}
        </span>
      ) : item.icon ? (
        <Icon name={item.icon} />
      ) : (
        anyIcon && <span style={{ width: 16, flex: 'none' }} />
      )}
      <span className="lbl">{item.label}</span>
      {item.checked && <Icon name="check" />}
      {item.shortcut && <span className="sc">{item.shortcut}</span>}
      {item.submenu && <Icon name="chev-r" className="sub" />}
      {children}
    </li>
  );
}

// The menu itself, placed at (x, y) in the window and kept inside it. `onClose`
// is called for Escape; choosing an item calls `onChoose` with its id.
//
// A menu opened from a control that shows the current choice (the chat's name, the
// model chip) gives `alignCenter`, the middle of that control: the row marked
// `anchor` is lined up with it and the menu runs down from there to the bottom of
// the window, scrolling if it is longer.
export function ContextMenu({
  items,
  x,
  y,
  alignCenter,
  onChoose,
  onClose,
}: {
  items: MenuItem[];
  x: number;
  y: number;
  alignCenter?: number;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{
    left: number;
    top: number;
    maxHeight?: number;
    scrollTo?: number;
  }>({ left: x, top: y });

  useLayoutEffect(() => {
    const element = holder.current;
    if (!element) return;
    const list = element.firstElementChild as HTMLElement | null;
    const { width, height: shown } = element.getBoundingClientRect();
    const natural = Math.max(shown, list?.scrollHeight ?? 0);

    let left = x;
    if (left + width > window.innerWidth - MARGIN) left = x - width;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));

    const index = items.findIndex(
      (item) => item.type === 'item' && item.anchor,
    );
    const row =
      alignCenter !== undefined && index >= 0
        ? list?.querySelectorAll<HTMLElement>(':scope > li')[index]
        : undefined;

    if (row && list && alignCenter !== undefined) {
      // Line the chosen row up with the control, and run down from there.
      const rowMiddle = row.offsetTop + row.offsetHeight / 2;
      const room = window.innerHeight - 2 * MARGIN;
      const wanted = alignCenter - rowMiddle;
      if (wanted >= MARGIN) {
        const top = wanted;
        const fits = natural <= window.innerHeight - MARGIN - top;
        setAt({
          left,
          top,
          maxHeight: fits ? undefined : window.innerHeight - MARGIN - top,
        });
      } else {
        // The rows above it do not fit above the control: start at the top of the
        // window and scroll so the chosen row stays lined up as well as it can.
        const scrollTo = Math.max(
          0,
          Math.min(
            rowMiddle - (alignCenter - MARGIN),
            Math.max(0, natural - room),
          ),
        );
        setAt({
          left,
          top: MARGIN,
          maxHeight: natural > room ? room : undefined,
          scrollTo: natural > room ? scrollTo : undefined,
        });
      }
      return;
    }

    // Any other menu: open at the point, or flip above it, and stay in the window.
    let top = y;
    if (top + natural > window.innerHeight - MARGIN) top = y - natural;
    top = Math.max(
      MARGIN,
      Math.min(top, window.innerHeight - natural - MARGIN),
    );
    setAt({ left, top });
  }, [x, y, alignCenter, items]);

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
        maxHeight={at.maxHeight}
        scrollTo={at.scrollTo}
      />
    </div>
  );
}
