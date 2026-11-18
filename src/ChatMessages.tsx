import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { MentionToken } from './LinkChips';
import { Markdown } from './MarkdownView';
import { Badge, Banner, Button, Textarea } from './ui/controls';
import { Icon } from './ui/Icon';
import { errorMessage } from './openrouter';
import { blocksOf, stepView } from './runModel';
import { ApprovalCard, StepGroup, StepRow } from './StepList';
import type {
  ArtifactInfo,
  ChatMessage,
  MessagePart,
  SpaceInfo,
  TabInfo,
} from './types';

// ---- Getting a chat's messages ----------------------------------------------------

const byId = (a: ChatMessage, b: ChatMessage) => a.id - b.id;

// Add a message, or replace the one with the same id.
function upsert(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = list.findIndex((m) => m.id === message.id);
  if (index === -1) return [...list, message].sort(byId);
  const next = list.slice();
  next[index] = message;
  return next;
}

// The messages of one chat: loaded when the chat opens, then kept up to date as
// replies stream in. (Messages live in the app; this is only a view of them.)
export function useChatMessages(chatId: number): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    void window.browserApi.chatMessages(chatId).then((loaded) => {
      if (cancelled) return;
      // A piece of a reply may have arrived while this was loading. Where both
      // have the same message, keep the one with more text.
      setMessages((current) => {
        const merged = new Map(loaded.map((m) => [m.id, m]));
        for (const m of current) {
          const other = merged.get(m.id);
          if (!other || m.content.length >= other.content.length)
            merged.set(m.id, m);
        }
        return [...merged.values()].sort(byId);
      });
    });
    const unsubscribe = window.browserApi.onChatMessage((event) => {
      if (event.chatId === chatId)
        setMessages((current) => upsert(current, event.message));
    });
    // Some messages were removed (a past prompt was retried): load them again.
    const unsubscribeReset = window.browserApi.onChatReset((resetId) => {
      if (resetId !== chatId) return;
      void window.browserApi.chatMessages(chatId).then((loaded) => {
        if (!cancelled) setMessages(loaded);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeReset();
    };
  }, [chatId]);

  return messages;
}

// ---- Showing them -------------------------------------------------------------------

const muted: CSSProperties = { color: 'var(--c-text-2)', fontSize: 12 };

// "12 tokens · $0.0021" (or "free"), as far as the provider told us.
function usageText(message: ChatMessage): string {
  const parts: string[] = [];
  if (message.model) parts.push(message.model);
  const usage = message.usage;
  if (usage?.totalTokens != null) {
    const tokens = usage.totalTokens;
    parts.push(
      `${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} tokens`,
    );
  }
  if (usage?.cost != null) {
    parts.push(
      usage.cost === 0
        ? 'free'
        : `$${usage.cost.toFixed(usage.cost < 0.01 ? 4 : 3)}`,
    );
  }
  return parts.join(' · ');
}

// A reply that failed: what went wrong (our own wording), with a way to fix it.
function FailedReply({
  message,
  isLast,
  chatId,
}: {
  message: ChatMessage;
  isLast: boolean;
  chatId: number;
}) {
  const kind = message.errorKind ?? 'unknown';
  const [note, setNote] = useState('');
  const needsSettings =
    kind === 'auth' || kind === 'credit' || kind === 'bad-request';

  const retry = async () => {
    setNote('');
    const result = await window.browserApi.chatRetry(chatId);
    if (!result.ok) setNote(result.error);
  };

  return (
    <div style={{ marginTop: 6 }}>
      <Banner
        tone="error"
        actions={
          <>
            {isLast && (
              <Button size="sm" onClick={() => void retry()}>
                Try again
              </Button>
            )}
            {needsSettings && (
              <Button
                size="sm"
                onClick={() => window.browserApi.openSettings()}
              >
                Open Settings
              </Button>
            )}
            {note && <span style={muted}>{note}</span>}
          </>
        }
      >
        {errorMessage(kind)}
      </Banner>
    </div>
  );
}

// Buttons the assistant offered. Clicking one sends its text as your reply. They
// are drawn here from plain text: the assistant cannot send anything that runs.
function ChoiceButtons({
  chatId,
  question,
  options,
  busy,
}: {
  chatId: number;
  question: string;
  options: string[];
  // A reply is being written, so nothing can be sent right now.
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  const choose = async (option: string) => {
    setNote('');
    const result = await window.browserApi.chatSend(chatId, option, []);
    if (!result.ok) setNote(result.error);
  };
  return (
    <div style={{ margin: '4px 0 8px' }}>
      {question !== '' && (
        <div style={{ ...muted, margin: '0 0 4px' }}>{question}</div>
      )}
      <div className="choices">
        {options.map((option) => (
          <Button
            key={option}
            disabled={busy}
            title="Send this as your reply"
            onClick={() => void choose(option)}
            style={{ textAlign: 'left', overflowWrap: 'anywhere' }}
          >
            {option}
          </Button>
        ))}
      </div>
      {note && (
        <div style={{ ...muted, color: 'var(--c-danger)', marginTop: 4 }}>
          {note}
        </div>
      )}
    </div>
  );
}

// A small spinner, on the left of whatever the assistant is doing right now.
function ActiveRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span
        className="spinner"
        role="img"
        aria-label="Working"
        style={{ marginTop: 4 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

// One stretch of the model's thinking, in a block you can open. While the model
// is still thinking (this is the newest part of a reply being written) it is
// labelled "Thinking…" and shows its text live if open; afterwards it is the
// "Thought process". It is collapsed by default. (Some models, such as Claude,
// send a short summary of their thinking rather than all of it.)
function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // While it streams, an open block follows the newest thinking.
  useLayoutEffect(() => {
    const el = box.current;
    if (open && live && el) el.scrollTop = el.scrollHeight;
  }, [open, live, text]);

  return (
    <div className="think">
      <button
        type="button"
        className="think-summary"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Hide the thinking' : 'Show the thinking'}
      >
        <Icon name={open ? 'chev-d' : 'chev-r'} />
        {live ? 'Thinking…' : 'Thought process'}
      </button>
      {open && (
        <div ref={box} className="think-body">
          {text}
        </div>
      )}
    </div>
  );
}

// The arguments a tool was called with, exactly as the model wrote them, laid out
// readably when they are valid JSON.
function showArguments(raw: string): string {
  if (raw.trim() === '') return '(none)';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

// The icon that says how a tool call went (shape as well as colour).
const STATUS_ICON = {
  running: 'spinner',
  waiting: 'clock',
  ok: 'check',
  declined: 'ban',
  error: 'circle-x',
} as const;

// A tool the assistant used, in its place in the reply. The line says what it did;
// open it to see exactly what was called (the tool and its arguments) and how it
// ended. What a page said is not kept, only what was called.
function ToolBlock({
  part,
  chatId,
  messageId,
  messageStatus,
  tabs,
  isNewestReply,
  busy,
}: {
  part: ToolPart;
  chatId: number;
  messageId: number;
  messageStatus: ChatMessage['status'];
  tabs: TabInfo[];
  isNewestReply: boolean;
  busy: boolean;
}) {
  // Waiting for you: the approval card.
  if (part.status === 'waiting') {
    return (
      <ApprovalCard
        part={part}
        chatId={chatId}
        messageId={messageId}
        tabs={tabs}
      />
    );
  }

  return (
    <StepRow
      step={stepView(part, messageStatus)}
      chatId={chatId}
      messageId={messageId}
      tabs={tabs}
      isNewestReply={isNewestReply}
      busy={busy}
    />
  );
}

// One message. Everything is drawn as plain text: a model's reply is never turned
// into markup, so it cannot do anything but be read. (Richer content, such as
// buttons or diagrams, will come later in a safe, sandboxed form.)
// Your message text, with each "@name" you picked drawn as a small token.
function withTokens(
  message: ChatMessage,
  chatId: number,
  tabs: TabInfo[],
  spaces: SpaceInfo[],
  artifacts: ArtifactInfo[],
) {
  const tags = message.mentions
    .map((m) => m.tag)
    .filter((t) => t !== '')
    .sort((a, b) => b.length - a.length);
  if (tags.length === 0) return message.content;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = message.content.split(
    new RegExp(`(${tags.map(escape).join('|')})`),
  );
  return parts.map((part, i) => {
    const mention = message.mentions.find((m) => m.tag === part);
    return mention ? (
      <MentionToken
        key={i}
        chatId={chatId}
        mention={mention}
        tabs={tabs}
        spaces={spaces}
        artifacts={artifacts}
      />
    ) : (
      part
    );
  });
}

function MessageView({
  message,
  isLast,
  isNewestUser,
  busy,
  chatId,
  tabs,
  spaces,
  artifacts,
}: {
  message: ChatMessage;
  isLast: boolean;
  // Is this your newest message? (Only that one can be retried.)
  isNewestUser: boolean;
  // A reply is being written in this chat right now.
  busy: boolean;
  chatId: number;
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  artifacts: ArtifactInfo[];
}) {
  const [retryNote, setRetryNote] = useState('');
  const retry = async () => {
    setRetryNote('');
    const result = await window.browserApi.chatRetry(chatId, message.id);
    if (!result.ok) setRetryNote(result.error);
  };
  // An older message: start a new chat from it instead of changing this one.
  const branch = async () => {
    setRetryNote('');
    const result = await window.browserApi.chatBranch(chatId, message.id);
    if (!result.ok) setRetryNote(result.error);
  };
  // Change this message and send it again. Your newest message is changed where it
  // is; an older one is changed in a new chat (this chat stays as it was).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const startEdit = () => {
    setRetryNote('');
    setDraft(message.content);
    setEditing(true);
  };
  const saveEdit = async () => {
    const result = await window.browserApi.chatEdit(chatId, message.id, draft);
    if (result.ok) setEditing(false);
    else setRetryNote(result.error);
  };
  // Retry, Edit or Branch chosen from this message's right-click menu: do it here, so
  // the result (or an error) shows the same way as from the buttons.
  const doAction = useRef<(action: 'retry' | 'branch' | 'edit') => void>(
    () => {},
  );
  doAction.current = (action) =>
    action === 'edit'
      ? startEdit()
      : void (action === 'retry' ? retry() : branch());
  useEffect(
    () =>
      window.browserApi.onMessageAction((chosen) => {
        if (chosen.chatId === chatId && chosen.messageId === message.id) {
          doAction.current(chosen.action);
        }
      }),
    [chatId, message.id],
  );
  const openMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    // Only text selected inside this message counts.
    const selected = window.getSelection();
    const inside =
      selected !== null &&
      !selected.isCollapsed &&
      selected.anchorNode !== null &&
      event.currentTarget.contains(selected.anchorNode);
    window.browserApi.showMessageMenu(
      chatId,
      message.id,
      event.clientX,
      event.clientY,
      inside ? selected.toString() : '',
    );
  };
  if (message.role === 'user') {
    // Pages attached without an "@name" (the Add page button) sit under the text.
    const attached = message.mentions.filter((m) => m.tag === '');
    return (
      <div
        className="msg-wrap"
        onContextMenu={openMenu}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          margin: '10px 0',
        }}
      >
        {editing ? (
          <div className="msg-edit">
            <Textarea
              autoFocus
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              value={draft}
              aria-label="Edit your message"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) =>
                e.currentTarget.setSelectionRange(draft.length, draft.length)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === 'Escape') {
                  setEditing(false);
                  setRetryNote('');
                }
              }}
            />
            <div className="msg-edit-row">
              {retryNote && (
                <span style={{ color: 'var(--c-danger)' }}>{retryNote}</span>
              )}
              <span style={{ flex: 1 }} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setRetryNote('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={draft.trim() === ''}
                title={
                  isNewestUser
                    ? 'Send this instead. The reply is written again.'
                    : 'Send this in a new chat that starts from before this message. This chat stays as it is.'
                }
                onClick={() => void saveEdit()}
              >
                {isNewestUser ? 'Resend' : 'Resend in a new chat'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="msg-user">
            {withTokens(message, chatId, tabs, spaces, artifacts)}
          </div>
        )}
        <div className="msg-actions">
          {!editing && retryNote && (
            <span style={{ color: 'var(--c-danger)' }}>{retryNote}</span>
          )}
          {!(isNewestUser && busy) && (
            <Button
              variant="ghost"
              size="sm"
              icon="pencil"
              title={
                isNewestUser
                  ? 'Change this message and send it again'
                  : 'Change this message and send it in a new chat'
              }
              onClick={startEdit}
            >
              Edit
            </Button>
          )}
          {isNewestUser && !busy && (
            <Button
              variant="ghost"
              size="sm"
              icon="retry"
              title="Ask this again and replace the reply"
              onClick={() => void retry()}
            >
              Retry
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon="branch"
            title="Start a new chat from here (this message and its reply). This chat stays as it is."
            onClick={() => void branch()}
          >
            Branch
          </Button>
        </div>
        {attached.length > 0 && (
          <div
            style={{
              maxWidth: '85%',
              marginTop: 6,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              justifyContent: 'flex-end',
            }}
          >
            {attached.map((m) => (
              <MentionToken
                key={`${m.kind}:${m.id}`}
                chatId={chatId}
                mention={m}
                tabs={tabs}
                spaces={spaces}
                artifacts={artifacts}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const streaming = message.status === 'streaming';
  const finished = message.status === 'done' || message.status === 'stopped';
  return (
    <div
      className="msg-wrap"
      onContextMenu={openMenu}
      style={{ margin: '10px 0' }}
    >
      {/* Everything that happened, in the order it happened. */}
      {blocksOf(message.parts).map((block) => {
        if (block.type === 'group') {
          const groupParts = block.indexes.map(
            (index) => message.parts[index] as ToolPart,
          );
          return (
            <StepGroup
              key={`g${block.indexes[0]}`}
              parts={groupParts}
              message={message}
              chatId={chatId}
              tabs={tabs}
              isNewestReply={isLast}
              busy={busy}
            />
          );
        }
        const i = block.index;
        const part = message.parts[i];
        const last = i === message.parts.length - 1;
        // The part being worked on right now gets a spinner beside it.
        const active =
          streaming &&
          last &&
          (part.type === 'thinking' || part.type === 'text');
        const wrap = (node: ReactNode) =>
          active ? <ActiveRow key={i}>{node}</ActiveRow> : node;
        // Nothing to show for blank text (older chats may have some): no gap.
        if (
          (part.type === 'text' || part.type === 'thinking') &&
          part.text.trim() === ''
        ) {
          return null;
        }
        if (part.type === 'thinking') {
          return wrap(
            <ThinkingBlock key={i} text={part.text} live={streaming && last} />,
          );
        }
        if (part.type === 'choices') {
          return (
            <ChoiceButtons
              key={i}
              chatId={chatId}
              question={part.question}
              options={part.options}
              busy={busy}
            />
          );
        }
        if (part.type === 'tool') {
          return wrap(
            <ToolBlock
              key={i}
              part={part}
              chatId={chatId}
              messageId={message.id}
              messageStatus={message.status}
              tabs={tabs}
              isNewestReply={isLast}
              busy={busy}
            />,
          );
        }
        return wrap(
          <div key={i} className="msg-ai-text" style={{ margin: '0 0 6px' }}>
            <Markdown text={part.text} />
            {streaming && last && <span aria-hidden="true">▍</span>}
          </div>,
        );
      })}
      {/* Between steps (nothing started yet, or the last step is finished and the
          next has not begun): still working, so still a spinner. */}
      {streaming &&
        (message.parts.length === 0 ||
          (() => {
            const lastPart = message.parts[message.parts.length - 1];
            return (
              lastPart.type === 'choices' ||
              (lastPart.type === 'tool' &&
                lastPart.status !== 'running' &&
                lastPart.status !== 'waiting')
            );
          })()) && (
          <ActiveRow>
            <div style={muted}>
              {message.parts.length === 0 ? 'Thinking…' : 'Working…'}
            </div>
          </ActiveRow>
        )}
      {message.parts.length === 0 &&
        !streaming &&
        message.status === 'done' && (
          <div style={muted}>The model sent an empty reply.</div>
        )}

      {message.status === 'stopped' && (
        <div style={{ ...muted, marginTop: 4 }}>Stopped.</div>
      )}
      {message.status === 'error' && (
        <FailedReply message={message} isLast={isLast} chatId={chatId} />
      )}

      {finished && (
        <div className="msg-actions" style={{ marginTop: 4, gap: 6 }}>
          <span>{usageText(message)}</span>
          {message.content !== '' && (
            <Button
              variant="ghost"
              size="sm"
              icon="copy"
              title="Copy this reply"
              onClick={() => window.browserApi.chatCopy(message.content)}
            >
              Copy
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// The conversation. It stays scrolled to the bottom as a reply arrives, unless you
// have scrolled up to read something (then it leaves you where you are).
export function MessageList({
  chatId,
  generating,
  tabs,
  spaces,
  artifacts,
}: {
  chatId: number;
  // A reply is being written in this chat right now.
  generating: boolean;
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  artifacts: ArtifactInfo[];
}) {
  const messages = useChatMessages(chatId);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    stick.current = true; // A different chat starts at the bottom.
  }, [chatId]);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, chatId]);

  const lastId = messages[messages.length - 1]?.id;
  const newestUserId = [...messages]
    .reverse()
    .find((m) => m.role === 'user')?.id;

  return (
    <div
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: 'var(--s-3) var(--s-4)',
      }}
    >
      {messages.length === 0 && (
        <p style={{ ...muted, fontSize: 13, margin: '12px 0' }}>
          Ask anything. Your chat is saved on this computer.
        </p>
      )}
      {messages.map((m) => (
        <MessageView
          key={m.id}
          message={m}
          isLast={m.id === lastId}
          isNewestUser={m.id === newestUserId}
          busy={generating}
          chatId={chatId}
          tabs={tabs}
          spaces={spaces}
          artifacts={artifacts}
        />
      ))}
    </div>
  );
}
