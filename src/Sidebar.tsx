import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { IconButton, ItemEmoji, SpaceIcon } from './ui/controls';
import { Icon } from './ui/Icon';
import { ChatList, ChatStrip } from './ChatHistory';
import { PinButton } from './PinButton';
import { DndProvider, useDnd } from './sidebarDnd';
import type { RowDnd } from './sidebarDnd';
import { SPACE_COLOR_HEX } from './colors';
import { SIDEBAR_FULL_MIN_WIDTH } from './layout';
import { ResizeHandle } from './ResizeHandle';
import { iconButtonStyle, stripButton } from './sidebarStyles';
import { countPending } from './pendingChanges';
import type { PendingChange } from './pendingChanges';
import { spaceSummary, STATUS_WORDS } from './sidebarStatus';
import type { RunChip, TabStatus } from './sidebarStatus';
import type { ArtifactTabInfo, SpaceInfo, TabInfo, UiState } from './types';

// What to write on a tab: its title, else its site name, else "New Tab".
export function labelFor(tab: TabInfo): string {
  if (tab.title) return tab.title;
  try {
    return new URL(tab.url).hostname || 'New Tab';
  } catch {
    return 'New Tab';
  }
}

export function Favicon({ tab }: { tab: TabInfo }) {
  return tab.favicon ? (
    <img
      src={tab.favicon}
      alt=""
      width={16}
      height={16}
      style={{ flexShrink: 0 }}
    />
  ) : (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        background: 'var(--c-text-3)',
        flexShrink: 0,
      }}
    />
  );
}

const showTabMenu = (tab: TabInfo) => (event: ReactMouseEvent) => {
  event.preventDefault();
  window.browserApi.showTabMenu(tab.id, event.clientX, event.clientY);
};

// ---------------------------------------------------------------------------
// Full-width sidebar
// ---------------------------------------------------------------------------

// What the assistant's work looks like on a tab (and on a Space): a dot whose colour says
// working (blue), waiting for you (amber), stuck (red) or finished while you were elsewhere
// (green, until you open the tab). It always has its words too, for the pointer and for
// screen readers; the colour is never the only sign.
const STATUS_DOT: Record<TabStatus, { dot: string; ring: string }> = {
  working: { dot: 'var(--c-accent)', ring: 'var(--c-accent-tint)' },
  waiting: { dot: 'var(--c-warn-edge)', ring: 'var(--c-warn-tint)' },
  stuck: { dot: 'var(--c-danger)', ring: 'var(--c-danger-tint)' },
  finished: { dot: 'var(--c-ok)', ring: 'var(--c-ok-tint)' },
};

function StatusDot({
  status,
  label = STATUS_WORDS[status],
}: {
  status: TabStatus;
  label?: string;
}) {
  const colour = STATUS_DOT[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        background: colour.dot,
        boxShadow: `0 0 0 3px ${colour.ring}`,
        flexShrink: 0,
      }}
    />
  );
}

// A request waiting for your answer that would move or close a tab: the row is tinted (blue
// for a move, red for a close) and says so in words, until you answer. In the narrow strip the
// tint is on the icon and the words are in its hover text.
const PENDING_TINT: Record<PendingChange['kind'], string> = {
  move: 'color-mix(in srgb, var(--c-accent) 12%, transparent)',
  close: 'color-mix(in srgb, var(--c-danger) 10%, transparent)',
};

function PendingTag({ change }: { change: PendingChange }) {
  return <span className={`pend-tag is-${change.kind}`}>{change.tag}</span>;
}

// One line at the top of the sidebar while the assistant is at work; clicking it goes to
// what it is on (the tab, or the chat).
function AssistantChip({ chip }: { chip: RunChip }) {
  const icon =
    chip.tone === 'working'
      ? 'spinner'
      : chip.tone === 'waiting'
        ? 'clock'
        : 'warn';
  return (
    <div role="status" className="sb-chip-wrap">
      <button
        type="button"
        className="sb-chip"
        data-tone={chip.tone}
        title="Go to what the assistant is on"
        onClick={() => window.browserApi.assistantChipGo()}
      >
        <Icon name={icon} />
        <span>{chip.text}</span>
      </button>
    </div>
  );
}

// Something dragged over a collapsed Space for this long opens it.
const EXPAND_AFTER_MS = 600;

// Pressing Enter or Space on a focused row does what clicking it does.
const rowKeys = (open: () => void) => (event: ReactKeyboardEvent) => {
  if (event.target !== event.currentTarget) return; // Not from a button inside.
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    open();
  }
};

// Every row in the sidebar (a tab, an artifact, a Space) is built the same way:
// an icon, a name, the assistant's working dot if it is busy, and buttons that
// show while the mouse is over the row.
function Row({
  active,
  dim = false,
  title,
  onOpen,
  onContextMenu,
  onMiddleClick,
  onSeen,
  tint,
  icon,
  children,
  trailing,
  dnd,
}: {
  // Drag and drop (see sidebarDnd.tsx).
  dnd?: RowDnd;
  active: boolean;
  dim?: boolean;
  title: string;
  onOpen: () => void;
  onContextMenu?: (event: ReactMouseEvent) => void;
  // Middle-click on the row (a tab or an artifact: close it).
  onMiddleClick?: () => void;
  // The pointer left the row, or the keyboard moved off it (or it was clicked).
  onSeen?: () => void;
  // A request waiting for you would move or close this tab.
  tint?: PendingChange['kind'];
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      {...dnd}
      className={[
        active ? 'lrow collapse-actions is-active' : 'lrow collapse-actions',
        tint ? `is-${tint}` : '',
        dnd?.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      aria-current={active || undefined}
      title={title}
      onClick={() => {
        onOpen();
        onSeen?.();
      }}
      onMouseLeave={onSeen}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onSeen?.();
        }
      }}
      onKeyDown={(event) => {
        dnd?.onKeyDown?.(event);
        if (!event.defaultPrevented) rowKeys(onOpen)(event);
      }}
      onContextMenu={onContextMenu}
      onMouseDown={(event) => {
        if (event.button === 1 && onMiddleClick) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== 1 || !onMiddleClick) return;
        event.preventDefault();
        onMiddleClick();
      }}
      style={{ opacity: dim ? 0.6 : 1 }}
    >
      {icon}
      <span className="truncate grow">{children}</span>
      {trailing}
    </div>
  );
}

// A green or red dot stays until you have been at the tab's row (the pointer went over it and
// away again, a click, or the keyboard passed through), not merely until you are in the tab.
const seenTab = (tab: TabInfo) => {
  if (tab.status === 'finished' || tab.status === 'stuck') {
    window.browserApi.markTabSeen(tab.id);
  }
};

function TabRow({
  tab,
  active,
  nextId,
}: {
  tab: TabInfo;
  active: boolean;
  // The tab after this one in its group (null: it is the last).
  nextId: number | null;
}) {
  const dnd = useDnd().itemProps(
    { kind: 'tab', id: tab.id },
    { spaceId: tab.spaceId, nextId },
  );
  return (
    <Row
      dnd={dnd}
      active={active}
      dim={!tab.loaded}
      title={
        tab.pending
          ? `${labelFor(tab)}: ${tab.pending.words.toLowerCase()}`
          : labelFor(tab)
      }
      tint={tab.pending?.kind}
      onOpen={() => window.browserApi.selectTab(tab.id)}
      onContextMenu={showTabMenu(tab)}
      onMiddleClick={() => window.browserApi.closeTab(tab.id)}
      onSeen={() => seenTab(tab)}
      icon={<Favicon tab={tab} />}
      trailing={
        <>
          {tab.pending && <PendingTag change={tab.pending} />}
          {tab.status && <StatusDot status={tab.status} />}
          {(tab.audible || tab.muted) && (
            <IconButton
              icon={tab.muted ? 'volume-off' : 'volume'}
              size="sm"
              label={
                tab.muted ? `Unmute ${labelFor(tab)}` : `Mute ${labelFor(tab)}`
              }
              pressed={tab.muted}
              onClick={(event) => {
                event.stopPropagation(); // Don't also select this tab.
                window.browserApi.setTabMuted(tab.id, !tab.muted);
              }}
            />
          )}
          <IconButton
            icon="x"
            size="sm"
            className="hover-only"
            label={`Close ${labelFor(tab)}`}
            title={
              tab.spaceId === null
                ? 'Close tab (Ctrl+W)'
                : 'Close tab (Ctrl+W). The page stays in its Space.'
            }
            onClick={(event) => {
              event.stopPropagation(); // Don't also select this tab.
              window.browserApi.closeTab(tab.id);
            }}
          />
        </>
      }
    >
      {labelFor(tab)}
    </Row>
  );
}

// An open artifact in the sidebar: a document icon, its name, and a close button.
function ArtifactRow({
  tab,
  active,
  nextId,
}: {
  tab: ArtifactTabInfo;
  active: boolean;
  nextId: number | null;
}) {
  const dnd = useDnd().itemProps(
    { kind: 'artifact', id: tab.id },
    { spaceId: tab.spaceId, nextId },
  );
  return (
    <Row
      dnd={dnd}
      active={active}
      title={tab.title}
      onOpen={() => window.browserApi.artifactSelect(tab.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        window.browserApi.showArtifactMenu(
          tab.id,
          event.clientX,
          event.clientY,
        );
      }}
      icon={<ItemEmoji emoji={tab.emoji} />}
      trailing={
        <IconButton
          icon="x"
          size="sm"
          className="hover-only"
          label={`Close ${tab.title}`}
          title="Close tab (Ctrl+W)"
          onClick={(event) => {
            event.stopPropagation(); // Don't also select this tab.
            window.browserApi.artifactClose(tab.id);
          }}
        />
      }
    >
      {tab.title}
    </Row>
  );
}

// A Space: a coloured, collapsible group. Its title row is built like a tab row,
// and clicking it opens the Space's overview (the name IS the overview).
function SpaceGroup({
  space,
  nextSpaceId,
  tabs,
  artifacts,
  active,
  renameRequest,
  onRenameHandled,
}: {
  space: SpaceInfo;
  // The Space after this one (null: it is the last).
  nextSpaceId: number | null;
  tabs: TabInfo[];
  artifacts: ArtifactTabInfo[];
  active: UiState['active'];
  // Set when "Rename Space" was chosen from this Space's right-click menu.
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const dnd = useDnd();
  const spaceDnd = dnd.spaceProps(space.id, nextSpaceId);
  const { grip, ...headerDnd } = spaceDnd;
  // Something dragged over a collapsed Space for a moment opens it.
  const hoveredWhileDragging =
    dnd.drag !== null &&
    dnd.drag.kind !== 'space' &&
    dnd.over?.type === 'into' &&
    dnd.over.spaceId === space.id;
  useEffect(() => {
    if (!space.collapsed || !hoveredWhileDragging) return;
    const timer = window.setTimeout(
      () => window.browserApi.setSpaceCollapsed(space.id, false),
      EXPAND_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [space.collapsed, space.id, hoveredWhileDragging]);

  useEffect(() => {
    if (renameRequest === space.id) {
      setEditing(true);
      onRenameHandled();
    }
  }, [renameRequest, space.id, onRenameHandled]);

  const openMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    window.browserApi.showSpaceMenu(space.id, event.clientX, event.clientY);
  };
  const color = SPACE_COLOR_HEX[space.color];
  const leadActive = active?.kind === 'lead' && active.spaceId === space.id;

  const finishRename = (value: string) => {
    setEditing(false);
    if (value.trim() !== '' && value !== space.name) {
      window.browserApi.renameSpace(space.id, value);
    }
  };

  const colourDot = <SpaceIcon emoji={space.emoji} tint={color} />;
  // How many of its tabs the assistant is working in, and the most urgent dot among them.
  const summary = spaceSummary(tabs.map((tab) => tab.status));
  // Tabs in here that a waiting request would change (so a collapsed Space does not hide them).
  const changes = countPending(tabs);

  return (
    <div style={{ marginTop: 8 }}>
      {editing ? (
        <div className="lrow" onContextMenu={openMenu}>
          {colourDot}
          <input
            className="input"
            autoFocus
            defaultValue={space.name}
            maxLength={60}
            aria-label="Space name"
            onFocus={(e) => e.target.select()}
            onBlur={(e) => finishRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing)
                e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{ flex: 1, minWidth: 0, height: 26 }}
          />
        </div>
      ) : (
        <Row
          dnd={headerDnd}
          active={leadActive}
          title={`${space.name}: open the overview`}
          onOpen={() => window.browserApi.selectLead(space.id)}
          onContextMenu={openMenu}
          icon={
            <>
              <span
                {...grip}
                className="hover-only dnd-grip"
                title="Drag to move this Space"
                aria-hidden="true"
              >
                <Icon name="grip" />
              </span>
              <IconButton
                icon={space.collapsed ? 'chev-r' : 'chev-d'}
                size="sm"
                label={space.collapsed ? 'Expand Space' : 'Collapse Space'}
                title={space.collapsed ? 'Expand' : 'Collapse'}
                onClick={(event) => {
                  event.stopPropagation(); // Don't also open the overview.
                  window.browserApi.setSpaceCollapsed(
                    space.id,
                    !space.collapsed,
                  );
                }}
              />
              {colourDot}
            </>
          }
          trailing={
            <>
              {space.collapsed && changes > 0 && (
                <span
                  className="badge warn"
                  title={`A request waiting for you would change ${changes} tab${changes === 1 ? '' : 's'} here`}
                >
                  {changes} change{changes === 1 ? '' : 's'}
                </span>
              )}
              {summary.working > 0 && (
                <span
                  className="badge ai"
                  title={`The assistant is working in ${summary.working} tab${summary.working === 1 ? '' : 's'} here`}
                >
                  {summary.working} working
                </span>
              )}
              {space.collapsed && summary.urgent !== null && (
                <StatusDot status={summary.urgent} />
              )}
              {space.collapsed && (
                <span className="badge" title={`${tabs.length} tabs`}>
                  {tabs.length}
                </span>
              )}
              <IconButton
                icon="plus"
                size="sm"
                className="hover-only"
                label={`New tab in ${space.name}`}
                title="New tab in this Space"
                onClick={(event) => {
                  event.stopPropagation();
                  window.browserApi.newTab(space.id);
                }}
              />
            </>
          }
        >
          {space.name}
        </Row>
      )}

      {!space.collapsed && (
        <div
          style={{
            borderLeft: `3px solid ${color}`,
            marginLeft: 10,
            paddingLeft: 4,
          }}
        >
          {tabs.map((tab, i) => (
            <TabRow
              key={tab.id}
              tab={tab}
              nextId={tabs[i + 1]?.id ?? null}
              active={active?.kind === 'tab' && active.id === tab.id}
            />
          ))}
          {dnd.endSlot({ type: 'tab', spaceId: space.id, beforeId: null })}
          {artifacts.map((a, i) => (
            <ArtifactRow
              key={`a${a.id}`}
              tab={a}
              nextId={artifacts[i + 1]?.id ?? null}
              active={active?.kind === 'artifact' && active.id === a.id}
            />
          ))}
          {dnd.endSlot({ type: 'artifact', spaceId: space.id, beforeId: null })}
        </div>
      )}
    </div>
  );
}

function FullSidebar({
  state,
  renameRequest,
  onRenameHandled,
}: {
  state: UiState;
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const ungrouped = state.tabs.filter((tab) => tab.spaceId === null);
  const looseArtifacts = state.artifactTabs.filter((a) => a.spaceId === null);
  const dnd = useDnd();

  return (
    <>
      <div
        className="sb-head reveal-host"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 10px 0 12px',
          height: 48,
          boxSizing: 'border-box',
          fontWeight: 600,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {/* The new-tab "+" is in the same place (top left) as in the narrow strip.
            Resting the pointer on it brings up "+ Space" beside it. */}
        <div className="sb-add reveal-host">
          <IconButton
            icon="plus"
            label="New tab"
            title="New tab (Ctrl+T)"
            onClick={() => window.browserApi.newTab(null)}
          />
          <button
            type="button"
            className="reveal sb-space"
            aria-label="New Space"
            title="New Space"
            onClick={() => window.browserApi.newSpace()}
            style={{
              ...iconButtonStyle,
              width: 'auto',
              padding: '0 8px',
              fontSize: 12,
            }}
          >
            + Space
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <PinButton pinned={state.sidebarPinned} />
      </div>

      {state.assistantChip && <AssistantChip chip={state.assistantChip} />}
      <div
        {...dnd.backgroundProps()}
        style={{ overflowY: 'auto', padding: '0 6px 12px', flex: 1 }}
      >
        {ungrouped.map((tab, i) => (
          <TabRow
            key={tab.id}
            tab={tab}
            nextId={ungrouped[i + 1]?.id ?? null}
            active={state.active?.kind === 'tab' && state.active.id === tab.id}
          />
        ))}
        {dnd.endSlot({ type: 'tab', spaceId: null, beforeId: null })}
        {looseArtifacts.map((a, i) => (
          <ArtifactRow
            key={`a${a.id}`}
            tab={a}
            nextId={looseArtifacts[i + 1]?.id ?? null}
            active={
              state.active?.kind === 'artifact' && state.active.id === a.id
            }
          />
        ))}
        {dnd.endSlot({ type: 'artifact', spaceId: null, beforeId: null })}
        {state.spaces.map((space, i) => (
          <SpaceGroup
            key={space.id}
            space={space}
            nextSpaceId={state.spaces[i + 1]?.id ?? null}
            tabs={state.tabs.filter(
              (tab) => tab.spaceId === space.id && !tab.closed,
            )}
            artifacts={state.artifactTabs.filter((a) => a.spaceId === space.id)}
            active={state.active}
            renameRequest={renameRequest}
            onRenameHandled={onRenameHandled}
          />
        ))}
        {dnd.endSlot({ type: 'space', beforeId: null })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Narrow icon strip (the collapsed sidebar)
// ---------------------------------------------------------------------------

function StripTab({ tab, active }: { tab: TabInfo; active: boolean }) {
  // In the strip a tab dropped on another goes just before it.
  const dnd = useDnd().itemProps(
    { kind: 'tab', id: tab.id },
    { spaceId: tab.spaceId, nextId: null },
    { halves: false },
  );
  return (
    <div
      {...dnd}
      role="button"
      tabIndex={0}
      aria-current={active || undefined}
      aria-label={
        tab.pending
          ? `${labelFor(tab)}: ${tab.pending.words.toLowerCase()}`
          : labelFor(tab)
      }
      onClick={() => {
        window.browserApi.selectTab(tab.id);
        seenTab(tab);
      }}
      onMouseLeave={() => seenTab(tab)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          seenTab(tab);
        }
      }}
      onKeyDown={(event) => {
        dnd.onKeyDown?.(event);
        if (!event.defaultPrevented) {
          rowKeys(() => window.browserApi.selectTab(tab.id))(event);
        }
      }}
      onContextMenu={showTabMenu(tab)}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        window.browserApi.closeTab(tab.id);
      }}
      title={
        tab.pending
          ? `${labelFor(tab)}: ${tab.pending.words.toLowerCase()}`
          : labelFor(tab)
      }
      style={{
        ...stripButton(active),
        ...(tab.pending ? { background: PENDING_TINT[tab.pending.kind] } : {}),
        opacity: tab.loaded ? 1 : 0.6,
        position: 'relative',
      }}
    >
      <Favicon tab={tab} />
      {tab.status && (
        <span style={{ position: 'absolute', top: 2, right: 2 }}>
          <StatusDot status={tab.status} />
        </span>
      )}
      {(tab.audible || tab.muted) && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            display: 'flex',
            color: 'var(--c-text-2)',
            background: 'var(--c-surface)',
            borderRadius: 4,
          }}
        >
          <Icon name={tab.muted ? 'volume-off' : 'volume'} />
        </span>
      )}
    </div>
  );
}

function StripArtifact({
  tab,
  active,
}: {
  tab: ArtifactTabInfo;
  active: boolean;
}) {
  const dnd = useDnd().itemProps(
    { kind: 'artifact', id: tab.id },
    { spaceId: tab.spaceId, nextId: null },
    { halves: false },
  );
  return (
    <div
      {...dnd}
      role="button"
      tabIndex={0}
      aria-current={active || undefined}
      aria-label={tab.title}
      onClick={() => window.browserApi.artifactSelect(tab.id)}
      onKeyDown={(event) => {
        dnd.onKeyDown?.(event);
        if (!event.defaultPrevented) {
          rowKeys(() => window.browserApi.artifactSelect(tab.id))(event);
        }
      }}
      title={tab.title}
      style={stripButton(active)}
    >
      <ItemEmoji emoji={tab.emoji} />
    </div>
  );
}

function StripSpace({
  space,
  nextSpaceId,
  tabs,
  artifacts,
  active,
}: {
  space: SpaceInfo;
  nextSpaceId: number | null;
  tabs: TabInfo[];
  artifacts: ArtifactTabInfo[];
  active: UiState['active'];
}) {
  const color = SPACE_COLOR_HEX[space.color];
  const leadActive = active?.kind === 'lead' && active.spaceId === space.id;
  const openMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    window.browserApi.showSpaceMenu(space.id, event.clientX, event.clientY);
  };
  // The Space's icon is a drop target: a tab dropped on it joins the Space.
  const { grip: _grip, ...spaceDnd } = useDnd().spaceProps(
    space.id,
    nextSpaceId,
  );
  const summary = spaceSummary(tabs.map((tab) => tab.status));
  const changes = countPending(tabs);

  return (
    <div
      style={{
        marginTop: 8,
        marginLeft: 3,
        borderLeft: `3px solid ${color}`,
        paddingLeft: 1,
      }}
    >
      <div
        {...spaceDnd}
        role="button"
        tabIndex={0}
        aria-current={leadActive || undefined}
        aria-label={`${space.name} overview`}
        onClick={() => window.browserApi.selectLead(space.id)}
        onKeyDown={(event) => {
          spaceDnd.onKeyDown?.(event);
          if (!event.defaultPrevented) {
            rowKeys(() => window.browserApi.selectLead(space.id))(event);
          }
        }}
        onContextMenu={openMenu}
        title={
          summary.working > 0
            ? `${space.name} overview: the assistant is working in ${summary.working} tab${summary.working === 1 ? '' : 's'}`
            : `${space.name} overview`
        }
        style={{ ...stripButton(leadActive), position: 'relative' }}
      >
        <SpaceIcon emoji={space.emoji} tint={color} />
        {summary.working > 0 && (
          <span
            className="badge ai"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              height: 14,
              minWidth: 14,
              padding: '0 3px',
              fontSize: 10,
              justifyContent: 'center',
            }}
          >
            {summary.working}
          </span>
        )}
      </div>
      {!space.collapsed &&
        tabs.map((tab) => (
          <StripTab
            key={tab.id}
            tab={tab}
            active={active?.kind === 'tab' && active.id === tab.id}
          />
        ))}
      {!space.collapsed &&
        artifacts.map((a) => (
          <StripArtifact
            key={`a${a.id}`}
            tab={a}
            active={active?.kind === 'artifact' && active.id === a.id}
          />
        ))}
      {space.collapsed && tabs.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Show ${tabs.length} hidden tab${tabs.length === 1 ? '' : 's'}${changes > 0 ? `; a waiting request would change ${changes}` : ''}`}
          onClick={() => window.browserApi.setSpaceCollapsed(space.id, false)}
          onKeyDown={rowKeys(() =>
            window.browserApi.setSpaceCollapsed(space.id, false),
          )}
          onContextMenu={openMenu}
          title={`${tabs.length} hidden tab${tabs.length === 1 ? '' : 's'}${changes > 0 ? `; a waiting request would change ${changes}` : ''}`}
          style={{
            ...stripButton(false),
            ...(changes > 0 ? { background: 'var(--c-warn-tint)' } : {}),
            fontSize: 11,
            color: 'var(--c-text-2)',
            position: 'relative',
          }}
        >
          {tabs.length}
          {summary.urgent !== null && (
            <span style={{ position: 'absolute', top: 2, right: 2 }}>
              <StatusDot status={summary.urgent} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Strip({ state }: { state: UiState }) {
  const ungrouped = state.tabs.filter((tab) => tab.spaceId === null);
  const dnd = useDnd();

  return (
    <>
      <div
        style={{
          height: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconButton
          icon="plus"
          label="New tab"
          title="New tab (Ctrl+T)"
          onClick={() => window.browserApi.newTab(null)}
        />
      </div>
      <div
        {...dnd.backgroundProps()}
        style={{ overflowY: 'hidden', flex: 1, paddingBottom: 12 }}
      >
        {ungrouped.map((tab) => (
          <StripTab
            key={tab.id}
            tab={tab}
            active={state.active?.kind === 'tab' && state.active.id === tab.id}
          />
        ))}
        {dnd.endSlot({ type: 'tab', spaceId: null, beforeId: null })}
        {state.artifactTabs
          .filter((a) => a.spaceId === null)
          .map((a) => (
            <StripArtifact
              key={`a${a.id}`}
              tab={a}
              active={
                state.active?.kind === 'artifact' && state.active.id === a.id
              }
            />
          ))}
        {dnd.endSlot({ type: 'artifact', spaceId: null, beforeId: null })}
        {state.spaces.map((space, i) => (
          <StripSpace
            key={space.id}
            space={space}
            nextSpaceId={state.spaces[i + 1]?.id ?? null}
            tabs={state.tabs.filter(
              (tab) => tab.spaceId === space.id && !tab.closed,
            )}
            artifacts={state.artifactTabs.filter((a) => a.spaceId === space.id)}
            active={state.active}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The sidebar page: opens when you rest the mouse on it, and can be dragged
// wider or narrower. It fills its own view, which the main process sizes and
// layers above the web pages.
// ---------------------------------------------------------------------------

const OPEN_DELAY_MS = 150;

// How wide is this page right now? The app resizes the sidebar's view (sliding
// it open or closed, or following a drag), so the page simply looks at its own
// width to decide whether to draw the full list or just icons.
function useViewWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function Sidebar({
  state,
  renameRequest,
  onRenameHandled,
  chatRenameRequest,
  onChatRenameHandled,
}: {
  state: UiState;
  renameRequest: number | null;
  onRenameHandled: () => void;
  // Set when "Rename chat" was chosen from a chat's right-click menu.
  chatRenameRequest: number | null;
  onChatRenameHandled: () => void;
}) {
  // With only the chat open, the tabs are not relevant: the left panel shows the
  // chat history instead.
  const chatOnly = state.viewMode === 'chat';
  const width = useViewWidth();
  const full = width >= SIDEBAR_FULL_MIN_WIDTH;
  const hoverTimer = useRef<number | undefined>(undefined);

  // Resting the mouse on the strip opens the sidebar after a short delay, so
  // just passing over it does not make it flicker. (Closing is decided by the
  // app, from how far the mouse has moved away.)
  const onMouseEnter = () => {
    if (state.sidebarPinned) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => window.browserApi.hoverSidebar(),
      OPEN_DELAY_MS,
    );
  };
  const onMouseLeave = () => window.clearTimeout(hoverTimer.current);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  return (
    <DndProvider api={window.browserApi}>
      <nav
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          // Same colour as the rest of the frame, so it reads as part of it.
          background: 'var(--c-frame)',
          // A shadow shows it floating over the page (when it is open but not pinned).
          boxShadow:
            full && !state.sidebarPinned
              ? '2px 0 8px rgba(0, 0, 0, 0.25)'
              : 'none',
          userSelect: 'none',
          overflow: 'hidden',
        }}
      >
        {chatOnly ? (
          full ? (
            <ChatList
              chats={state.chats}
              pinned={state.sidebarPinned}
              renameRequest={chatRenameRequest}
              onRenameHandled={onChatRenameHandled}
            />
          ) : (
            <ChatStrip chats={state.chats} />
          )
        ) : full ? (
          <FullSidebar
            state={state}
            renameRequest={renameRequest}
            onRenameHandled={onRenameHandled}
          />
        ) : (
          <Strip state={state} />
        )}
        <ResizeHandle
          kind="sidebar"
          axis="x"
          grows={1}
          measure={() => window.innerWidth}
          title="Drag to resize. Drag all the way left to collapse."
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 8,
          }}
        />
      </nav>
    </DndProvider>
  );
}
