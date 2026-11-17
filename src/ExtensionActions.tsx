import { useEffect, useRef, useState } from 'react';
import type { ExtensionAction, ExtensionBox, ExtensionRow } from './types';
import { IconButton } from './ui/controls';

const PARTITION = '_self';

const boxOf = (element: Element): ExtensionBox => {
  const r = element.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};

// Open an extension's popup (or tell it its button was pressed), under `box`.
const open = (extensionId: string, box: ExtensionBox) =>
  void window.browserAction?.activate(PARTITION, {
    eventType: 'click',
    extensionId,
    // -1: the page you are on.
    tabId: -1,
    // The buttons are at the right of the window: the popup's right edge lines up
    // with the button's, so it grows to the left. (The extension system names
    // this "left".)
    alignment: 'bottom left',
    anchorRect: box,
  });

// One extension's button in the toolbar: its picture, and a badge if it has one.
function ActionButton({
  item,
  action,
  activeTabId,
  popupId,
}: {
  item: ExtensionRow;
  action: ExtensionAction | undefined;
  activeTabId: number | undefined;
  // Which extension's popup is open right now.
  popupId: React.MutableRefObject<string | null>;
}) {
  // Was this button's popup open when the button was pressed? Pressing the button
  // takes the keyboard away from the popup, which closes it, so by the time the
  // click arrives the popup is already gone: that click should leave it closed.
  const wasOpen = useRef(false);
  // Its own picture if the extension system has one now; otherwise the one from
  // its manifest, or its first letter.
  const [broken, setBroken] = useState(false);
  const here =
    activeTabId === undefined ? undefined : action?.tabs[activeTabId];
  const title = here?.title ?? action?.title ?? item.name;
  const badge = here?.text ?? action?.text;
  const badgeColor = here?.color ?? action?.color;
  const src = broken
    ? item.icon
    : `crx://extension-icon/${item.id}/32/2?tabId=-1&partition=${PARTITION}&t=${action?.iconModified ?? 0}`;
  return (
    <button
      type="button"
      className="tb-ext"
      title={title}
      aria-label={title}
      onMouseDown={() => {
        wasOpen.current = popupId.current === item.id;
      }}
      onClick={(event) => {
        const box = boxOf(event.currentTarget);
        if (wasOpen.current) {
          wasOpen.current = false;
          // It is normally closed already (pressing the button closed it). If it
          // is somehow still open a moment later, pressing again closes it.
          setTimeout(() => {
            if (popupId.current === item.id) open(item.id!, box);
          }, 150);
          return;
        }
        open(item.id!, box);
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
      {src ? (
        <img
          src={src}
          alt=""
          width={20}
          height={20}
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden="true" className="tb-ext-letter">
          {item.name.charAt(0)}
        </span>
      )}
      {badge && (
        <span
          className="tb-ext-badge"
          style={{ background: badgeColor || undefined }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// The extension buttons in the toolbar: the ones you pinned, then a puzzle button
// with the full list. Nothing shows until an extension with a button is on. In a
// narrow toolbar the pinned buttons fold into the puzzle menu.
export function ExtensionActions() {
  const [items, setItems] = useState<ExtensionRow[]>([]);
  const [actions, setActions] = useState<ExtensionAction[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | undefined>();
  const puzzle = useRef<HTMLButtonElement>(null);
  const popupId = useRef<string | null>(null);
  useEffect(
    () =>
      window.browserApi.onExtensionPopup((id) => {
        popupId.current = id;
      }),
    [],
  );

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

  // The extension system tells us when a button changes (its badge, its picture).
  useEffect(() => {
    const api = window.browserAction;
    if (!api) return;
    const update = (state: {
      activeTabId?: number;
      actions: ExtensionAction[];
    }) => {
      setActions(state.actions);
      setActiveTabId(state.activeTabId);
    };
    api.addEventListener('update', update);
    api.addObserver(PARTITION);
    void api.getState(PARTITION).catch(() => undefined);
    return () => {
      api.removeEventListener('update', update);
      api.removeObserver(PARTITION);
    };
  }, []);

  // The puzzle menu asks for a popup to be opened from the puzzle button.
  useEffect(
    () =>
      window.browserApi.onExtensionActivate((extensionId, box) =>
        open(extensionId, box),
      ),
    [],
  );

  const withButton = items.filter(
    (e) => e.enabled && e.hasAction && e.loaded && e.id !== null,
  );
  if (withButton.length === 0) return null;
  const pinned = withButton.filter((e) => e.pinned);

  return (
    <span className="tb-exts">
      <span className="tb-ext-pinned">
        {pinned.map((item) => (
          <ActionButton
            key={item.key}
            item={item}
            action={actions.find((a) => a.id === item.id)}
            activeTabId={activeTabId}
            popupId={popupId}
          />
        ))}
      </span>
      <span ref={puzzle}>
        <IconButton
          icon="puzzle"
          label="Extensions"
          aria-haspopup="menu"
          onClick={(event) => {
            const box = boxOf(event.currentTarget);
            window.browserApi.showExtensionsPuzzle(
              box.x + box.width - 240,
              box.y + box.height + 4,
              box,
            );
          }}
        />
      </span>
    </span>
  );
}
