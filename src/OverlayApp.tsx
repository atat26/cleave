// The overlay on the page: a glow round the page while the assistant works in it, and a
// small pill hanging from the top with its state, what it is doing, and Stop. This is a
// page of our own in a view above the web page (see tabs.ts), so the web page cannot see,
// move or draw over it. What it shows comes from the app (agentVisuals.ts), never from
// the web page. The look is in components.css (.ao).
import { useEffect, useState } from 'react';
import type { OverlayState } from './agentVisuals';
import { RUN_WORDS } from './runModel';
import type { StepState } from './runModel';
import { StatusIcon } from './StepList';
import { Button, IconButton } from './ui/controls';

const TONE_ICON: Record<OverlayState['tone'], StepState> = {
  working: 'running',
  waiting: 'waiting',
  stuck: 'failed',
  finished: 'done',
  stopped: 'stopped',
};

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
    >
      {framed && <div className="ao-glow" aria-hidden="true" />}
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
    </div>
  );
}
