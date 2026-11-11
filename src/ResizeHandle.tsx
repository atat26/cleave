import { useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { ResizeKind } from './types';

// A thin grab handle on the edge of a part of the frame (the sidebar, the chat
// or the right panel). Drag it to resize that part. While you drag, the app
// moves the edge to follow the mouse; when you let go it either snaps (to the
// icon strip, the compact chat bar, or closed) or stays at that size.
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
