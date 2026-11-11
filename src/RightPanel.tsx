import { useRef } from 'react';
import { PAGE_INSET, PAGE_RADIUS, RAIL_WIDTH } from './layout';
import type { RightPanel as RightPanelName } from './model';
import { ResizeHandle } from './ResizeHandle';

const TITLES: Record<RightPanelName, string> = {
  skills: 'Skills',
  extensions: 'Extensions',
  settings: 'Settings',
};

const PLACEHOLDERS: Record<RightPanelName, string> = {
  skills: 'Reusable skills you can run from here are coming in a later update.',
  extensions: 'Extensions are coming in a later update.',
  settings: 'Your model settings and API key will go here in the next update.',
};

// The panel that opens to the left of the rail. It is a card on the frame, and
// you can drag its left edge to make it wider or narrower (drag it narrow to
// close it). The app keeps the --panel variable up to date while it slides.
export function RightPanel({ panel }: { panel: RightPanelName }) {
  const cardRef = useRef<HTMLElement>(null);

  return (
    <>
      <section
        ref={cardRef}
        aria-label={TITLES[panel]}
        style={{
          position: 'fixed',
          top: PAGE_INSET,
          bottom: PAGE_INSET,
          right: RAIL_WIDTH,
          width: 'var(--panel)',
          boxSizing: 'border-box',
          background: '#ffffff',
          borderRadius: PAGE_RADIUS,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            fontSize: 15,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ flex: 1 }}>{TITLES[panel]}</span>
          <button
            type="button"
            aria-label={`Close ${TITLES[panel]}`}
            title="Close"
            onClick={() => window.browserApi.togglePanel(panel)}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </header>
        <p
          style={{
            margin: 0,
            padding: '0 16px',
            color: '#5f6368',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {PLACEHOLDERS[panel]}
        </p>
      </section>
      <ResizeHandle
        kind="panel"
        axis="x"
        grows={-1}
        measure={() => cardRef.current?.offsetWidth ?? 0}
        title="Drag to resize. Drag all the way right to close."
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          // Straddles the panel's left edge, on the frame side of the page card.
          right: `calc(${RAIL_WIDTH}px + var(--panel) - 8px)`,
          width: 8,
        }}
      />
    </>
  );
}
