import { useEffect, useRef, useState } from 'react';
import { MAX_ARTIFACT_CHARS } from './artifacts';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import type { ArtifactDocument, ArtifactTabInfo } from './types';

const KIND_WORDS: Record<ArtifactTabInfo['kind'], string> = {
  markdown: 'Markdown',
  text: 'Plain text',
  html: 'HTML',
  code: 'Code',
};

const SAVE_DELAY_MS = 500;

// An open artifact: a plain text editor in the area where a web page would be.
// It loads the text once, then saves a moment after you stop typing (and when
// you leave).
export function ArtifactView({ tab }: { tab: ArtifactTabInfo }) {
  const [doc, setDoc] = useState<ArtifactDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
  // The text not yet sent to the app (null when everything is saved).
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const content = pending.current;
    if (content === null) return;
    pending.current = null;
    const ok = await window.browserApi.artifactWrite(tab.id, content);
    // Something newer may have been typed while this was saving.
    if (pending.current === null) setStatus(ok ? 'saved' : 'failed');
  };

  useEffect(() => {
    let cancelled = false;
    void window.browserApi.artifactRead(tab.id).then((loaded) => {
      if (cancelled) return;
      if (loaded === null) setMissing(true);
      else {
        setDoc(loaded);
        setText(loaded.content);
      }
    });
    return () => {
      cancelled = true;
      // Leaving: send anything not saved yet.
      const content = pending.current;
      if (content !== null) {
        pending.current = null;
        void window.browserApi.artifactWrite(tab.id, content);
      }
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [tab.id]);

  const change = (value: string) => {
    setText(value);
    setStatus('saving');
    pending.current = value;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  const mono = tab.kind === 'html' || tab.kind === 'code';

  return (
    <main
      style={{
        // The same rounded card where a web page would be.
        position: 'fixed',
        top: TOOLBAR_HEIGHT,
        left: `calc(var(--left) + ${PAGE_INSET}px)`,
        right: `calc(var(--rail) + var(--panel) + ${PAGE_INSET}px)`,
        bottom: `calc(var(--chat) + ${PAGE_INSET}px)`,
        background: '#ffffff',
        borderRadius: PAGE_RADIUS,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '14px 20px 8px',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {tab.title}
        </h1>
        <span style={{ fontSize: 12, color: '#5f6368' }}>
          {KIND_WORDS[tab.kind]}
        </span>
        <span
          role="status"
          style={{
            fontSize: 12,
            color: status === 'failed' ? '#b3261e' : '#5f6368',
          }}
        >
          {status === 'saved'
            ? 'Saved'
            : status === 'saving'
              ? 'Saving…'
              : 'Could not save'}
        </span>
      </header>
      {missing ? (
        <p style={{ padding: '0 20px', color: '#5f6368' }}>
          This artifact no longer exists.
        </p>
      ) : doc === null ? (
        <p style={{ padding: '0 20px', color: '#5f6368' }}>Loading…</p>
      ) : (
        <textarea
          aria-label={`Edit ${tab.title}`}
          value={text}
          maxLength={MAX_ARTIFACT_CHARS}
          spellCheck={!mono}
          onChange={(e) => change(e.target.value)}
          onBlur={() => void save()}
          style={{
            flex: 1,
            minHeight: 0,
            border: 'none',
            borderTop: '1px solid #eeeeee',
            outline: 'none',
            resize: 'none',
            padding: '14px 20px',
            fontSize: 14,
            lineHeight: 1.55,
            fontFamily: mono
              ? 'ui-monospace, Consolas, "Courier New", monospace'
              : 'inherit',
            tabSize: 2,
          }}
        />
      )}
    </main>
  );
}
