import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MAX_LINKS, MAX_USER_CHARS } from './chats';
import type { LinkKind } from './chats';
import { onInsert } from './composerBus';
import { AddMenuButton, LinkChips, LinkPicker, pickerItems } from './LinkChips';
import type { PickerItem } from './LinkChips';
import type {
  ArtifactInfo,
  ChatInfo,
  ChatRef,
  LlmInfo,
  SpaceInfo,
  TabInfo,
} from './types';

const chipStyle: CSSProperties = {
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  borderRadius: 14,
  fontSize: 12,
  padding: '4px 10px',
  cursor: 'pointer',
  color: '#202124',
  maxWidth: 140,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

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
  const tag = `@${item.label.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG)}`;
  const pill = document.createElement('span');
  pill.contentEditable = 'false';
  pill.dataset.kind = item.kind;
  pill.dataset.id = String(item.id);
  pill.dataset.tag = tag;
  pill.title = 'Double-click to turn into plain text';
  pill.textContent = tag;
  Object.assign(pill.style, {
    display: 'inline-block',
    padding: '0 8px',
    margin: '0 1px',
    border: '1px solid #c6dafc',
    background: '#e8f0fe',
    color: '#1a56c4',
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
        if (
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
    // From the "+" menu: list only pages (and Spaces), or only artifacts.
    only?: 'page' | 'artifact';
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
    ? pickerItems(
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
    if (!match) {
      setPicker(null);
      return;
    }
    setPicker({
      query: match[2],
      node: node as Text,
      start: sel.anchorOffset - match[2].length - 1,
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

  const openFromButton = (only: 'page' | 'artifact') => {
    box.current?.focus();
    placeAnchor();
    setPickerIndex(0);
    setPicker({ query: '', node: null, start: 0, only });
  };

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
    <div>
      {setup !== null && (
        <div
          style={{
            margin: '0 0 6px',
            padding: '6px 10px',
            background: '#fef7e0',
            borderRadius: 8,
            fontSize: 12,
            color: '#5f6368',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>
            {setup === 'key'
              ? 'Add your OpenRouter key in Settings to start chatting.'
              : 'Choose a model in Settings to start chatting.'}
          </span>
          <button
            type="button"
            onClick={() => window.browserApi.openSettings()}
            style={{ ...chipStyle, maxWidth: 'none' }}
          >
            Open Settings
          </button>
        </div>
      )}
      {refs.length > 0 && llm.activeModelSupportsTools === false && (
        <div
          style={{
            margin: '0 0 6px',
            padding: '6px 10px',
            background: '#fef7e0',
            borderRadius: 8,
            fontSize: 12,
            color: '#5f6368',
          }}
        >
          This model can't read pages, so it only sees the titles and addresses
          of your linked tabs. Pick another model to let it read them.
        </div>
      )}
      {notice && (
        <div
          role="alert"
          style={{ margin: '0 0 6px', fontSize: 12, color: '#b3261e' }}
        >
          {notice}
        </div>
      )}
      {!compact && (
        <>
          <LinkChips
            chatId={chat.id}
            refs={refs}
            tabs={tabs}
            spaces={spaces}
            artifacts={artifacts}
          />
          <AddMenuButton
            onAddPage={() => openFromButton('page')}
            onAddArtifact={() => openFromButton('artifact')}
          />
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        {before}
        {compact && refs.length > 0 && (
          <button
            type="button"
            onClick={() => window.browserApi.toggleChat()}
            title="Open the chat to see what is linked"
            style={chipStyle}
          >
            {refs.length} link{refs.length === 1 ? '' : 's'}
          </button>
        )}
        <button
          type="button"
          title={
            model ? `Using ${model}. Click to switch models.` : 'Choose a model'
          }
          onClick={(event) => {
            if (!model) {
              window.browserApi.openSettings();
              return;
            }
            // Opens just above the chip (it moves itself if there is no room).
            const box = event.currentTarget.getBoundingClientRect();
            window.browserApi.showModelMenu(chat.id, box.left, box.top - 4);
          }}
          style={chipStyle}
        >
          {model ? shortModel(model) : 'Choose model'}
        </button>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {empty && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 15,
                right: 14,
                top: 7,
                fontSize: 13,
                lineHeight: '18px',
                color: '#9aa0a6',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Ask anything, or type @ to link a tab or Space
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
            style={{
              boxSizing: 'border-box',
              minHeight: 32,
              maxHeight: compact ? 32 : 140,
              overflowY: compact ? 'hidden' : 'auto',
              padding: '6px 14px',
              border: '1px solid #d0d0d0',
              borderRadius: 16,
              fontSize: 13,
              lineHeight: '18px',
              background: '#ffffff',
              outline: 'none',
              whiteSpace: compact ? 'pre' : 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          />
        </div>
        {chat.generating ? (
          <button
            type="button"
            onClick={stop}
            title="Stop (Esc)"
            style={{
              ...chipStyle,
              background: '#3c4043',
              color: '#ffffff',
              border: 'none',
              height: 32,
            }}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void send()}
            disabled={empty || sending}
            title="Send (Enter)"
            style={{
              ...chipStyle,
              height: 32,
              background: empty ? '#f1f3f4' : '#1a73e8',
              color: empty ? '#9aa0a6' : '#ffffff',
              border: 'none',
              cursor: empty ? 'default' : 'pointer',
            }}
          >
            Send
          </button>
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
