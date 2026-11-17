// The new-tab page: a greeting, one large box that takes an address, a search or a
// request to the assistant, "Pick up" (unfinished things from the Space you are in)
// and a row of Space pills. A new tab has no web page; the app draws this in its
// place, and the tab becomes a web tab when you go somewhere. The look and the
// behaviour follow the design hand-off (docs/design/new-tab).
import { useEffect, useMemo, useRef, useState } from 'react';
import { SPACE_COLOR_HEX } from './colors';
import { greetingFor } from './greetings';
import { PAGE_INSET, PAGE_RADIUS, TOOLBAR_HEIGHT } from './layout';
import { autoMode, cycleMode, MODES, modeLabel } from './newTabBox';
import type { BoxMode } from './newTabBox';
import { timeAgo } from './pickUp';
import { activeEngine } from './searchEngine';
import type { Suggestion } from './suggest';
import type { NewTabInfo, SpaceInfo, TabInfo } from './types';
import { Pill } from './ui/controls';
import { Icon } from './ui/Icon';
import type { IconName } from './ui/iconData';

// What was typed in each new tab, kept while you look at another tab and come back.
const drafts = new Map<number, string>();

const MODE_ICONS: Record<BoxMode, IconName> = {
  go: 'globe',
  search: 'search',
  ask: 'sparkle',
};

const PICK_ICONS = { chat: 'chat', artifact: 'doc', page: 'globe' } as const;

export function NewTabView({
  tab,
  space,
  info,
}: {
  tab: TabInfo;
  space: SpaceInfo | undefined;
  info: NewTabInfo;
}) {
  const [text, setText] = useState(() => drafts.get(tab.id) ?? '');
  // The mode the user chose with Tab or a click; it lasts until the box is emptied.
  const [manual, setManual] = useState<BoxMode | null>(null);
  const [engine, setEngine] = useState('your search engine');
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [picked, setPicked] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef(0);
  // The same tab always gets the same greeting.
  const greeting = useMemo(
    () =>
      info.firstRun
        ? 'Welcome.'
        : info.welcomeBack
          ? 'Welcome back.'
          : greetingFor(new Date(), tab.id),
    [info.firstRun, info.welcomeBack, tab.id],
  );

  const typing = text.trim() !== '';
  const mode: BoxMode = manual ?? (info.autoMode ? autoMode(text) : 'search');
  const label = modeLabel(mode, engine);

  // The box has the keyboard as soon as the page is there.
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    void window.browserApi
      .searchEngineGet()
      .then((settings) => setEngine(activeEngine(settings).name));
  }, []);

  // Typing an address brings up pages you already know (history, bookmarks, open
  // tabs). Nothing from outside is fetched.
  useEffect(() => {
    if (!typing || mode !== 'go') {
      setRows([]);
      setPicked(-1);
      return;
    }
    const mine = ++asked.current;
    void window.browserApi.suggestQuery(text).then((found) => {
      if (mine !== asked.current) return;
      setRows(
        found
          .filter(
            (r) =>
              r.kind === 'bookmark' || r.kind === 'history' || r.kind === 'tab',
          )
          .slice(0, 4),
      );
      setPicked(-1);
    });
  }, [text, typing, mode]);

  const run = () => {
    const typed = text.trim();
    if (typed === '') return;
    drafts.delete(tab.id);
    window.browserApi.newTabRun(typed, mode);
  };

  const pick = (row: Suggestion) => {
    drafts.delete(tab.id);
    if (row.kind === 'tab' && row.tabId !== undefined) {
      if (row.closed) window.browserApi.reopenTab(row.tabId);
      else window.browserApi.selectTab(row.tabId);
    } else {
      window.browserApi.newTabRun(row.url, 'go');
    }
  };

  const tint = space ? SPACE_COLOR_HEX[space.color] : null;
  // Pick up shows only when there is something to pick up and nothing is being typed.
  const showPick =
    !typing &&
    info.suggestions &&
    !info.firstRun &&
    !info.secondInRow &&
    info.pick.length > 0;

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
      {space && !info.firstRun && (
        <div className="nt-label">
          New tab in
          <Pill
            color={space.color === 'grey' ? 'blue' : (space.color as never)}
          >
            {space.emoji} {space.name}
          </Pill>
        </div>
      )}
      <div className={info.secondInRow ? 'nt-col nt-second' : 'nt-col'}>
        {!info.secondInRow && <h1>{greeting}</h1>}
        <div className="nt-box">
          {typing ? (
            <span className="nt-chip">
              <Icon name={MODE_ICONS[mode]} />
              {mode === 'search' ? 'Search' : label}
            </span>
          ) : (
            <span className="nt-mode" aria-hidden="true">
              <Icon name="search" />
            </span>
          )}
          <input
            ref={input}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="nt-suggestions"
            aria-describedby="nt-live"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              drafts.set(tab.id, event.target.value);
              // A choice made with Tab lasts until the box is emptied.
              if (event.target.value.trim() === '') setManual(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Tab' && typing) {
                event.preventDefault();
                setManual(cycleMode(mode, event.shiftKey ? -1 : 1));
              } else if (event.key === 'ArrowDown' && rows.length > 0) {
                event.preventDefault();
                setPicked((picked + 1) % rows.length);
              } else if (event.key === 'ArrowUp' && rows.length > 0) {
                event.preventDefault();
                setPicked((picked - 1 + rows.length) % rows.length);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const row = rows[picked];
                if (row) pick(row);
                else run();
              } else if (event.key === 'Escape') {
                // First press clears the box; the second leaves it.
                event.preventDefault();
                if (text !== '') {
                  setText('');
                  setManual(null);
                  drafts.delete(tab.id);
                } else {
                  input.current?.blur();
                }
              }
            }}
            placeholder="Go to, search, or ask"
            aria-label="Go to, search, or ask"
            autoComplete="off"
            spellCheck={false}
          />
          {typing && (
            <button
              type="button"
              className="nt-send"
              aria-label={`Run: ${label}`}
              onClick={run}
            >
              <Icon name="send" />
            </button>
          )}
        </div>
        <div id="nt-live" className="nt-live" role="status" aria-live="polite">
          {typing ? `Enter will ${label}` : ''}
        </div>

        {typing && (
          <div className="nt-hint">
            <span>Enter will</span>
            <div className="nt-seg" role="group" aria-label="Enter action">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={m === mode}
                  onClick={() => {
                    setManual(m);
                    input.current?.focus();
                  }}
                >
                  {modeLabel(m, engine)}
                </button>
              ))}
            </div>
            <span className="nt-keys">
              <kbd className="kbd">Tab</kbd>to switch
            </span>
          </div>
        )}

        {rows.length > 0 && (
          <div
            className="nt-sug"
            id="nt-suggestions"
            role="listbox"
            aria-label="Pages you know"
          >
            {rows.map((row, i) => (
              <div
                key={`${row.kind}:${row.url}`}
                role="option"
                aria-selected={i === picked}
                className={i === picked ? 'nt-item is-picked' : 'nt-item'}
                onMouseMove={() => setPicked(i)}
                onClick={() => pick(row)}
              >
                <Icon name={row.kind === 'history' ? 'history' : 'globe'} />
                <span className="nt-item-title">{row.title}</span>
                <span className="nt-item-detail">{row.detail}</span>
              </div>
            ))}
          </div>
        )}

        {space && !info.firstRun && !info.secondInRow && (
          <div className="nt-ctx">
            <span>The assistant can see</span>
            <Pill
              color={space.color === 'grey' ? 'blue' : (space.color as never)}
            >
              {space.emoji} {space.name}
            </Pill>
          </div>
        )}

        {info.firstRun && (
          <p className="nt-first">
            Spaces keep related pages, chats and artifacts together. Make one
            when you start a piece of work. Nothing is suggested here until you
            have worked in one.
          </p>
        )}

        {showPick && (
          <section className="nt-pick" aria-labelledby="nt-pick-h">
            <div className="nt-pick-h reveal-host">
              <span id="nt-pick-h">Pick up</span>
              <button
                type="button"
                className="nt-link reveal"
                onClick={() =>
                  void window.browserApi.newTabSettingsSet({
                    suggestions: false,
                  })
                }
              >
                Turn off suggestions
              </button>
            </div>
            <ul className="nt-pick-list">
              {info.pick.map((row) => (
                <li key={row.key}>
                  <div
                    className="nt-pick-item reveal-host"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      window.browserApi.newTabResume(row.kind, row.id)
                    }
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        window.browserApi.newTabResume(row.kind, row.id);
                      }
                    }}
                  >
                    <Icon name={PICK_ICONS[row.kind]} />
                    <span className="nt-item-title">{row.title}</span>
                    <span className="nt-acts reveal">
                      <span className="nt-resume">Resume</span>
                      <button
                        type="button"
                        className="nt-link"
                        aria-label={`Hide ${row.title} from Pick up`}
                        onClick={(event) => {
                          event.stopPropagation();
                          window.browserApi.newTabHide(row.key);
                        }}
                      >
                        Hide
                      </button>
                    </span>
                    <span className="nt-time">{timeAgo(row.at, info.now)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {space && info.pickTotal > info.pick.length && (
              <button
                type="button"
                className="nt-more"
                onClick={() => window.browserApi.newTabShowAll(space.id)}
              >
                Show all {info.pickTotal} in this Space
              </button>
            )}
          </section>
        )}
      </div>

      {!typing && (
        <nav className="nt-pills" aria-label="Spaces">
          {!info.firstRun &&
            info.spaces.map((s) => {
              const current = s.id === space?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={current ? 'nt-pill is-current' : 'nt-pill'}
                  style={{ ['--c' as string]: SPACE_COLOR_HEX[s.color] }}
                  aria-current={current || undefined}
                  onClick={() => {
                    if (current) input.current?.focus();
                    else window.browserApi.newTabPill(s.id);
                  }}
                >
                  {s.emoji} {s.name}
                </button>
              );
            })}
          {!info.firstRun && info.moreSpaces > 0 && (
            <button
              type="button"
              className="nt-pill"
              aria-haspopup="menu"
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                window.browserApi.showNewTabSpacesMenu(box.left, box.top - 4);
              }}
            >
              + {info.moreSpaces} more
            </button>
          )}
          <button
            type="button"
            className="nt-pill is-add"
            onClick={() => window.browserApi.newTabPill('new')}
          >
            <Icon name="plus" />
            New Space
          </button>
        </nav>
      )}
    </main>
  );
}
