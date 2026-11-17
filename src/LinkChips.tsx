import { useState } from 'react';
import type { CSSProperties } from 'react';
import { resolveLink } from './chatLinks';
import type { Workspace } from './chatLinks';
import { SPACE_COLOR_HEX } from './colors';
import { labelFor } from './Sidebar';
import type { LinkKind, Mention } from './chats';
import type { ArtifactInfo, ChatRef, SpaceInfo, TabInfo } from './types';

// Linking Spaces and tabs to a chat. This file draws the link chips above the
// message box, the one-click "this page" chip, and the list that opens when you
// type "@". What the model is actually told about a link is worked out in
// chatLinks.ts (titles and cleaned addresses only).

// The Spaces and tabs in the shape the link helpers want.
export function toWorkspace(
  tabs: TabInfo[],
  spaces: SpaceInfo[],
  artifacts: ArtifactInfo[],
): Workspace {
  return {
    tabs: tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      spaceId: t.spaceId,
    })),
    spaces: spaces.map((s) => ({ id: s.id, name: s.name })),
    artifacts: artifacts.map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      spaceId: a.spaceId,
    })),
  };
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  maxWidth: 220,
  height: 'var(--h-pill)',
  boxSizing: 'border-box',
  padding: '0 4px 0 10px',
  border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-pill)',
  background: 'var(--c-surface-2)',
  fontSize: 'var(--fs-xs)',
  color: 'var(--c-text)',
};

const chipButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontSize: 12,
  cursor: 'pointer',
  color: 'inherit',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
};

const tinyButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: '0 4px',
  fontSize: 12,
  cursor: 'pointer',
  color: 'var(--c-text-2)',
  flexShrink: 0,
};

// A small round icon for a link: the site's icon, or the Space's colour.
function LinkIcon({
  kind,
  open,
  favicon,
  color,
  emoji,
}: {
  kind: LinkKind;
  open: boolean;
  favicon: string | null;
  color: string | null;
  // The picture of a Space or artifact (shown instead of a dot or page icon).
  emoji?: string | null;
}) {
  if (emoji && kind !== 'tab') {
    return (
      <span
        aria-hidden="true"
        style={{ fontSize: 12, flexShrink: 0, opacity: open ? 1 : 0.4 }}
      >
        {emoji}
      </span>
    );
  }
  if (kind === 'artifact') {
    return (
      <span
        aria-hidden="true"
        style={{ fontSize: 11, flexShrink: 0, opacity: open ? 1 : 0.4 }}
      >
        📄
      </span>
    );
  }
  if (kind === 'tab' && favicon && open) {
    return (
      <img
        src={favicon}
        alt=""
        width={14}
        height={14}
        style={{ flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: 10,
        height: 10,
        borderRadius: kind === 'space' ? 3 : 5,
        background: open ? (color ?? 'var(--c-text-3)') : 'var(--c-border)',
        flexShrink: 0,
      }}
    />
  );
}

// The chips for the Spaces and tabs linked to a chat. Click one to jump there;
// a closed tab offers Reopen; × removes the link.
export function LinkChips({
  chatId,
  refs,
  tabs,
  spaces,
  artifacts,
}: {
  chatId: number;
  refs: ChatRef[];
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  artifacts: ArtifactInfo[];
}) {
  if (refs.length === 0) return null;
  const workspace = toWorkspace(tabs, spaces, artifacts);

  // Just the chips: the row they sit in (with the Add button) is the caller's.
  return (
    <>
      {refs.map((ref) => {
        const link = resolveLink(ref, workspace);
        const tab =
          link.kind === 'tab' ? tabs.find((t) => t.id === link.id) : undefined;
        const space =
          link.kind === 'space'
            ? spaces.find((s) => s.id === link.id)
            : undefined;
        const artifact =
          link.kind === 'artifact'
            ? artifacts.find((a) => a.id === link.id)
            : undefined;
        const shared =
          link.kind === 'tab'
            ? `The assistant gets this title${link.address ? ' and address' : ''}, can read the page, and can act on it (click, type) only with your approval.`
            : link.kind === 'artifact'
              ? "The assistant gets this artifact's title and kind. Reading or changing its text comes with the artifact tools, and asks you first."
              : "The assistant gets this Space's name, its tabs' titles and addresses, and its artifacts' titles. It can read those pages, and act on them only with your approval.";
        const tip = [
          link.label,
          link.address,
          link.open
            ? shared
            : link.kind === 'artifact'
              ? 'Deleted. Nothing is shared for it.'
              : 'Closed. Nothing is shared for it.',
        ]
          .filter(Boolean)
          .join('\n');
        return (
          <span
            key={`${ref.kind}:${ref.id}`}
            className="reveal-host"
            title={tip}
            onContextMenu={(event) => {
              event.preventDefault();
              window.browserApi.showLinkMenu(
                chatId,
                link.kind,
                link.id,
                true,
                event.clientX,
                event.clientY,
              );
            }}
            style={{
              ...chipStyle,
              color: link.open ? 'var(--c-text)' : 'var(--c-text-3)',
              background: link.open ? 'var(--c-surface-2)' : 'transparent',
              borderStyle: link.open ? 'solid' : 'dashed',
            }}
          >
            <LinkIcon
              kind={link.kind}
              open={link.open}
              favicon={tab?.favicon ?? null}
              color={space ? SPACE_COLOR_HEX[space.color] : null}
              emoji={space?.emoji ?? artifact?.emoji}
            />
            <button
              type="button"
              disabled={!link.open}
              onClick={() => window.browserApi.chatOpenLink(link.kind, link.id)}
              style={{
                ...chipButton,
                cursor: link.open ? 'pointer' : 'default',
              }}
            >
              {link.label}
              {link.open
                ? ''
                : link.kind === 'artifact'
                  ? ' (deleted)'
                  : ' (closed)'}
            </button>
            {!link.open && link.kind === 'tab' && ref.url && (
              <button
                type="button"
                onClick={() =>
                  window.browserApi.chatReopenLink(chatId, link.id)
                }
                style={{ ...tinyButton, color: 'var(--c-accent)' }}
              >
                Reopen
              </button>
            )}
            <button
              type="button"
              className="reveal"
              aria-label={`Remove link to ${link.label}`}
              title="Remove this link"
              onClick={() =>
                window.browserApi.chatUnlink(chatId, link.kind, link.id)
              }
              style={tinyButton}
            >
              ×
            </button>
          </span>
        );
      })}
    </>
  );
}

// An "@name" in one of your sent messages, drawn as a small token. Click to jump
// there; if it has been closed it is greyed out and can be reopened. It keeps its
// own copy of the name and address, so it stays even if the link was removed.
export function MentionToken({
  chatId,
  mention,
  tabs,
  spaces,
  artifacts,
}: {
  chatId: number;
  mention: Mention;
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  artifacts: ArtifactInfo[];
}) {
  const link = resolveLink(mention, toWorkspace(tabs, spaces, artifacts));
  const tab =
    link.kind === 'tab' ? tabs.find((t) => t.id === link.id) : undefined;
  const space =
    link.kind === 'space' ? spaces.find((s) => s.id === link.id) : undefined;
  const artifact =
    link.kind === 'artifact'
      ? artifacts.find((a) => a.id === link.id)
      : undefined;
  return (
    <span
      onContextMenu={(event) => {
        event.preventDefault();
        window.browserApi.showLinkMenu(
          chatId,
          link.kind,
          link.id,
          false,
          event.clientX,
          event.clientY,
        );
      }}
      title={[link.label, link.address, link.open ? '' : 'Closed.']
        .filter(Boolean)
        .join('\n')}
      style={{
        ...chipStyle,
        padding: '1px 4px 1px 6px',
        verticalAlign: 'baseline',
        whiteSpace: 'nowrap',
        color: link.open ? 'var(--c-text)' : 'var(--c-text-3)',
        background: link.open ? 'var(--c-surface-2)' : 'transparent',
        borderStyle: link.open ? 'solid' : 'dashed',
      }}
    >
      <LinkIcon
        kind={link.kind}
        open={link.open}
        favicon={tab?.favicon ?? null}
        color={space ? SPACE_COLOR_HEX[space.color] : null}
        emoji={space?.emoji ?? artifact?.emoji}
      />
      <button
        type="button"
        disabled={!link.open}
        onClick={() => window.browserApi.chatOpenLink(link.kind, link.id)}
        style={{ ...chipButton, cursor: link.open ? 'pointer' : 'default' }}
      >
        {mention.tag || link.label}
        {link.open ? '' : link.kind === 'artifact' ? ' (deleted)' : ' (closed)'}
      </button>
      {!link.open && link.kind === 'tab' && mention.url && (
        <button
          type="button"
          onClick={() => window.browserApi.chatReopenLink(chatId, link.id)}
          style={{ ...tinyButton, color: 'var(--c-accent)' }}
        >
          Reopen
        </button>
      )}
    </span>
  );
}

// ---- The "@" list ----------------------------------------------------------------------

export interface PickerItem {
  key: string;
  kind: LinkKind;
  id: number;
  label: string;
  group: 'This page' | 'Spaces' | 'Tabs' | 'Artifacts' | 'Skills';
  // A skill (from "/"): it is named in the message, not linked to the chat.
  skill?: boolean;
  favicon: string | null;
  color: string | null;
  // The picture of a Space or artifact.
  emoji: string | null;
}

// What the "@" list offers: this page first, then Spaces, then tabs; anything
// already linked is left out; the text after "@" narrows it down.
export function pickerItems(
  query: string,
  refs: ChatRef[],
  tabs: TabInfo[],
  spaces: SpaceInfo[],
  artifacts: ArtifactInfo[],
  activeTabId: number | null,
  limit = 8,
  // Only pages, only Spaces, or only artifacts (from the "+" menu); "@" shows all.
  only?: 'page' | 'space' | 'artifact',
): PickerItem[] {
  const linked = (kind: LinkKind, id: number) =>
    refs.some((r) => r.kind === kind && r.id === id);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (label: string) =>
    words.every((w) => label.toLowerCase().includes(w));

  const items: PickerItem[] = [];
  const active = tabs.find((t) => t.id === activeTabId);
  if (
    (only === undefined || only === 'page') &&
    active &&
    !linked('tab', active.id) &&
    matches(`this page ${labelFor(active)}`)
  ) {
    items.push({
      key: `page:${active.id}`,
      kind: 'tab',
      id: active.id,
      label: labelFor(active),
      group: 'This page',
      favicon: active.favicon,
      color: null,
      emoji: null,
    });
  }
  for (const space of only === undefined || only === 'space' ? spaces : []) {
    if (linked('space', space.id) || !matches(space.name)) continue;
    items.push({
      key: `space:${space.id}`,
      kind: 'space',
      id: space.id,
      label: space.name,
      group: 'Spaces',
      favicon: null,
      color: SPACE_COLOR_HEX[space.color],
      emoji: space.emoji,
    });
  }
  for (const tab of only === undefined || only === 'page' ? tabs : []) {
    if (
      tab.id === active?.id ||
      tab.closed ||
      linked('tab', tab.id) ||
      !matches(labelFor(tab))
    )
      continue;
    items.push({
      key: `tab:${tab.id}`,
      kind: 'tab',
      id: tab.id,
      label: labelFor(tab),
      group: 'Tabs',
      favicon: tab.favicon,
      color: null,
      emoji: null,
    });
  }
  for (const artifact of only === undefined || only === 'artifact'
    ? artifacts
    : []) {
    if (linked('artifact', artifact.id) || !matches(artifact.title)) continue;
    items.push({
      key: `artifact:${artifact.id}`,
      kind: 'artifact',
      id: artifact.id,
      label: artifact.title,
      group: 'Artifacts',
      favicon: null,
      color: null,
      emoji: artifact.emoji,
    });
  }
  return items.slice(0, limit);
}

// The list that opens above the message box when you type "@". It sits at a fixed
// place on the screen so the chat's rounded edge cannot clip it. Mouse presses
// are caught before the text box loses focus, so you can keep typing.
export function LinkPicker({
  items,
  index,
  anchor,
  onPick,
  onHover,
}: {
  items: PickerItem[];
  index: number;
  // Where the text box is on screen. With `below` (the box's bottom edge), the list
  // opens under the box instead of above it.
  anchor: {
    left: number;
    top: number;
    width: number;
    room: number;
    below?: number;
  };
  onPick: (item: PickerItem) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Link a Space, tab or artifact"
      className="pick-list"
      style={{
        left: anchor.left,
        ...(anchor.below !== undefined
          ? { top: anchor.below + 6 }
          : { bottom: window.innerHeight - anchor.top + 6 }),
        width: Math.min(360, Math.max(240, anchor.width)),
        // Never taller than the room inside the chat: anything above it would be
        // hidden behind the web page.
        maxHeight: Math.max(60, Math.min(280, anchor.room)),
      }}
    >
      {items.length === 0 ? (
        <div className="pick-empty">
          Nothing matches. Open tabs, Spaces and artifacts you have not linked
          yet appear here.
        </div>
      ) : (
        items.map((item, i) => (
          <div key={item.key}>
            {(i === 0 || items[i - 1].group !== item.group) && (
              <div className="pick-group">{item.group}</div>
            )}
            <button
              type="button"
              role="option"
              aria-selected={i === index}
              onMouseDown={(e) => {
                e.preventDefault(); // Keep typing in the box.
                onPick(item);
              }}
              onMouseEnter={() => onHover(i)}
              className="pick-item"
            >
              <LinkIcon
                kind={item.kind}
                open
                favicon={item.favicon}
                color={item.color}
                emoji={item.emoji}
              />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </span>
            </button>
          </div>
        ))
      )}
    </div>
  );
}
