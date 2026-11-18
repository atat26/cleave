// The overlay on the page: a glow round the page while the assistant works in it, and a
// small pill hanging from the top with its state, what it is doing, and Stop. This is a
// page of our own in a view above the web page (see tabs.ts), so the web page cannot see,
// move or draw over it. What it shows comes from the app (agentVisuals.ts), never from
// the web page. The look is in components.css (.ao).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cardSide } from './agentVisuals';
import type { OverlayState } from './agentVisuals';
import type { MarkerView } from './marker';
import { RUN_WORDS } from './runModel';
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
        onStop={() => window.browserApi.overlayStop()}
        takeKeyboard
      />
    </div>
  );
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState | null>(null);

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
      {state.pill && (
        <div className="ao-pill" role="status">
          <StatusIcon state={TONE_ICON[state.tone]} />
          <span className="ao-word">{RUN_WORDS[state.word]}</span>
          <span className="ao-what truncate">
            {state.verb}
            {state.target !== null && (
              <>
                : <strong>{state.target}</strong>
              </>
            )}
          </span>
          {!state.ended && <span className="ao-step">Step {state.step}</span>}
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
      {state.card && <PoppedOutCard state={state} />}
    </div>
  );
}
