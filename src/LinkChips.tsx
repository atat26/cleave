import type { CSSProperties } from 'react';
import { resolveLink } from './chatLinks';
import type { Workspace } from './chatLinks';
import { SPACE_COLOR_HEX } from './colors';
import { labelFor } from './Sidebar';
import type { Mention } from './chats';
import type { ChatRef, SpaceInfo, TabInfo } from './types';

// Linking Spaces and tabs to a chat. This file draws the link chips above the
// message box, the one-click "this page" chip, and the list that opens when you
// type "@". What the model is actually told about a link is worked out in
// chatLinks.ts (titles and cleaned addresses only).

// The Spaces and tabs in the shape the link helpers want.
export function toWorkspace(tabs: TabInfo[], spaces: SpaceInfo[]): Workspace {
  return {
    tabs: tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      spaceId: t.spaceId,
    })),
    spaces: spaces.map((s) => ({ id: s.id, name: s.name })),
  };
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  maxWidth: 220,
  padding: '3px 4px 3px 8px',
  border: '1px solid #d0d0d0',
  borderRadius: 14,
  background: '#ffffff',
  fontSize: 12,
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
  color: '#5f6368',
  flexShrink: 0,
};

// A small round icon for a link: the site's icon, or the Space's colour.
function LinkIcon({
  kind,
  open,
  favicon,
  color,
}: {
  kind: 'tab' | 'space';
  open: boolean;
  favicon: string | null;
  color: string | null;
}) {
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
        background: open ? (color ?? '#9aa0a6') : '#dadce0',
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
}: {
  chatId: number;
  refs: ChatRef[];
  tabs: TabInfo[];
  spaces: SpaceInfo[];
}) {
  if (refs.length === 0) return null;
  const workspace = toWorkspace(tabs, spaces);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
        margin: '0 0 6px',
      }}
    >
      {refs.map((ref) => {
        const link = resolveLink(ref, workspace);
        const tab =
          link.kind === 'tab' ? tabs.find((t) => t.id === link.id) : undefined;
        const space =
          link.kind === 'space'
            ? spaces.find((s) => s.id === link.id)
            : undefined;
        const shared =
          link.kind === 'tab'
            ? `The assistant gets this title${link.address ? ' and address' : ''}, can read the page, and can act on it (click, type) only with your approval.`
            : "The assistant gets this Space's name and its tabs' titles and addresses, can read those pages, and can act on them only with your approval.";
        const tip = [
          link.label,
          link.address,
          link.open ? shared : 'Closed. Nothing is shared for it.',
        ]
          .filter(Boolean)
          .join('\n');
        return (
          <span
            key={`${ref.kind}:${ref.id}`}
            title={tip}
            style={{
              ...chipStyle,
              color: link.open ? '#202124' : '#80868b',
              background: link.open ? '#ffffff' : '#f8f9fa',
            }}
          >
            <LinkIcon
              kind={link.kind}
              open={link.open}
              favicon={tab?.favicon ?? null}
              color={space ? SPACE_COLOR_HEX[space.color] : null}
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
              {link.open ? '' : ' (closed)'}
            </button>
            {!link.open && link.kind === 'tab' && ref.url && (
              <button
                type="button"
                onClick={() =>
                  window.browserApi.chatReopenLink(chatId, link.id)
                }
                style={{ ...tinyButton, color: '#1a73e8' }}
              >
                Reopen
              </button>
            )}
            <button
              type="button"
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
      <span style={{ fontSize: 11, color: '#5f6368' }}>
        The assistant can read these pages, and act on them with your approval.
      </span>
    </div>
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
}: {
  chatId: number;
  mention: Mention;
  tabs: TabInfo[];
  spaces: SpaceInfo[];
}) {
  const link = resolveLink(mention, toWorkspace(tabs, spaces));
  const tab =
    link.kind === 'tab' ? tabs.find((t) => t.id === link.id) : undefined;
  const space =
    link.kind === 'space' ? spaces.find((s) => s.id === link.id) : undefined;
  return (
    <span
      title={[link.label, link.address, link.open ? '' : 'Closed.']
        .filter(Boolean)
        .join('\n')}
      style={{
        ...chipStyle,
        padding: '1px 4px 1px 6px',
        verticalAlign: 'baseline',
        whiteSpace: 'nowrap',
        color: link.open ? '#202124' : '#80868b',
        background: link.open ? '#ffffff' : '#f8f9fa',
      }}
    >
      <LinkIcon
        kind={link.kind}
        open={link.open}
        favicon={tab?.favicon ?? null}
        color={space ? SPACE_COLOR_HEX[space.color] : null}
      />
      <button
        type="button"
        disabled={!link.open}
        onClick={() => window.browserApi.chatOpenLink(link.kind, link.id)}
        style={{ ...chipButton, cursor: link.open ? 'pointer' : 'default' }}
      >
        {mention.tag || link.label}
        {link.open ? '' : ' (closed)'}
      </button>
      {!link.open && link.kind === 'tab' && mention.url && (
        <button
          type="button"
          onClick={() => window.browserApi.chatReopenLink(chatId, link.id)}
          style={{ ...tinyButton, color: '#1a73e8' }}
        >
          Reopen
        </button>
      )}
    </span>
  );
}

// "+ Add page": opens the same list as typing "@", but only attaches the page
// (it adds nothing to your text).
export function AddPageButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ margin: '0 0 6px' }}>
      <button
        type="button"
        // Keep the text box focused, so the list's arrow keys work.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        title="Attach a tab or Space to the chat (the assistant can read it, and act on it with your approval)"
        style={{
          ...chipStyle,
          padding: '3px 10px',
          cursor: 'pointer',
          color: '#1a73e8',
          borderColor: '#c6dafc',
        }}
      >
        + Add page
      </button>
    </div>
  );
}

// ---- The "@" list ----------------------------------------------------------------------

export interface PickerItem {
  key: string;
  kind: 'tab' | 'space';
  id: number;
  label: string;
  group: 'This page' | 'Spaces' | 'Tabs';
  favicon: string | null;
  color: string | null;
}

// What the "@" list offers: this page first, then Spaces, then tabs; anything
// already linked is left out; the text after "@" narrows it down.
export function pickerItems(
  query: string,
  refs: ChatRef[],
  tabs: TabInfo[],
  spaces: SpaceInfo[],
  activeTabId: number | null,
  limit = 8,
): PickerItem[] {
  const linked = (kind: 'tab' | 'space', id: number) =>
    refs.some((r) => r.kind === kind && r.id === id);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (label: string) =>
    words.every((w) => label.toLowerCase().includes(w));

  const items: PickerItem[] = [];
  const active = tabs.find((t) => t.id === activeTabId);
  if (
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
    });
  }
  for (const space of spaces) {
    if (linked('space', space.id) || !matches(space.name)) continue;
    items.push({
      key: `space:${space.id}`,
      kind: 'space',
      id: space.id,
      label: space.name,
      group: 'Spaces',
      favicon: null,
      color: SPACE_COLOR_HEX[space.color],
    });
  }
  for (const tab of tabs) {
    if (
      tab.id === active?.id ||
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
  // Where the text box is on screen.
  anchor: { left: number; top: number; width: number; room: number };
  onPick: (item: PickerItem) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Link a Space or tab"
      style={{
        position: 'fixed',
        left: anchor.left,
        bottom: window.innerHeight - anchor.top + 6,
        width: Math.min(360, Math.max(240, anchor.width)),
        // Never taller than the room inside the chat: anything above it would be
        // hidden behind the web page.
        maxHeight: Math.max(60, Math.min(280, anchor.room)),
        overflowY: 'auto',
        background: '#ffffff',
        border: '1px solid #d0d0d0',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
        zIndex: 100,
        padding: 4,
      }}
    >
      {items.length === 0 ? (
        <div style={{ padding: '8px 10px', fontSize: 12, color: '#5f6368' }}>
          Nothing matches. Open tabs and Spaces you have not linked yet appear
          here.
        </div>
      ) : (
        items.map((item, i) => (
          <div key={item.key}>
            {(i === 0 || items[i - 1].group !== item.group) && (
              <div
                style={{
                  padding: '6px 8px 2px',
                  fontSize: 11,
                  color: '#5f6368',
                  fontWeight: 600,
                }}
              >
                {item.group}
              </div>
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 8px',
                border: 'none',
                borderRadius: 6,
                background: i === index ? '#e8f0fe' : 'transparent',
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <LinkIcon
                kind={item.kind}
                open
                favicon={item.favicon}
                color={item.color}
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
