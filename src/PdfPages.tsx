import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Select } from './ui/controls';

// An uploaded PDF drawn page by page, one under the other, with a zoom control. The
// PDF library (PDF.js) is only loaded when a PDF is opened. The file is read as plain
// pictures of its pages: PDF scripts and forms never run (PDF.js has them off here).
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PdfPages({ data }: { data: Uint8Array }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | 'broken' | null>(null);
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    setDoc(null);
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
          .default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        // PDF.js takes over (and empties) the bytes it is given, so give it a copy.
        const loading = pdfjs.getDocument({ data: data.slice() });
        task = loading;
        const opened = await loading.promise;
        if (!cancelled) setDoc(opened);
      } catch {
        if (!cancelled) setDoc('broken');
      }
    })();
    return () => {
      cancelled = true;
      if (task) void task.destroy();
    };
  }, [data]);

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
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="row-flex"
        style={{
          gap: 'var(--s-2)',
          padding: 'var(--s-2) var(--s-5)',
          borderTop: '1px solid var(--c-border)',
          alignItems: 'center',
        }}
      >
        <span className="muted">
          {doc.numPages} {doc.numPages === 1 ? 'page' : 'pages'}
        </span>
        <span style={{ flex: 1 }} />
        <label className="muted" style={{ display: 'flex', gap: 'var(--s-2)' }}>
          Zoom
          <Select
            small
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div
        ref={box}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          background: 'var(--c-surface-2)',
          padding: 'var(--s-5)',
        }}
      >
        <div
          style={{ display: 'grid', gap: 'var(--s-4)', justifyItems: 'center' }}
        >
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} number={i + 1} zoom={zoom} />
          ))}
        </div>
      </div>
    </div>
  );
}

// One page, drawn only once it scrolls near the screen.
function PdfPage({
  doc,
  number,
  zoom,
}: {
  doc: PDFDocumentProxy;
  number: number;
  zoom: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

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
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void doc.getPage(number).then((page) => {
      if (cancelled) return;
      const view = page.getViewport({ scale: zoom * 1.25 });
      setSize({ w: view.width / 1.25, h: view.height / 1.25 });
      if (!near || !canvas.current) return;
      const sharp = window.devicePixelRatio || 1;
      const scaled = page.getViewport({ scale: zoom * 1.25 * sharp });
      const el = canvas.current;
      el.width = Math.floor(scaled.width);
      el.height = Math.floor(scaled.height);
      task = page.render({ canvas: el, viewport: scaled });
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, zoom, near]);

  return (
    <div
      ref={holder}
      style={{
        width: size?.w ?? 600 * zoom,
        height: size?.h ?? 800 * zoom,
        background: 'white',
        boxShadow: '0 1px 6px rgba(0,0,0,0.35)',
      }}
    >
      <canvas
        ref={canvas}
        aria-label={`Page ${number}`}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
