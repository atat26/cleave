// The overlay on the page: a glow round the page while the assistant works in it, and a
// small pill hanging from the top with its state, what it is doing, and Stop. This is a
// page of our own in a view above the web page (see tabs.ts), so the web page cannot see,
// move or draw over it. What it shows comes from the app (agentVisuals.ts), never from
// the web page. The look is in components.css (.ao).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cardSide } from './agentVisuals';
import type { OverlayState } from './agentVisuals';
import type { CursorView } from './cursor';
import type { MarkerView } from './marker';
import { MADE_WORDS, RUN_WORDS } from './runModel';
import type { StepState } from './runModel';
import { ApprovalCardView, StatusIcon } from './StepList';
import { Button, IconButton } from './ui/controls';

const TONE_ICON: Record<OverlayState['tone'], StepState> = {
  working: 'running',
  waiting: 'waiting',
  stuck: 'failed',
  finished: 'done',
  stopped: 'stopped',
};

// The ring on the element the assistant is acting on, with a short label.
function Marker({ marker }: { marker: MarkerView }) {
  const { rect } = marker;
  return (
    <div
      className={`ao-marker ao-marker-${marker.tone}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
      aria-hidden="true"
    >
      <span className={`ao-marker-label is-${marker.placement}`}>
        {marker.label}
      </span>
    </div>
  );
}

// Where the cursor was last drawn, and when: the next one glides from there if it comes
// soon after (a new step right after the last), instead of appearing out of nowhere.
let lastCursor: { x: number; y: number; at: number } | null = null;
const GLIDE_WITHIN_MS = 2000;

// The assistant's cursor: an arrow (or a text cursor while typing) with a short tag, gliding
// to where it acts. It is only a picture: it takes no mouse and moves nothing.
function CursorMark({
  cursor,
  tagged,
}: {
  cursor: CursorView;
  // Draw the tag (not when the ring's own label already says the same).
  tagged: boolean;
}) {
  const [at, setAt] = useState(() =>
    lastCursor !== null && Date.now() - lastCursor.at < GLIDE_WITHIN_MS
      ? { x: lastCursor.x, y: lastCursor.y }
      : { x: cursor.x, y: cursor.y },
  );
  useEffect(() => {
    lastCursor = { x: cursor.x, y: cursor.y, at: Date.now() };
    // One frame at the old place first, so the move is seen.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAt({ x: cursor.x, y: cursor.y }));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [cursor.x, cursor.y]);
  return (
    <div
      className={`ao-cursor ao-cursor-${cursor.tone}`}
      style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
      aria-hidden="true"
    >
      {cursor.burst && <span className="ao-cursor-burst" />}
      {cursor.kind === 'beam' ? (
        <svg
          className="ao-cursor-shape"
          width="14"
          height="22"
          viewBox="0 0 14 22"
          style={{ left: -7, top: -11 }}
        >
          <path d="M3 1.5h8M3 20.5h8M7 1.5v19" />
        </svg>
      ) : (
        <svg
          className="ao-cursor-shape"
          width="22"
          height="26"
          viewBox="0 0 22 26"
          style={{ left: -1, top: -1 }}
        >
          <path d="M1.5 1.5v19.5l5-4.7 3.4 8 3.6-1.5-3.3-7.8h7z" />
        </svg>
      )}
      {tagged && <span className="ao-cursor-tag">{cursor.tag}</span>}
    </div>
  );
}

// The approval card popped out over the page: at the bottom, or at the top when the element
// it asks about is down there, so it never covers what it asks about. Wheel turns over it
// stay with it (they scroll its own text), not the page.
function PoppedOutCard({ state }: { state: OverlayState }) {
  const card = state.card;
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);
  if (!card) return null;
  const side = cardSide(
    state.marker?.rect ?? null,
    { height: window.innerHeight },
    height,
  );
  return (
    <div
      ref={ref}
      className={`ao-card is-${side}`}
      onWheel={(event) => event.stopPropagation()}
    >
      <ApprovalCardView
        view={{
          toolName: card.toolName,
          ask: card.ask,
          risky: card.risky,
          card: card.card,
          site: card.site,
        }}
        onDecide={(decision) => window.browserApi.overlayDecide(decision)}
        // Stop is on the pill; the card has its own only when the pill is not shown.
        onStop={state.pill ? undefined : () => window.browserApi.overlayStop()}
        onMinimize={() => window.browserApi.overlayMinimize(true)}
        onGoToTab={
          state.goToTab ? () => window.browserApi.overlayGoToTab() : undefined
        }
        takeKeyboard
      />
    </div>
  );
}

// The last few steps, under the pill while it is hovered or focused.
function PeekList({ steps }: { steps: OverlayState['recent'] }) {
  return (
    <ul className="ao-peek" aria-label="The last steps">
      {steps.map((step) => (
        <li key={step.partId} className="ao-peek-row">
          <StatusIcon state={step.state} />
          <span className="ao-peek-text truncate">
            {step.verb}
            {step.target !== null && (
              <>
                : <strong>{step.target}</strong>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// How long after the pointer leaves the pill (or its list) the list stays: long enough to
// cross the small gap between them.
const PEEK_CLOSE_MS = 220;

export function OverlayApp() {
  const [state, setState] = useState<OverlayState | null>(null);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openPeek = () => {
    if (peekTimer.current !== null) clearTimeout(peekTimer.current);
    peekTimer.current = null;
    setPeek(true);
  };
  const closePeek = () => {
    if (peekTimer.current !== null) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), PEEK_CLOSE_MS);
  };
  // The list is only open while there is something to list; the app grows the strip for it.
  const peeking = peek && state !== null && state.recent.length > 0;
  useEffect(() => {
    window.browserApi.overlayPeek(peeking);
  }, [peeking]);
  // Nothing showing any more: the pointer cannot still be on the pill.
  useEffect(() => {
    if (state === null) setPeek(false);
  }, [state]);

  useEffect(() => {
    // This page must show nothing but the glow and the pill.
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const stop = window.browserApi.onOverlayState(setState);
    window.browserApi.overlayReady();
    return stop;
  }, []);

  if (!state) return null;
  const framed = state.mode === 'frame';
  return (
    <div
      className={`ao ao-${state.tone}${state.soft ? ' is-soft' : ''}${framed ? ' is-framed' : ''}`}
      // The overlay covers the page, so the mouse wheel is passed on to it: the page can
      // still be scrolled. (Zooming with Ctrl is left alone.)
      onWheel={
        framed
          ? (event) => {
              if (event.ctrlKey) return;
              window.browserApi.overlayWheel(
                event.clientX,
                event.clientY,
                event.deltaX,
                event.deltaY,
              );
            }
          : undefined
      }
    >
      {state.glow && <div className="ao-glow" aria-hidden="true" />}
      {state.glow && state.marker && <Marker marker={state.marker} />}
      {state.glow && state.cursor && (
        <CursorMark cursor={state.cursor} tagged={state.marker === null} />
      )}
      {state.pill && (
        <div
          className="ao-pill"
          role="status"
          onMouseEnter={openPeek}
          onMouseLeave={closePeek}
          onFocus={openPeek}
          onBlur={closePeek}
        >
          <StatusIcon state={TONE_ICON[state.tone]} />
          <span className="ao-word">{RUN_WORDS[state.word]}</span>
          {state.minimized ? (
            <span className="ao-what truncate">{state.askLine}</span>
          ) : (
            <span className="ao-what truncate">
              {state.verb}
              {state.target !== null && (
                <>
                  : <strong>{state.target}</strong>
                </>
              )}
            </span>
          )}
          {!state.ended && !state.minimized && (
            <span className="ao-step">Step {state.step}</span>
          )}
          {state.minimized && (
            <>
              <Button
                size="sm"
                variant="primary"
                title="Show the question again"
                onClick={() => window.browserApi.overlayMinimize(false)}
              >
                Review
              </Button>
              {state.goToTab && (
                <Button
                  size="sm"
                  icon="ext-link"
                  title="Show the tab this is about"
                  onClick={() => window.browserApi.overlayGoToTab()}
                >
                  Go to tab
                </Button>
              )}
            </>
          )}
          {state.ended && state.word === 'finished' && state.made && (
            <Button
              size="sm"
              className="btn-open"
              title={MADE_WORDS[state.made.kind]}
              onClick={() => window.browserApi.overlayOpenMade()}
            >
              Open
            </Button>
          )}
          {state.ended && state.word === 'stopped' && (
            <Button
              size="sm"
              title="Carry on where it stopped"
              onClick={() => window.browserApi.overlayContinue()}
            >
              Continue
            </Button>
          )}
          {state.ended ? (
            <IconButton
              icon="x"
              size="sm"
              label="Dismiss"
              onClick={() => window.browserApi.overlayDismiss()}
            />
          ) : (
            <Button
              size="sm"
              icon="stop"
              title="Stop this reply"
              onClick={() => window.browserApi.overlayStop()}
            >
              Stop
            </Button>
          )}
        </div>
      )}
      {state.pill && peeking && (
        <div onMouseEnter={openPeek} onMouseLeave={closePeek}>
          <PeekList steps={state.recent} />
        </div>
      )}
      {state.card && <PoppedOutCard state={state} />}
    </div>
  );
}
