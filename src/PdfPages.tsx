import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from './pdfLib';

// An uploaded PDF drawn page by page, one under the other. Each page is a picture with
// invisible text on top, so words can be selected and copied. The PDF library
// (PDF.js) is only loaded when a PDF is opened. PDF scripts and forms never run.
// `zoom` is the same factor web pages use. At 100% a page is its real size, or as wide
// as the window if that is narrower; other zooms are a share of that.
const REAL_SIZE = 4 / 3; // PDF points to screen pixels
const GUTTER = 48; // room left and right of a page

export function PdfPages({
  data,
  zoom,
  onPages,
}: {
  data: Uint8Array;
  zoom: number;
  onPages: (count: number) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | 'broken' | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    setDoc(null);
    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        // PDF.js takes over (and empties) the bytes it is given, so give it a copy.
        const loading = pdfjs.getDocument({ data: data.slice() });
        task = loading;
        const opened = await loading.promise;
        if (cancelled) return;
        onPages(opened.numPages);
        setDoc(opened);
      } catch {
        if (!cancelled) setDoc('broken');
      }
    })();
    return () => {
      cancelled = true;
      if (task) void task.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setRoom(el.clientWidth);
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [doc]);

  if (doc === null) {
    return (
      <p className="muted" style={{ padding: 'var(--s-5)' }}>
        Loading…
      </p>
    );
  }
  if (doc === 'broken') {
    return (
      <p className="muted" style={{ padding: 'var(--s-5)' }}>
        This PDF could not be read. It may be damaged or password protected.
      </p>
    );
  }
  return (
    <div className="file-stage" ref={stage}>
      <div className="pdf-pages">
        {Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={i} doc={doc} number={i + 1} zoom={zoom} room={room} />
        ))}
      </div>
    </div>
  );
}

// One page, drawn only once it scrolls near the screen.
function PdfPage({
  doc,
  number,
  zoom,
  room,
}: {
  doc: PDFDocumentProxy;
  number: number;
  zoom: number;
  room: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState<{
    w: number;
    h: number;
    scale: number;
  } | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const watcher = new IntersectionObserver(
      (entries) => setNear(entries.some((e) => e.isIntersecting)),
      { rootMargin: '600px' },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let drawing: { cancel: () => void; promise: Promise<unknown> } | null =
      null;
    let writing: { cancel: () => void } | null = null;
    void doc.getPage(number).then(async (page) => {
      if (cancelled) return;
      const width = page.getViewport({ scale: 1 }).width;
      const fit =
        room > 0 ? Math.min(REAL_SIZE, (room - GUTTER) / width) : REAL_SIZE;
      const scale = zoom * fit;
      const view = page.getViewport({ scale });
      setSize({ w: view.width, h: view.height, scale });
      if (!near || !canvas.current || !text.current) return;
      const sharp = window.devicePixelRatio || 1;
      const sharpView = page.getViewport({ scale: scale * sharp });
      const el = canvas.current;
      el.width = Math.floor(sharpView.width);
      el.height = Math.floor(sharpView.height);
      drawing = page.render({ canvas: el, viewport: sharpView });
      drawing.promise.catch(() => {});

      // The invisible text over the picture.
      const pdfjs = await loadPdfjs();
      if (cancelled || !text.current) return;
      const layer = text.current;
      layer.replaceChildren();
      const lines = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: layer,
        viewport: view,
      });
      writing = lines;
      lines.render().catch(() => {});
    });
    return () => {
      cancelled = true;
      drawing?.cancel();
      writing?.cancel();
    };
  }, [doc, number, zoom, near, room]);

  return (
    <div
      ref={holder}
      className="pdf-page"
      style={
        {
          width: size?.w ?? 600 * zoom,
          height: size?.h ?? 800 * zoom,
          // What the text layer measures its words against.
          '--total-scale-factor': size?.scale ?? zoom * REAL_SIZE,
          '--scale-round-x': '1px',
          '--scale-round-y': '1px',
        } as CSSProperties
      }
    >
      <canvas ref={canvas} aria-label={`Page ${number}`} />
      <div ref={text} className="pdf-text" />
    </div>
  );
}
