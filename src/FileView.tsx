import { useEffect, useState } from 'react';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import { NameButton } from './NameButton';
import type { ArtifactTabInfo } from './types';
import { Button, IconButton, ItemEmoji } from './ui/controls';

// An uploaded image or PDF, open in the area where a web page would be. Its bytes are
// fetched from the app and shown from a short-lived local address. The page has no
// scripts of its own: an image is drawn as a picture, and a PDF by the built-in PDF
// viewer.
export function FileArtifactView({ tab }: { tab: ArtifactTabInfo }) {
  const [shown, setShown] = useState<
    { url: string; mime: string } | 'missing' | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setShown(null);
    void window.browserApi.artifactFile(tab.id).then((file) => {
      if (cancelled) return;
      if (!file) {
        setShown('missing');
        return;
      }
      url = URL.createObjectURL(
        new Blob([file.data as Uint8Array<ArrayBuffer>], { type: file.mime }),
      );
      setShown({ url, mime: file.mime });
    });
    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [tab.id]);

  const isPdf =
    shown !== null && shown !== 'missing' && shown.mime === 'application/pdf';

  return (
    <main
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
          <div className="art-title-row">
            <h1
              className="truncate"
              style={{ margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 600 }}
            >
              {tab.title}
            </h1>
            <NameButton kind="artifact" id={tab.id} />
          </div>
          <div className="art-meta">
            <span>{shown !== null && isPdf ? 'PDF' : 'Image'}</span>
          </div>
        </div>
        <div className="art-actions">
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
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            placeItems: 'center',
            borderTop: '1px solid var(--c-border)',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 380 }}>
            <p style={{ margin: '0 0 var(--s-2)', fontWeight: 600 }}>
              PDFs cannot be shown inside the browser yet.
            </p>
            <p className="muted" style={{ margin: '0 0 var(--s-4)' }}>
              It is saved here with the Space. Open it with the PDF app on your
              computer.
            </p>
            <div
              className="row-flex"
              style={{ justifyContent: 'center', gap: 'var(--s-2)' }}
            >
              <Button
                variant="primary"
                onClick={() =>
                  void window.browserApi.artifactOpenFile(tab.id, 'open')
                }
              >
                Open with your PDF app
              </Button>
              <Button
                onClick={() =>
                  void window.browserApi.artifactOpenFile(tab.id, 'folder')
                }
              >
                Show in folder
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'grid',
            placeItems: 'center',
            padding: 'var(--s-5)',
            borderTop: '1px solid var(--c-border)',
            background: 'var(--c-surface-2)',
          }}
        >
          <img
            src={shown.url}
            alt={tab.title}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
    </main>
  );
}
