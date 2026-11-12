// The popup layer: a transparent page that sits above the whole window (above the
// web pages, the sidebar and the chat) and draws menus. While a menu is open this
// page covers the window, so a click anywhere else closes the menu, the way a
// native menu behaves. The app (main process) decides what the menu holds and
// what each item does; this page only draws it and reports the item chosen.
import { useEffect, useState } from 'react';
import type { MenuItem } from './menuTypes';
import { ContextMenu } from './ui/ContextMenu';
import { EmojiPicker } from './ui/EmojiPicker';

interface Shown {
  items: MenuItem[];
  x: number;
  y: number;
  alignCenter?: number;
  picker?: boolean;
}

export function PopupApp() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    // This page must show nothing but the menu.
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const stopShow = window.browserApi.onPopupShow(setShown);
    const stopHide = window.browserApi.onPopupHide(() => setShown(null));
    window.browserApi.popupReady();
    return () => {
      stopShow();
      stopHide();
    };
  }, []);

  if (!shown) return null;

  const close = () => {
    setShown(null);
    window.browserApi.popupClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0 }}
      // A press anywhere outside the menu closes it (the menu stops its own).
      onMouseDown={close}
      onContextMenu={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div onMouseDown={(event) => event.stopPropagation()}>
        {shown.picker ? (
          <EmojiPicker
            items={shown.items}
            x={shown.x}
            y={shown.y}
            onClose={close}
            onChoose={(id) => {
              setShown(null);
              window.browserApi.popupChoose(id);
            }}
          />
        ) : (
          <ContextMenu
            items={shown.items}
            x={shown.x}
            y={shown.y}
            alignCenter={shown.alignCenter}
            onClose={close}
            onChoose={(id) => {
              setShown(null);
              window.browserApi.popupChoose(id);
            }}
          />
        )}
      </div>
    </div>
  );
}
