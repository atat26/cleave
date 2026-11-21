import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_ARTIFACT_CHARS } from './artifacts';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import type { ArtifactDocument, ArtifactTabInfo } from './types';
import {
  HTML_SANDBOX,
  htmlDocument,
  parsePreviewMessage,
  previewNote,
} from './artifactRender';
import type { PreviewMessage } from './artifactRender';
import { detectLanguage, languageName } from './highlight';
import { FileArtifactView } from './FileView';
import { HighlightedEditor } from './HighlightedEditor';
import { ArtifactTitle } from './ArtifactTitle';
import { Markdown } from './MarkdownView';
import {
  Banner,
  Button,
  IconButton,
  ItemEmoji,
  Segmented,
} from './ui/controls';
import { Icon } from './ui/Icon';

const KIND_WORDS: Record<ArtifactTabInfo['kind'], string> = {
  markdown: 'Markdown',
  text: 'Plain text',
  html: 'HTML',
  code: 'Code',
  file: 'File',
};

const SAVE_DELAY_MS = 500;

const sizeWords = (chars: number) =>
  chars < 1000 ? `${chars} chars` : `${(chars / 1000).toFixed(1)}k chars`;

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
// An open artifact: an uploaded image or PDF is viewed, anything else is a text
// artifact with an editor.
export function ArtifactView({
  tab,
  zoom,
}: {
  tab: ArtifactTabInfo;
  zoom: number;
}) {
  return tab.kind === 'file' ? (
    <FileArtifactView tab={tab} zoom={zoom} />
  ) : (
    <TextArtifactView tab={tab} />
  );
}

function TextArtifactView({ tab }: { tab: ArtifactTabInfo }) {
  const [doc, setDoc] = useState<ArtifactDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
  // "Saved" shows for a moment after a save, then goes quiet (it is back whenever
  // the pointer is on the header). Saving and failures always show.
  const [savedFlash, setSavedFlash] = useState(false);
  const wasSaving = useRef(false);
  useEffect(() => {
    if (status === 'saving') {
      wasSaving.current = true;
      setSavedFlash(false);
      return;
    }
    if (status === 'saved' && wasSaving.current) {
      wasSaving.current = false;
      setSavedFlash(true);
      const timer = setTimeout(() => setSavedFlash(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [status]);
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
  // An HTML page you allowed to use the internet in its preview.
  const [internet, setInternet] = useState(false);
  const refreshInternet = () =>
    void window.browserApi.artifactRead(tab.id).then((loaded) => {
      if (loaded) setInternet(loaded.internet);
    });
  // Allowing asks first, in a native window.
  const chooseInternet = (on: boolean) =>
    void window.browserApi.artifactSetInternet(tab.id, on).then(setInternet);

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
          setInternet(loaded.internet);
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
      // An edit by the assistant ends a permission you gave: look again.
      refreshInternet();
    });
    // The setting was changed from the menu.
    const stopInternet = window.browserApi.onArtifactInternet((id) => {
      if (id === tab.id) refreshInternet();
    });
    return () => {
      cancelled = true;
      stopListening();
      stopInternet();
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

  // The window is closing: send what was typed in the last moment, and wait for it to be stored.
  useEffect(
    () =>
      window.browserApi.onBeforeClose(async () => {
        // A save already on its way finishes first, then the rest goes.
        for (let i = 0; i < 20 && inFlight.current; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await save();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.id],
  );

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
  // What the text is written in, for its colours: from the kind, the ending of its
  // name ("calc.py"), or what it looks like. (Looked up again only when the name or
  // the start of the text changes.)
  const head = text.slice(0, 2000);
  const language = useMemo(
    () =>
      detectLanguage(tab.kind === 'file' ? 'text' : tab.kind, tab.title, text),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.kind, tab.title, head],
  );

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

  // What the page in the preview says went wrong (a refused load, an error). Only
  // messages that come from that frame, in our own shape, are taken.
  const frame = useRef<HTMLIFrameElement>(null);
  const [heard, setHeard] = useState<PreviewMessage[]>([]);
  // The assistant's check_artifact tool asks for the page to run again and report: the
  // frame is made again (a new run), and once it has loaded, what it said goes to the app.
  const [run, setRun] = useState(0);
  const [loaded, setLoaded] = useState(0);
  useEffect(
    () =>
      window.browserApi.onPreviewCheck((id) => {
        if (id === tab.id) {
          setLoaded(0);
          setRun((n) => n + 1);
        }
      }),
    [tab.id],
  );
  useEffect(() => {
    setHeard([]);
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === null ||
        event.source !== frame.current?.contentWindow
      ) {
        return;
      }
      const message = parsePreviewMessage(event.data);
      if (message) setHeard((now) => [...now, message].slice(-20));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [text, showPreview, tab.id, internet, run]);
  const isHtml = tab.kind === 'html';
  // A moment after the page has loaded (and again if it says more), tell the app what it
  // reported, so it can be checked.
  useEffect(() => {
    if (!showPreview || !isHtml || loaded === 0) return;
    const timer = setTimeout(
      () => window.browserApi.reportPreview(tab.id, heard),
      1200,
    );
    return () => clearTimeout(timer);
  }, [heard, loaded, showPreview, isHtml, tab.id]);
  const note = showPreview && isHtml ? previewNote(heard) : null;
  // Something was refused for lack of the internet (not just an error in the page).
  const refused = heard.some(
    (m) => m.kind === 'blocked' && /^(https?|wss?):/i.test(m.text),
  );

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
        containerType: 'inline-size',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        className="reveal-host art-head"
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
      >
        <ItemEmoji emoji={tab.emoji} />
        <div className="art-title">
          <ArtifactTitle id={tab.id} title={tab.title} />
          <div className="art-meta">
            <span>
              {tab.kind === 'code'
                ? languageName(language)
                : KIND_WORDS[tab.kind]}
              {' · '}
              {sizeWords(text.length)}
            </span>
            <span
              role="status"
              className={
                status !== 'saved' || savedFlash
                  ? 'row-flex reveal is-on'
                  : 'row-flex reveal'
              }
              style={{
                gap: 'var(--s-1)',
                color: status === 'failed' ? 'var(--c-danger)' : undefined,
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
          </div>
        </div>
        <div className="art-actions">
          {showPreview && isHtml && internet && (
            // Always visible while it is on: this page can reach the internet.
            <Button
              icon="globe"
              title="This page can use the internet. Click to turn it off."
              onClick={() => chooseInternet(false)}
            >
              Internet on
            </Button>
          )}
          {showPreview && isHtml && !internet && (
            // Quiet until the pointer or keyboard is on the header.
            <Button
              icon="globe"
              className="reveal"
              title="Let this page load fonts and libraries from the internet"
              onClick={() => chooseInternet(true)}
            >
              Allow internet
            </Button>
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
        // The assistant may have written this after reading a web page, so its
        // scripts run sealed in: no reach into the app, no internet, no windows.
        <>
          {note !== null && (
            <div
              role="status"
              className="muted row-flex"
              style={{
                gap: 'var(--s-3)',
                padding: 'var(--s-2) var(--s-5)',
                fontSize: 'var(--fs-sm)',
                borderTop: '1px solid var(--c-border)',
              }}
            >
              <span className="grow">{note}</span>
              {refused && !internet && (
                <Button size="sm" onClick={() => chooseInternet(true)}>
                  Allow internet…
                </Button>
              )}
            </div>
          )}
          <iframe
            key={run}
            ref={frame}
            onLoad={() => setLoaded((n) => n + 1)}
            title={`${tab.title} (preview)`}
            sandbox={HTML_SANDBOX}
            srcDoc={htmlDocument(text, internet)}
            style={{
              flex: 1,
              minHeight: 0,
              border: 'none',
              borderTop: '1px solid var(--c-border)',
              background: '#ffffff', // pages assume a white sheet, even in dark mode
            }}
          />
        </>
      ) : tab.kind === 'text' ? (
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
      ) : (
        <HighlightedEditor
          label={`Edit ${tab.title}`}
          value={text}
          language={language}
          mono={mono}
          maxLength={MAX_ARTIFACT_CHARS}
          onChange={change}
          onBlur={() => void save()}
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
        />
      )}
    </main>
  );
}
