import { useEffect, useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { ResizeKind } from './types';

// A thin grab handle on the edge of a part of the frame (the sidebar, the chat
// or the right panel). Drag it to resize that part. While you drag, the app
// moves the edge to follow the mouse; when you let go it either snaps (to the
// icon strip, the compact chat bar, or closed) or stays at that size.
// How far one arrow-key press moves the edge.
const KEY_STEP = 16;

export function ResizeHandle({
  kind,
  axis,
  grows,
  measure,
  style,
  title,
}: {
  kind: ResizeKind;
  // Which way the mouse moves to resize: sideways (x) or up and down (y).
  axis: 'x' | 'y';
  // +1: the part gets bigger as the mouse moves right/down. -1: left/up.
  grows: 1 | -1;
  // How big the part is right now, in pixels (read when the drag starts).
  measure: () => number;
  // Where the handle sits (position and thickness).
  style: CSSProperties;
  title: string;
}) {
  const drag = useRef<{ startMouse: number; startSize: number } | null>(null);
  const lastSize = useRef(0);
  const frame = useRef<number | undefined>(undefined);

  // screen coordinates do not change when a view resizes under the mouse, so
  // they are a steady way to measure how far the mouse has moved.
  const mouse = (event: ReactPointerEvent) =>
    axis === 'x' ? event.screenX : event.screenY;
  const sizeAt = (event: ReactPointerEvent) =>
    (drag.current?.startSize ?? 0) +
    grows * (mouse(event) - (drag.current?.startMouse ?? 0));

  // If the handle goes away while it is being dragged (the panel unmounted, say), the
  // pointer is never released to it: end the drag here, or the app would wait for it.
  useEffect(
    () => () => {
      if (drag.current !== null) {
        window.cancelAnimationFrame(frame.current ?? 0);
        drag.current = null;
        window.browserApi.endResize(kind, lastSize.current);
      }
    },
    [kind],
  );

  const finish = (event: ReactPointerEvent) => {
    if (drag.current === null) return;
    window.cancelAnimationFrame(frame.current ?? 0);
    lastSize.current = sizeAt(event);
    drag.current = null;
    window.browserApi.endResize(kind, lastSize.current);
  };

  return (
    <div
      className="resize-handle"
      // Also a keyboard control: focus it and use the arrow keys, 16 pixels at a time.
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={title}
      tabIndex={0}
      onKeyDown={(event) => {
        const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        const backward = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        if (event.key !== forward && event.key !== backward) return;
        event.preventDefault();
        const direction = event.key === forward ? 1 : -1;
        const size = measure() + grows * direction * KEY_STEP;
        // The same three steps as a mouse drag, done at once.
        window.browserApi.startResize(kind);
        window.browserApi.resize(kind, size);
        window.browserApi.endResize(kind, size);
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const size = measure();
        drag.current = { startMouse: mouse(event), startSize: size };
        lastSize.current = size;
        window.browserApi.startResize(kind);
      }}
      onPointerMove={(event) => {
        if (drag.current === null) return;
        lastSize.current = sizeAt(event);
        // At most one update per screen refresh.
        if (frame.current !== undefined) {
          window.cancelAnimationFrame(frame.current);
        }
        frame.current = window.requestAnimationFrame(() =>
          window.browserApi.resize(kind, lastSize.current),
        );
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      title={title}
      style={{
        cursor: axis === 'x' ? 'col-resize' : 'row-resize',
        zIndex: 10,
        ...style,
      }}
    />
  );
}
