// The new-tab page: a greeting and one large box that takes an address or a search.
// A new tab has no web page; the app draws this in its place, and the tab becomes a
// web tab when you go somewhere. The look follows the design hand-off (docs/design).
import { useEffect, useMemo, useRef, useState } from 'react';
import { SPACE_COLOR_HEX } from './colors';
import { greetingFor } from './greetings';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import type { SpaceInfo, TabInfo } from './types';
import { Pill } from './ui/controls';
import { Icon } from './ui/Icon';

// What was typed in each new tab, kept while you look at another tab and come back.
const drafts = new Map<number, string>();

export function NewTabView({
  tab,
  space,
}: {
  tab: TabInfo;
  space: SpaceInfo | undefined;
}) {
  const [text, setText] = useState(() => drafts.get(tab.id) ?? '');
  const input = useRef<HTMLInputElement>(null);
  // The same tab always gets the same greeting.
  const greeting = useMemo(() => greetingFor(new Date(), tab.id), [tab.id]);

  // The box has the keyboard as soon as the page is there.
  useEffect(() => {
    input.current?.focus();
  }, []);

  const go = () => {
    const typed = text.trim();
    if (typed === '') return;
    drafts.delete(tab.id);
    window.browserApi.navigate(typed);
  };

  const tint = space ? SPACE_COLOR_HEX[space.color] : null;

  return (
    <main
      className="nt-card"
      aria-label="New tab"
      style={{
        // The same rounded card where a web page would be. The app keeps these
        // variables up to date while the frame slides (see App.tsx).
        top: TOOLBAR_HEIGHT,
        left: `calc(var(--left) + ${PAGE_INSET}px)`,
        right: `calc(var(--rail) + var(--panel) + ${PAGE_INSET}px)`,
        bottom: `calc(var(--chat) + ${PAGE_INSET}px)`,
        borderRadius: PAGE_RADIUS,
        background: tint
          ? `color-mix(in srgb, ${tint} 8%, var(--c-surface))`
          : 'var(--c-surface)',
      }}
    >
      {space && (
        <div className="nt-label">
          New tab in
          <Pill
            color={space.color === 'grey' ? 'blue' : (space.color as never)}
          >
            {space.emoji} {space.name}
          </Pill>
        </div>
      )}
      <div className="nt-col">
        <h1>{greeting}</h1>
        <div className="nt-box">
          <span className="nt-mode" aria-hidden="true">
            <Icon name="search" />
          </span>
          <input
            ref={input}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              drafts.set(tab.id, event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                go();
              } else if (event.key === 'Escape') {
                // First press clears the box; the second leaves it.
                event.preventDefault();
                if (text !== '') {
                  setText('');
                  drafts.delete(tab.id);
                } else {
                  input.current?.blur();
                }
              }
            }}
            placeholder="Go to or search"
            aria-label="Go to or search"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
    </main>
  );
}
