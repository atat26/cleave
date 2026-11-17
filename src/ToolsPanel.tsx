import { useEffect, useMemo, useState } from 'react';
import { APPROVAL_LEVELS, GROUP_TITLES, LEVEL_WORDS } from './toolPolicy';
import type { ApprovalLevel, ToolGroup } from './toolPolicy';
import { requestSettingsSection } from './settingsNav';
import {
  commonLevel,
  detectPreset,
  filterRows,
  PRESET_HELP,
  PRESET_WORDS,
  summarizeRows,
  TOOL_PRESETS,
} from './toolSettings';
import type { ToolPreset, ToolRow } from './toolSettings';
import type { SearchStatus } from './types';
import { Banner, Button, IconButton, Input, Segmented } from './ui/controls';
import { Icon } from './ui/Icon';

const GROUPS: ToolGroup[] = [
  'look',
  'act',
  'tabs',
  'recall',
  'skills',
  'artifacts',
  'chat',
];

// What each level means, in plain words.
const LEVEL_HELP: Record<ApprovalLevel, string> = {
  always: 'It just happens, with no question.',
  'if-safe':
    'It happens unless it is risky (buying, sending, deleting, the Enter key, another website). Risky ones still ask.',
  ask: 'An approval card appears every time.',
  never: 'The assistant is not given this tool at all.',
};

// The short wording on a pill, so the tool's name has room.
const SHORT_WORDS: Record<ApprovalLevel, string> = {
  always: 'Always',
  'if-safe': 'If safe',
  ask: 'Ask first',
  never: 'Never',
};

// Things that stay refused whatever you choose.
const ALWAYS_REFUSED = [
  'Typing in password, card or code fields.',
  'Accepting terms or cookies for you.',
  'Downloading files.',
  'Acting in tabs that are not linked to the chat.',
];

// Something waiting for you to confirm "Always allow": one tool, or a whole group.
type Confirming =
  | { kind: 'tool'; name: string }
  | { kind: 'group'; group: ToolGroup };

// The Tools panel: what the assistant can do, and how much of it it may do without
// asking. A change applies from the assistant's next reply and is saved. It starts with
// one choice for everything (Cautious, Balanced or Hands-off); the tools are in groups
// you can open, each with a small pill that opens the four levels. Reset and the
// descriptions appear when the pointer or keyboard is on a row.
export function ToolsPanel() {
  const [rows, setRows] = useState<ToolRow[] | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [query, setQuery] = useState('');
  // Groups you have opened or closed (the first group starts open).
  const [open, setOpen] = useState<Partial<Record<ToolGroup, boolean>>>({
    look: true,
  });
  // Web search needs setting up: whether it is, for the row that says so.
  const [search, setSearch] = useState<SearchStatus | null>(null);

  useEffect(() => {
    void window.browserApi.toolsList().then(setRows);
    void window.browserApi.searchStatus().then(setSearch);
  }, []);

  const apply = async (tool: string, level: ApprovalLevel) => {
    setConfirming(null);
    setRows(await window.browserApi.toolsSetLevel(tool, level));
  };
  const applyGroup = async (group: ToolGroup, level: ApprovalLevel) => {
    setConfirming(null);
    setRows(await window.browserApi.toolsSetGroup(group, level));
  };

  // A choice from a level menu (the pill, a group's pill, or a right-click). Choosing
  // "Always allow" for something that changes things asks first.
  const rowsRef = useMemo(() => ({ current: rows }), [rows]);
  useEffect(
    () =>
      window.browserApi.onToolLevelChosen((target, level) => {
        const current = rowsRef.current;
        if (!current) return;
        if (target.startsWith('tool:')) {
          const row = current.find((r) => r.name === target.slice(5));
          if (!row) return;
          if (
            level === 'always' &&
            row.changesThings &&
            row.level !== 'always'
          ) {
            setConfirming({ kind: 'tool', name: row.name });
          } else void apply(row.name, level);
        } else if (target.startsWith('group:')) {
          const group = GROUPS.find((g) => g === target.slice(6));
          if (!group) return;
          const inGroup = current.filter((r) => r.group === group);
          if (
            level === 'always' &&
            inGroup.some((r) => r.changesThings && r.level !== 'always')
          ) {
            setConfirming({ kind: 'group', group });
          } else void applyGroup(group, level);
        }
      }),
    [rowsRef],
  );

  if (rows === null) return <p className="muted">Loading…</p>;

  const preset = detectPreset(rows);
  const visible = filterRows(rows, query);
  const searching = query.trim() !== '';

  const openMenu = (target: string, element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    window.browserApi.showToolLevelMenu(
      target,
      box.right - 180,
      box.bottom + 4,
    );
  };

  const confirmTools =
    confirming === null
      ? []
      : confirming.kind === 'tool'
        ? rows.filter((r) => r.name === confirming.name)
        : rows.filter((r) => r.group === confirming.group && r.changesThings);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 'var(--s-3)',
      }}
    >
      <div>
        <div className="row-flex" style={{ gap: 'var(--s-2)' }}>
          <span className="grow" style={{ fontWeight: 600 }}>
            How much may it do on its own?
          </span>
          {preset === 'custom' && (
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              Custom
            </span>
          )}
        </div>
        <div style={{ margin: 'var(--s-2) 0' }}>
          <Segmented<ToolPreset | 'custom'>
            fill
            label="How much the assistant may do on its own"
            options={TOOL_PRESETS.map((p) => ({
              value: p,
              label: PRESET_WORDS[p],
            }))}
            value={preset}
            onChange={(next) => {
              if (next !== 'custom') {
                setConfirming(null);
                void window.browserApi.toolsPreset(next).then(setRows);
              }
            }}
          />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-xs)' }}>
          {preset === 'custom'
            ? 'You have set some tools yourself. Choose one above to set them all at once.'
            : PRESET_HELP[preset]}{' '}
          A change applies from its next reply.
        </p>
      </div>

      <Input
        type="search"
        aria-label="Search tools"
        placeholder="Search tools"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
        {summarizeRows(rows)}
      </div>

      {confirming !== null && confirming.kind === 'group' && (
        <ConfirmBanner
          question={`Allow everything in “${GROUP_TITLES[confirming.group]}” without asking?`}
          rows={confirmTools}
          onAllow={() => void applyGroup(confirming.group, 'always')}
          onCancel={() => setConfirming(null)}
        />
      )}

      {GROUPS.map((group) => {
        const inGroup = rows.filter((r) => r.group === group);
        const shown = visible.filter((r) => r.group === group);
        if (searching && shown.length === 0) return null;
        const isOpen = searching || open[group] === true;
        const level = commonLevel(inGroup);
        return (
          <section key={group} aria-label={GROUP_TITLES[group]}>
            <div
              className="row-flex reveal-host"
              style={{ gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm grow"
                style={{ justifyContent: 'flex-start', fontWeight: 600 }}
                aria-expanded={isOpen}
                title={`${GROUP_TITLES[group]} (${inGroup.length})`}
                onClick={() => setOpen((o) => ({ ...o, [group]: !isOpen }))}
              >
                <Icon name={isOpen ? 'chev-d' : 'chev-r'} />
                <span className="truncate">{GROUP_TITLES[group]}</span>
              </button>
              <LevelPill
                label={`Set every tool in ${GROUP_TITLES[group]} (${inGroup.length})`}
                words={level === null ? 'Mixed' : LEVEL_WORDS[level]}
                shown={level === null ? 'Mixed' : SHORT_WORDS[level]}
                muted={level === null}
                onOpen={(element) => openMenu(`group:${group}`, element)}
              />
            </div>
            {isOpen &&
              shown.map((row) => (
                <div key={row.name}>
                  <ToolRowView
                    row={row}
                    search={search}
                    onMenu={(element) => openMenu(`tool:${row.name}`, element)}
                    onMenuAt={(x, y) =>
                      window.browserApi.showToolLevelMenu(
                        `tool:${row.name}`,
                        x,
                        y,
                      )
                    }
                    onReset={() => void apply(row.name, row.defaultLevel)}
                  />
                  {confirming?.kind === 'tool' &&
                    confirming.name === row.name && (
                      <ConfirmBanner
                        question="Allow this without asking?"
                        text={
                          row.warning ??
                          `The assistant will be able to ${row.title.toLowerCase()} on its own, including risky things such as buying or sending.`
                        }
                        onAllow={() => void apply(row.name, 'always')}
                        onCancel={() => setConfirming(null)}
                      />
                    )}
                </div>
              ))}
          </section>
        );
      })}
      {searching && visible.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No tool matches “{query.trim()}”.
        </p>
      )}

      <details>
        <summary className="muted" style={{ cursor: 'pointer' }}>
          What do these mean?
        </summary>
        <div
          className="muted"
          style={{
            display: 'grid',
            gap: 2,
            margin: 'var(--s-2) 0 0',
            fontSize: 'var(--fs-xs)',
          }}
        >
          {APPROVAL_LEVELS.map((level) => (
            <div key={level}>
              <strong style={{ color: 'var(--c-text)' }}>
                {LEVEL_WORDS[level]}:
              </strong>{' '}
              {LEVEL_HELP[level]}
            </div>
          ))}
        </div>
      </details>

      <details>
        <summary className="muted" style={{ cursor: 'pointer' }}>
          Never allowed, whatever you choose
        </summary>
        <ul
          className="muted"
          style={{
            margin: 'var(--s-2) 0 0',
            paddingLeft: 18,
            fontSize: 'var(--fs-xs)',
          }}
        >
          {ALWAYS_REFUSED.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// The small pill that shows a level and opens the menu of the four.
function LevelPill({
  label,
  words,
  shown,
  muted = false,
  onOpen,
}: {
  label: string;
  words: string;
  // The shorter text on the pill itself (the menu and screen readers use the full words).
  shown: string;
  muted?: boolean;
  onOpen: (element: HTMLElement) => void;
}) {
  return (
    <Button
      size="sm"
      aria-haspopup="menu"
      aria-label={`${label}: ${words}`}
      title={label}
      style={{
        flexShrink: 0,
        opacity: muted || words === 'Never allow' ? 0.65 : 1,
      }}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      {shown}
      <Icon name="chev-d" />
    </Button>
  );
}

// One tool: its name, its level, and (on hover or focus) a way back to the default.
// The description is the row's tooltip; right-click opens the same menu as the pill.
function ToolRowView({
  row,
  search,
  onMenu,
  onMenuAt,
  onReset,
}: {
  row: ToolRow;
  search: SearchStatus | null;
  onMenu: (element: HTMLElement) => void;
  onMenuAt: (x: number, y: number) => void;
  onReset: () => void;
}) {
  const changed = row.level !== row.defaultLevel;
  return (
    <div
      className="lrow reveal-host"
      title={row.summary}
      style={{ padding: 'var(--s-1) var(--s-2)' }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenuAt(event.clientX, event.clientY);
      }}
    >
      <span className="grow" style={{ minWidth: 0 }}>
        <span
          className="truncate"
          style={{
            display: 'block',
            opacity: row.level === 'never' ? 0.6 : 1,
          }}
        >
          {row.title}
          {changed && (
            <span
              role="img"
              aria-label="Changed from its default"
              title={`Changed from its default: ${LEVEL_WORDS[row.defaultLevel]}`}
              style={{ color: 'var(--c-accent)', marginLeft: 6 }}
            >
              •
            </span>
          )}
        </span>
        {row.setup === 'web-search' && search !== null && (
          <span
            className="muted"
            style={{
              display: 'block',
              fontSize: 'var(--fs-xs)',
              color: search.hasKey ? 'var(--c-ok)' : 'var(--c-danger)',
            }}
          >
            {search.hasKey
              ? (search.providers.find((p) => p.id === search.provider)?.name ??
                'Provider')
              : 'Not set up yet'}{' '}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(event) => {
                event.stopPropagation();
                requestSettingsSection('web-search');
                window.browserApi.openSettings();
              }}
            >
              Settings
            </button>
          </span>
        )}
      </span>
      {changed && (
        <IconButton
          icon="undo"
          size="sm"
          className="reveal"
          label={`Put ${row.title} back to its default: ${LEVEL_WORDS[row.defaultLevel]}`}
          onClick={onReset}
        />
      )}
      <LevelPill
        label={`How to handle: ${row.title}`}
        words={LEVEL_WORDS[row.level]}
        shown={SHORT_WORDS[row.level]}
        onOpen={onMenu}
      />
    </div>
  );
}

// "Allow without asking?" for a tool that changes things (or a whole group).
function ConfirmBanner({
  question,
  text,
  rows,
  onAllow,
  onCancel,
}: {
  question: string;
  text?: string;
  rows?: ToolRow[];
  onAllow: () => void;
  onCancel: () => void;
}) {
  return (
    <Banner
      tone="warn"
      actions={
        <>
          <Button size="sm" variant="danger" onClick={onAllow}>
            Allow without asking
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </>
      }
    >
      <strong>{question}</strong>{' '}
      {text ??
        `This includes tools that change things: ${(rows ?? []).map((r) => r.title.toLowerCase()).join(', ')}.`}{' '}
      The safety rules still apply.
    </Banner>
  );
}
