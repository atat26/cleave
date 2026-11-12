import { useEffect, useRef, useState } from 'react';
import { MAX_ARTIFACT_CHARS } from './artifacts';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import type { ArtifactDocument, ArtifactTabInfo } from './types';
import { HTML_SANDBOX, htmlDocument } from './artifactRender';
import { Markdown } from './MarkdownView';
import { Badge, Banner, Button, ItemEmoji, Segmented } from './ui/controls';
import { Icon } from './ui/Icon';

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
//
// Nothing here may overwrite what you typed, or the assistant's edit:
//   - every save says which version of the text it was based on, and the app
//     refuses it if the assistant changed the text since (a "conflict");
//   - a conflict, or an assistant edit that arrives while you have unsaved or
//     fresh typing, shows a banner and pauses saving until you choose;
//   - a reload that would land on top of something you typed while it was on its
//     way is treated as a conflict too.
export function ArtifactView({ tab }: { tab: ArtifactTabInfo }) {
  const [doc, setDoc] = useState<ArtifactDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
  // The text not yet sent to the app (null when everything is saved).
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which version of the text the editor's text is based on.
  const base = useRef(0);
  // Counts your changes, to notice typing that happened while something loaded.
  const version = useRef(0);
  // A save is on its way (only one at a time, so each is based on the last).
  const inFlight = useRef(false);
  // The text was changed by the assistant: nothing is saved until you choose
  // which version to keep.
  const [conflict, setConflict] = useState(false);
  const held = useRef(false);

  const hold = () => {
    held.current = true;
    setConflict(true);
  };

  const save = async () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current || held.current) return;
    const content = pending.current;
    if (content === null) return;
    pending.current = null;
    inFlight.current = true;
    const result = await window.browserApi.artifactWrite(
      tab.id,
      content,
      base.current,
    );
    inFlight.current = false;
    if (result.ok) {
      base.current = result.revision;
    } else if (result.reason === 'conflict') {
      // Keep what you typed, and ask which version to keep.
      if (pending.current === null) pending.current = content;
      hold();
      return;
    }
    if (pending.current === null) {
      setStatus(result.ok ? 'saved' : 'failed');
    } else if (timer.current === null && !held.current) {
      // More was typed while this was saving.
      timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const typedBefore = version.current;
      return window.browserApi.artifactRead(tab.id).then((loaded) => {
        if (cancelled) return;
        if (loaded === null) {
          setMissing(true);
        } else if (version.current !== typedBefore) {
          // You typed while this was on its way: do not replace it.
          hold();
        } else {
          base.current = loaded.revision;
          setDoc(loaded);
          setText(loaded.content);
        }
      });
    };
    void load();
    // The assistant changed this artifact: show its version, unless you are in
    // the middle of typing or saving (then you choose).
    const stopListening = window.browserApi.onArtifactChanged((id) => {
      if (id !== tab.id) return;
      if (pending.current === null && !inFlight.current) void load();
      else hold();
    });
    return () => {
      cancelled = true;
      stopListening();
      if (timer.current !== null) clearTimeout(timer.current);
      // Leaving: send anything not saved yet (unless you have not chosen between
      // your text and the assistant's; a refused save is simply dropped, so the
      // newer text stays).
      const content = pending.current;
      if (content !== null && !held.current && !inFlight.current) {
        pending.current = null;
        void window.browserApi.artifactWrite(tab.id, content, base.current);
      }
    };
  }, [tab.id]);

  const change = (value: string) => {
    version.current++;
    setText(value);
    setStatus('saving');
    pending.current = value;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  const useTheirs = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    void window.browserApi.artifactRead(tab.id).then((loaded) => {
      if (!loaded) return;
      base.current = loaded.revision;
      version.current++;
      held.current = false;
      setConflict(false);
      setStatus('saved');
      setText(loaded.content);
    });
  };
  const keepMine = () => {
    void window.browserApi.artifactRead(tab.id).then((loaded) => {
      if (!loaded) return;
      // Base the save on the assistant's version, so yours replaces it.
      base.current = loaded.revision;
      held.current = false;
      setConflict(false);
      void save();
    });
  };

  const mono = tab.kind === 'html' || tab.kind === 'code';

  const [renaming, setRenaming] = useState(false);
  const finishRename = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (name && name !== tab.title)
      window.browserApi.artifactRename(tab.id, name);
  };

  // Markdown and HTML can be shown as a finished page (the default) or edited.
  const canRender = tab.kind === 'markdown' || tab.kind === 'html';
  const [view, setView] = useState<'preview' | 'edit'>(() => {
    try {
      return localStorage.getItem('artifactView') === 'edit'
        ? 'edit'
        : 'preview';
    } catch {
      return 'preview';
    }
  });
  const chooseView = (next: 'preview' | 'edit') => {
    setView(next);
    try {
      localStorage.setItem('artifactView', next);
    } catch {
      // Not remembered; fine.
    }
  };
  const showPreview = canRender && view === 'preview';

  return (
    <main
      style={{
        // The same rounded card where a web page would be.
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
        // Right-click the header for the same menu as the artifact's sidebar row.
        onContextMenu={(event) => {
          if (event.target instanceof HTMLInputElement) return;
          event.preventDefault();
          window.browserApi.showArtifactMenu(
            tab.id,
            event.clientX,
            event.clientY,
          );
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)',
          padding: 'var(--s-4) var(--s-5) var(--s-3)',
        }}
      >
        <ItemEmoji emoji={tab.emoji} />
        {renaming ? (
          <input
            className="input"
            autoFocus
            defaultValue={tab.title}
            maxLength={80}
            aria-label="Artifact name"
            onFocus={(e) => e.target.select()}
            onBlur={(e) => finishRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename(e.currentTarget.value);
              if (e.key === 'Escape') setRenaming(false);
            }}
            style={{
              fontSize: 'var(--fs-xl)',
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
              height: 36,
            }}
          />
        ) : (
          <h1
            className="truncate"
            onClick={() => setRenaming(true)}
            title="Click to rename"
            style={{
              margin: 0,
              fontSize: 'var(--fs-xl)',
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
              cursor: 'text',
            }}
          >
            {tab.title}
          </h1>
        )}
        {canRender && (
          <Segmented
            label="View"
            value={view}
            onChange={chooseView}
            options={[
              { value: 'preview', label: 'Preview' },
              { value: 'edit', label: 'Edit' },
            ]}
          />
        )}
        <Badge>{KIND_WORDS[tab.kind]}</Badge>
        <span
          role="status"
          className="row-flex"
          style={{
            gap: 'var(--s-1)',
            fontSize: 'var(--fs-xs)',
            color: status === 'failed' ? 'var(--c-danger)' : 'var(--c-text-2)',
          }}
        >
          {status === 'saved' && <Icon name="check" />}
          {status === 'saving' && <Icon name="spinner" className="spin" />}
          {status === 'failed' && <Icon name="warn" />}
          {status === 'saved'
            ? 'Saved'
            : status === 'saving'
              ? 'Saving…'
              : 'Could not save'}
        </span>
      </header>
      {conflict && (
        <div style={{ margin: '0 var(--s-5) var(--s-3)' }}>
          <Banner
            tone="warn"
            actions={
              <>
                <Button size="sm" onClick={useTheirs}>
                  Use the assistant's version
                </Button>
                <Button size="sm" onClick={keepMine}>
                  Keep mine
                </Button>
              </>
            }
          >
            The assistant changed this artifact while you were typing. Nothing
            is saved until you choose.
          </Banner>
        </div>
      )}
      {missing ? (
        <p className="muted" style={{ padding: '0 var(--s-5)' }}>
          This artifact no longer exists.
        </p>
      ) : doc === null ? (
        <p className="muted" style={{ padding: '0 var(--s-5)' }}>
          Loading…
        </p>
      ) : showPreview && tab.kind === 'markdown' ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            borderTop: '1px solid var(--c-border)',
            padding: 'var(--s-4) var(--s-5)',
          }}
        >
          <Markdown text={text} />
        </div>
      ) : showPreview ? (
        // The assistant may have written this after reading a web page, so it is
        // shown with no permissions and no way to reach the internet.
        <iframe
          title={`${tab.title} (preview)`}
          sandbox={HTML_SANDBOX}
          srcDoc={htmlDocument(text)}
          style={{
            flex: 1,
            minHeight: 0,
            border: 'none',
            borderTop: '1px solid var(--c-border)',
            background: '#ffffff', // pages assume a white sheet, even in dark mode
          }}
        />
      ) : (
        <textarea
          aria-label={`Edit ${tab.title}`}
          value={text}
          maxLength={MAX_ARTIFACT_CHARS}
          spellCheck={!mono}
          onChange={(e) => change(e.target.value)}
          onContextMenu={(event) => {
            event.preventDefault();
            const box = event.currentTarget;
            window.browserApi.showEditMenu(
              'editor',
              event.clientX,
              event.clientY,
              box.selectionStart !== box.selectionEnd,
              box.value.slice(box.selectionStart, box.selectionEnd),
            );
          }}
          onBlur={() => void save()}
          style={{
            flex: 1,
            minHeight: 0,
            border: 'none',
            borderTop: '1px solid var(--c-border)',
            outline: 'none',
            resize: 'none',
            padding: 'var(--s-4) var(--s-5)',
            background: 'var(--c-surface)',
            color: 'var(--c-text)',
            fontSize: 'var(--fs-md)',
            lineHeight: 1.55,
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font)',
            tabSize: 2,
          }}
        />
      )}
    </main>
  );
}
