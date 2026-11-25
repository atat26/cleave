import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from './pdfLib';
import { fileScroll } from './scrollMemory';

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
  memoryId,
}: {
  data: Uint8Array;
  zoom: number;
  onPages: (count: number) => void;
  // The artifact number: where you had scrolled to is kept under it while you are in another tab.
  memoryId: number;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | 'broken' | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  // Where you were (a share of the document, 0 to 1) when you left this PDF's tab, to go back to once
  // every page has its real size (until then the pages are placeholders and the document is not
  // the height it will be). The list is kept hidden meanwhile, so it does not flash the top.
  const restoreTo = useRef<number | null>(fileScroll.recall(memoryId));
  const [waiting, setWaiting] = useState(restoreTo.current !== null);
  const sized = useRef(new Set<number>());
  const pageCount = useRef(0);
  const [allSized, setAllSized] = useState(false);

  const putBack = useCallback(() => {
    const el = stage.current;
    const share = restoreTo.current;
    restoreTo.current = null;
    if (el && share !== null) el.scrollTop = share * el.scrollHeight;
    setWaiting(false);
  }, []);

  // A page has its real size (at the width of the window).
  const onSized = useCallback((number: number) => {
    sized.current.add(number);
    if (pageCount.current > 0 && sized.current.size >= pageCount.current) {
      setAllSized(true);
    }
  }, []);

  useLayoutEffect(() => {
    if (allSized && restoreTo.current !== null) putBack();
  }, [allSized, putBack]);

  // If the pages never all report (a very long PDF, a window with no room), show it anyway.
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(putBack, 3000);
    return () => clearTimeout(timer);
  }, [waiting, putBack]);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    setDoc(null);
    sized.current.clear();
    pageCount.current = 0;
    setAllSized(false);
    void (async () => {
      try {
        const pdfjs = await loadPdfjs();
        // PDF.js takes over (and empties) the bytes it is given, so give it a copy.
        const loading = pdfjs.getDocument({ data: data.slice() });
        task = loading;
        const opened = await loading.promise;
        if (cancelled) return;
        onPages(opened.numPages);
        pageCount.current = opened.numPages;
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
    <div
      className="file-stage"
      ref={stage}
      style={waiting ? { visibility: 'hidden' } : undefined}
      onScroll={(e) => {
        // While the old place is being put back, the document is not its final height yet.
        if (restoreTo.current !== null) return;
        const el = e.currentTarget;
        fileScroll.remember(memoryId, el.scrollTop / el.scrollHeight);
      }}
    >
      <div className="pdf-pages">
        {Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage
            key={i}
            doc={doc}
            number={i + 1}
            zoom={zoom}
            room={room}
            onSized={onSized}
          />
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
  onSized,
}: {
  doc: PDFDocumentProxy;
  number: number;
  zoom: number;
  room: number;
  // This page now has its real size (told once the window's width is known).
  onSized: (number: number) => void;
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
      if (room > 0) onSized(number);
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
