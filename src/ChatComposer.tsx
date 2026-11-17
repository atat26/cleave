import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_LINKS, MAX_USER_CHARS } from './chats';
import type { LinkKind } from './chats';
import { onInsert } from './composerBus';
import { Banner, Button, IconButton } from './ui/controls';
import { Icon } from './ui/Icon';
import { LinkChips, LinkPicker, pickerItems } from './LinkChips';
import type { PickerItem } from './LinkChips';
import type { SkillInfo } from './skills';
import type {
  ArtifactInfo,
  ChatInfo,
  ChatRef,
  LlmInfo,
  SpaceInfo,
  TabInfo,
} from './types';

// The last part of a model name ("openai/gpt-4o" -> "gpt-4o") for the small chip.
const shortModel = (id: string) => id.split('/').pop() ?? id;

// ---- The message box -----------------------------------------------------------------
//
// The box is an editable area (not a plain text box) so that an "@name" can sit
// in it as a small pill. A pill is one piece: Backspace removes all of it, and
// double-clicking it turns it into ordinary text. When you send, each pill
// becomes its "@name" in the text and is sent along as a mention.

const MAX_TAG = 60;

// The pill for an item picked from the list.
function makePill(item: PickerItem): HTMLSpanElement {
  const tag = `${item.skill ? '/' : '@'}${item.label.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG)}`;
  const pill = document.createElement('span');
  pill.contentEditable = 'false';
  pill.dataset.kind = item.skill ? 'skill' : item.kind;
  pill.dataset.id = String(item.id);
  pill.dataset.tag = tag;
  pill.title = 'Double-click to turn into plain text';
  // The emoji is only for looking at: what is sent is the tag.
  pill.textContent = item.emoji ? `${item.emoji} ${tag}` : tag;
  Object.assign(pill.style, {
    display: 'inline-block',
    padding: '0 8px',
    margin: '0 1px',
    border: '1px solid var(--c-border)',
    background: 'var(--c-accent-tint)',
    color: 'var(--c-accent)',
    borderRadius: '10px',
    fontSize: '12px',
    lineHeight: '18px',
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    verticalAlign: 'bottom',
    cursor: 'default',
  });
  return pill;
}

// What the "/" list offers: the skills that are on, narrowed by the words typed after
// the "/" (in the name or the "when to use it" line).
const SKILL_ROWS = 8;
function skillItems(query: string, skills: SkillInfo[]): PickerItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return skills
    .filter(
      (s) =>
        s.enabled &&
        words.every((w) =>
          `${s.name} ${s.description}`.toLowerCase().includes(w),
        ),
    )
    .slice(0, SKILL_ROWS)
    .map((s) => ({
      key: `skill:${s.id}`,
      kind: 'artifact' as const,
      id: s.id,
      label: s.name,
      group: 'Skills' as const,
      favicon: null,
      color: null,
      emoji: '⚡',
      skill: true,
    }));
}

interface Typed {
  text: string;
  mentions: { kind: LinkKind; id: number; tag: string }[];
}

// What is in the box: the text (a pill counts as its "@name") and the pills.
function readBox(root: HTMLElement): Typed {
  const typed: Typed = { text: '', mentions: [] };
  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        typed.text += (node as Text).data.replace(/ /g, ' ');
      } else if (node instanceof HTMLElement) {
        const { kind, id, tag } = node.dataset;
        if (tag && kind === 'skill') {
          // A skill is named in the text ("/Name"); it is not a link.
          typed.text += tag;
        } else if (
          tag &&
          (kind === 'tab' || kind === 'space' || kind === 'artifact') &&
          id
        ) {
          typed.text += tag;
          typed.mentions.push({ kind, id: Number(id), tag });
        } else if (node.tagName === 'BR') {
          typed.text += '\n';
        } else {
          // A line the browser wrapped in its own block.
          if (typed.text !== '' && !typed.text.endsWith('\n'))
            typed.text += '\n';
          walk(node);
        }
      }
    }
  };
  walk(root);
  return typed;
}

// The box you type in, with the model chip and the Send / Stop button.
//
//   Enter sends, Shift+Enter adds a new line, Esc stops a reply being written.
//   Type "@" (or press "+" then "Add page") to attach a Space or tab to the chat.
//
// In the one-row (compact) chat bar, `before` and `after` hold the chat switcher
// and the expand / close buttons, so everything fits on one line.
export function ChatComposer({
  chat,
  llm,
  refs,
  tabs,
  spaces,
  artifacts,
  skills,
  activeTabId,
  compact,
  before,
  after,
  onSent,
  onNeedRoom,
}: {
  chat: ChatInfo;
  llm: LlmInfo;
  // The Spaces and tabs linked to this chat, and what exists to link.
  refs: ChatRef[];
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  artifacts: ArtifactInfo[];
  // The skills ("/" offers the ones that are on).
  skills: SkillInfo[];
  // The tab you are looking at (offered first in the list).
  activeTabId: number | null;
  // The one-row look (a single line, no growing).
  compact: boolean;
  before?: ReactNode;
  after?: ReactNode;
  // Called after a message is sent (the compact bar opens up to show the reply).
  onSent: () => void;
  // Called when the list needs more room than the one-row bar has.
  onNeedRoom: () => void;
}) {
  // A copy of the box's text, kept for the Send button and the placeholder.
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // The list: open while the text just before the cursor is "@" plus some
  // letters (`node` is where it is), or from the "+ Add page" button (no node,
  // nothing is typed into the box).
  const [picker, setPicker] = useState<{
    query: string;
    node: Text | null;
    start: number;
    // From the "+" menu: list only pages, only Spaces, or only artifacts.
    only?: 'page' | 'space' | 'artifact';
    // From "/": the list is of skills.
    mode?: 'skill';
  } | null>(null);
  const [pickerIndex, setPickerIndex] = useState(0);
  // Where the text box is on screen, and how much room there is above it inside
  // the chat (a web page is drawn over anything that reaches into it, so the list
  // has to stay within the chat).
  const [anchor, setAnchor] = useState({
    left: 0,
    top: 0,
    width: 300,
    room: 280,
  });

  const model = chat.model ?? llm.model;
  const setup = !llm.hasKey ? 'key' : model === null ? 'model' : null;
  const empty = text.trim() === '';

  const items: PickerItem[] = picker
    ? picker.mode === 'skill'
      ? skillItems(picker.query, skills)
      : pickerItems(
          picker.query,
          refs,
          tabs,
          spaces,
          artifacts,
          activeTabId,
          picker.node ? 8 : 30,
          picker.only,
        )
    : [];
  const index = Math.min(pickerIndex, Math.max(0, items.length - 1));

  const syncText = () => {
    if (box.current) setText(readBox(box.current).text);
  };

  // Measure the text box and the room above it. Returns the room.
  const placeAnchor = (): number => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return 0;
    const region = box.current?.closest('section')?.getBoundingClientRect();
    const room = region ? Math.floor(rect.top - region.top - 10) : 280;
    setAnchor((previous) =>
      previous.left === rect.left &&
      previous.top === rect.top &&
      previous.width === rect.width &&
      previous.room === room
        ? previous
        : { left: rect.left, top: rect.top, width: rect.width, room },
    );
    return room;
  };

  // While the list is open, follow the box as the chat slides or is resized.
  const listOpen = picker !== null;
  useEffect(() => {
    if (!listOpen) return;
    let frame = requestAnimationFrame(function follow() {
      placeAnchor();
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [listOpen]);

  // Open or close the "@" list from where the cursor is.
  const refreshPicker = () => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (
      !sel ||
      !sel.isCollapsed ||
      !node ||
      node.nodeType !== Node.TEXT_NODE ||
      !box.current?.contains(node)
    ) {
      setPicker(null);
      return;
    }
    const before = (node as Text).data.slice(0, sel.anchorOffset);
    const match = /(^|\s)@([^\s@]*)$/.exec(before);
    // "/" at the start of a word lists the skills that are on.
    const slash =
      match || !skills.some((s) => s.enabled)
        ? null
        : /(^|\s)\/([^\s/]*)$/.exec(before);
    if (!match && !slash) {
      setPicker(null);
      return;
    }
    const found = (match ?? slash) as RegExpExecArray;
    setPicker({
      query: found[2],
      node: node as Text,
      start: sel.anchorOffset - found[2].length - 1,
      mode: slash ? 'skill' : undefined,
    });
    setPickerIndex(0);
    // In the one-row bar there is no room above the box (the web page is there),
    // so the chat opens up to make room for the list.
    if (placeAnchor() < 140 && compact) onNeedRoom();
  };

  // Text from elsewhere (a selection from a web page) goes at the end of the box.
  useEffect(
    () =>
      onInsert((text) => {
        const root = box.current;
        if (!root) return;
        root.focus();
        root.append(
          document.createTextNode(root.textContent === '' ? text : ` ${text}`),
        );
        const caret = document.createRange();
        caret.selectNodeContents(root);
        caret.collapse(false);
        const selected = window.getSelection();
        selected?.removeAllRanges();
        selected?.addRange(caret);
        setText(readBox(root).text);
      }),
    [],
  );

  const openFromButton = (only: 'page' | 'space' | 'artifact') => {
    box.current?.focus();
    placeAnchor();
    setPickerIndex(0);
    setPicker({ query: '', node: null, start: 0, only });
  };
  // The "+" menu is a popup menu (made by the app); what it picks opens the list here.
  const openAdd = useRef(openFromButton);
  openAdd.current = openFromButton;
  useEffect(
    () =>
      window.browserApi.onComposerAdd((chatId, kind) => {
        if (chatId === chat.id) openAdd.current(kind);
      }),
    [chat.id],
  );

  // Choose something from the list: attach it to the chat. From "@", the typed
  // "@..." is swapped for a pill.
  const pick = (item: PickerItem) => {
    if (!picker) return;
    if (picker.node && box.current?.contains(picker.node)) {
      const range = document.createRange();
      range.setStart(picker.node, picker.start);
      range.setEnd(picker.node, picker.start + 1 + picker.query.length);
      range.deleteContents();
      const pill = makePill(item);
      range.insertNode(pill);
      const space = document.createTextNode(' ');
      pill.after(space);
      const caret = document.createRange();
      caret.setStart(space, 1);
      caret.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(caret);
      syncText();
    }
    setPicker(null);
    // A skill is named in the message; nothing is linked to the chat.
    if (item.skill) {
      setNotice('');
      box.current?.focus();
      return;
    }
    if (refs.length >= MAX_LINKS) {
      setNotice(
        `You can link up to ${MAX_LINKS} Spaces, tabs and artifacts to a chat. Remove one first.`,
      );
    } else {
      setNotice('');
      window.browserApi.chatLink(chat.id, item.kind, item.id);
    }
    box.current?.focus();
  };

  const send = async () => {
    const root = box.current;
    if (!root || sending || chat.generating) return;
    const typed = readBox(root);
    if (typed.text.trim() === '') return;
    if (typed.text.trim().length > MAX_USER_CHARS) {
      setNotice('That message is too long to send.');
      return;
    }
    setSending(true);
    setNotice('');
    const result = await window.browserApi.chatSend(
      chat.id,
      typed.text,
      typed.mentions,
    );
    setSending(false);
    if (result.ok) {
      root.innerHTML = '';
      setText('');
      setPicker(null);
      onSent();
    } else {
      setNotice(result.error);
    }
  };

  const stop = () => window.browserApi.chatStop(chat.id);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (picker !== null) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPicker(null);
        return;
      }
      if (items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setPickerIndex((i) => (i + 1) % items.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setPickerIndex((i) => (i - 1 + items.length) % items.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          pick(items[index]);
          return;
        }
      }
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (e.shiftKey) {
        document.execCommand('insertLineBreak');
        syncText();
      } else {
        void send();
      }
    } else if (e.key === 'Escape' && chat.generating) {
      stop();
    }
  };

  return (
    <div className="chat-foot">
      {setup !== null && (
        <div>
          <Banner
            tone="warn"
            actions={
              <Button
                size="sm"
                onClick={() => window.browserApi.openSettings()}
              >
                Open Settings
              </Button>
            }
          >
            {setup === 'key'
              ? 'Add your OpenRouter key in Settings to start chatting.'
              : 'Choose a model in Settings to start chatting.'}
          </Banner>
        </div>
      )}
      {refs.length > 0 && llm.activeModelSupportsTools === false && (
        <div>
          <Banner tone="warn">
            This model can't read pages, so it only sees the titles and
            addresses of your linked tabs. Pick another model to let it read
            them.
          </Banner>
        </div>
      )}
      {notice && (
        <div>
          <Banner tone="error">{notice}</Banner>
        </div>
      )}
      {/* The Add button and the linked things share ONE row (it scrolls sideways
          if there are many), so they never push the conversation out of view. */}
      {!compact && refs.length > 0 && (
        <div className="chips chips-row">
          <LinkChips
            chatId={chat.id}
            refs={refs}
            tabs={tabs}
            spaces={spaces}
            artifacts={artifacts}
          />
        </div>
      )}
      <div className="composer reveal-host">
        {before}
        {/* The "+" stays out of the way: the text starts at the left edge, and the
            button pops out when the pointer is on the left side of the bar (or the
            keyboard is on it). */}
        {!compact && (
          <span
            className="composer-add"
            onMouseDown={(event) => {
              // A click on the empty strip puts the cursor in the message box.
              if (event.target === event.currentTarget) {
                event.preventDefault();
                box.current?.focus();
              }
            }}
          >
            <IconButton
              icon="plus"
              size="sm"
              label="Add a page, Space, artifact or file to the chat"
              aria-haspopup="menu"
              // Keep the text box focused.
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                const edge = event.currentTarget.getBoundingClientRect();
                window.browserApi.showAddToChatMenu(
                  chat.id,
                  edge.left,
                  edge.top - 4,
                );
              }}
            />
          </span>
        )}
        {compact && refs.length > 0 && (
          <button
            type="button"
            className="model-chip"
            onClick={() => window.browserApi.toggleChat()}
            title="Open the chat to see what is linked"
          >
            {refs.length} link{refs.length === 1 ? '' : 's'}
          </button>
        )}
        <div
          className="composer-text"
          style={{ position: 'relative', flex: 1, minWidth: 0 }}
        >
          {empty && (
            <span aria-hidden="true" className="composer-hint">
              {skills.some((s) => s.enabled)
                ? 'Ask anything. @ links a tab, Space or artifact; / uses a skill'
                : 'Ask anything, or type @ to link a tab, Space or artifact'}
            </span>
          )}
          <div
            ref={box}
            role="textbox"
            aria-multiline="true"
            aria-label="Message"
            contentEditable
            suppressContentEditableWarning
            spellCheck
            onInput={() => {
              syncText();
              refreshPicker();
            }}
            onClick={refreshPicker}
            onContextMenu={(event) => {
              event.preventDefault();
              const selected = window.getSelection();
              window.browserApi.showEditMenu(
                'composer',
                event.clientX,
                event.clientY,
                selected !== null && !selected.isCollapsed,
              );
            }}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                refreshPicker();
              }
            }}
            // Closes the list when you click elsewhere in the chat, but not when the
            // whole window briefly loses the keyboard (for example while the chat
            // opens up).
            onBlur={() => {
              if (document.hasFocus()) setPicker(null);
            }}
            onKeyDown={onKeyDown}
            // Only plain text can be pasted or dropped in.
            onPaste={(e) => {
              e.preventDefault();
              // Pictures and files on the clipboard are attached to the chat.
              const files = Array.from(e.clipboardData.files);
              if (files.length > 0) {
                void window.browserApi.chatAttachFiles(chat.id, files);
                return;
              }
              document.execCommand(
                'insertText',
                false,
                e.clipboardData.getData('text/plain'),
              );
            }}
            onDrop={(e) => e.preventDefault()}
            // A pill becomes ordinary text when double-clicked.
            onDoubleClick={(e) => {
              const pill = (e.target as HTMLElement).closest?.('[data-tag]');
              if (pill && box.current?.contains(pill)) {
                pill.replaceWith(
                  document.createTextNode(
                    (pill as HTMLElement).dataset.tag ?? '',
                  ),
                );
                syncText();
              }
            }}
            className="composer-field"
            style={{
              maxHeight: compact ? 34 : 140,
              overflowY: compact ? 'hidden' : 'auto',
              whiteSpace: compact ? 'pre' : 'pre-wrap',
            }}
          />
        </div>
        <button
          type="button"
          className="model-chip"
          title={
            model ? `Using ${model}. Click to switch models.` : 'Choose a model'
          }
          aria-haspopup="menu"
          onClick={(event) => {
            if (!model) {
              window.browserApi.openSettings();
              return;
            }
            // Opens just above the chip (it moves itself if there is no room).
            const box = event.currentTarget.getBoundingClientRect();
            window.browserApi.showModelMenu(chat.id, box.left, box.top - 4);
          }}
        >
          <span className="truncate">
            {model ? shortModel(model) : 'Choose model'}
          </span>
          <Icon name="chev-d" />
        </button>
        {chat.generating ? (
          <Button size="sm" icon="stop" onClick={stop} title="Stop (Esc)">
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon="send"
            onClick={() => void send()}
            disabled={empty || sending}
            title="Send (Enter)"
          >
            Send
          </Button>
        )}
        {after}
      </div>
      {picker !== null && (
        <LinkPicker
          items={items}
          index={index}
          anchor={anchor}
          onPick={pick}
          onHover={setPickerIndex}
        />
      )}
    </div>
  );
}
