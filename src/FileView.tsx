import { useEffect, useRef, useState } from 'react';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import { ArtifactTitle } from './ArtifactTitle';
import { byteWords } from './artifacts';
import { PdfPages } from './PdfPages';
import type { ArtifactTabInfo } from './types';
import { Button, IconButton, ItemEmoji } from './ui/controls';

// An uploaded image or PDF, open in the area where a web page would be. Its bytes are
// fetched from the app and shown from a short-lived local address. The page has no
// scripts of its own: an image is drawn as a picture, and a PDF page by page (PdfPages).
export function FileArtifactView({
  tab,
  zoom,
}: {
  tab: ArtifactTabInfo;
  // The zoom shared with web pages (1 = 100%).
  zoom: number;
}) {
  const [shown, setShown] = useState<
    { url: string; mime: string; data: Uint8Array } | 'missing' | null
  >(null);

  const [pages, setPages] = useState<number | null>(null);
  const [pixels, setPixels] = useState<{ w: number; h: number } | null>(null);
  const card = useRef<HTMLElement>(null);

  // Ctrl + scroll zooms in steps, like on a web page.
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      window.browserApi.changeZoom(event.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setShown(null);
    setPages(null);
    setPixels(null);
    void window.browserApi.artifactFile(tab.id).then((file) => {
      if (cancelled) return;
      if (!file) {
        setShown('missing');
        return;
      }
      url = URL.createObjectURL(
        new Blob([file.data as Uint8Array<ArrayBuffer>], { type: file.mime }),
      );
      setShown({ url, mime: file.mime, data: file.data });
    });
    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [tab.id]);

  const isPdf =
    shown !== null && shown !== 'missing' && shown.mime === 'application/pdf';

  // The line under the title: kind, what is in it, and its size.
  const meta =
    shown === null || shown === 'missing'
      ? isPdfName(tab.title)
        ? 'PDF'
        : 'Image'
      : isPdf
        ? [
            'PDF',
            pages === null
              ? null
              : `${pages} ${pages === 1 ? 'page' : 'pages'}`,
            byteWords(shown.data.length),
          ]
            .filter(Boolean)
            .join(' · ')
        : [
            'Image',
            pixels === null ? null : `${pixels.w} × ${pixels.h}`,
            byteWords(shown.data.length),
          ]
            .filter(Boolean)
            .join(' · ');

  return (
    <main
      ref={card}
      style={{
        position: 'fixed',
        top: TOOLBAR_HEIGHT,
        left: `calc(var(--left) + ${PAGE_INSET}px)`,
        right: `calc(var(--rail) + var(--panel) + ${PAGE_INSET}px)`,
        bottom: `calc(var(--chat) + ${PAGE_INSET}px)`,
        background: 'var(--c-surface)',
        color: 'var(--c-text)',
        borderRadius: PAGE_RADIUS,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        className="reveal-host art-head"
        onContextMenu={(event) => {
          event.preventDefault();
          window.browserApi.showArtifactMenu(
            tab.id,
            event.clientX,
            event.clientY,
          );
        }}
      >
        <ItemEmoji emoji={tab.emoji} />
        <div className="art-title">
          <ArtifactTitle id={tab.id} title={tab.title} />
          <div className="art-meta">
            <span>{meta}</span>
          </div>
        </div>
        <div className="art-actions">
          {isPdf ? (
            <>
              <Button
                className="reveal"
                onClick={() =>
                  void window.browserApi.artifactOpenFile(tab.id, 'open')
                }
              >
                Open with PDF app
              </Button>
              <Button
                className="reveal"
                onClick={() =>
                  void window.browserApi.artifactOpenFile(tab.id, 'folder')
                }
              >
                Show in folder
              </Button>
            </>
          ) : null}
          <IconButton
            icon="more"
            label="More: rename, move, add to chat and more"
            aria-haspopup="menu"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              window.browserApi.showArtifactMenu(
                tab.id,
                box.right - 200,
                box.bottom + 4,
              );
            }}
          />
        </div>
      </header>
      {shown === null ? (
        <p className="muted" style={{ padding: '0 var(--s-5)' }}>
          Loading…
        </p>
      ) : shown === 'missing' ? (
        <p className="muted" style={{ padding: '0 var(--s-5)' }}>
          This file is no longer there.
        </p>
      ) : isPdf ? (
        <PdfPages data={shown.data} zoom={zoom} onPages={setPages} />
      ) : (
        <div className="file-stage image-stage">
          <img
            src={shown.url}
            alt={tab.title}
            onLoad={(event) =>
              setPixels({
                w: event.currentTarget.naturalWidth,
                h: event.currentTarget.naturalHeight,
              })
            }
            // At 100% a big picture is shrunk to fit; any other zoom is that share of
            // its real size.
            style={
              zoom === 1 || pixels === null
                ? { maxWidth: '100%', maxHeight: '100%' }
                : { width: pixels.w * zoom, height: pixels.h * zoom }
            }
          />
        </div>
      )}
    </main>
  );
}

const isPdfName = (title: string) => /.pdf$/i.test(title);
