import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MentionToken } from './LinkChips';
import { Markdown } from './MarkdownView';
import { errorMessage } from './openrouter';
import type { ChatMessage, MessagePart, SpaceInfo, TabInfo } from './types';

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

const muted: CSSProperties = { color: '#5f6368', fontSize: 12 };

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

const smallButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 12,
  padding: '2px 6px',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#5f6368',
};

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
    <div
      role="alert"
      style={{
        marginTop: 6,
        padding: '8px 10px',
        background: '#fce8e6',
        borderRadius: 8,
        color: '#b3261e',
        fontSize: 13,
      }}
    >
      {errorMessage(kind)}
      <div
        style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}
      >
        {isLast && (
          <button
            type="button"
            onClick={() => void retry()}
            style={{ ...smallButton, color: '#b3261e' }}
          >
            Try again
          </button>
        )}
        {needsSettings && (
          <button
            type="button"
            onClick={() => window.browserApi.openSettings()}
            style={{ ...smallButton, color: '#b3261e' }}
          >
            Open Settings
          </button>
        )}
        {note && <span style={muted}>{note}</span>}
      </div>
    </div>
  );
}

// Buttons the assistant offered. Clicking one puts its text in your message box
// (so you can send it as it is, or change it first). They are drawn here from plain
// text: the assistant cannot send anything that runs.
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            title="Send this as your reply"
            onClick={() => void choose(option)}
            style={{
              ...approveButton,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
              borderColor: '#c6dafc',
              color: '#1a56c4',
              background: '#f4f8ff',
              textAlign: 'left',
              overflowWrap: 'anywhere',
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {note && (
        <div style={{ ...muted, color: '#b3261e', marginTop: 4 }}>{note}</div>
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

const approveButton: CSSProperties = {
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  borderRadius: 14,
  fontSize: 12,
  padding: '4px 10px',
  cursor: 'pointer',
  color: '#202124',
};

const blockButton: CSSProperties = {
  ...smallButton,
  padding: '2px 0',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  textAlign: 'left',
};

const blockBody: CSSProperties = {
  margin: '4px 0',
  padding: '4px 10px',
  borderLeft: '3px solid #dadce0',
  color: '#5f6368',
  fontSize: 13,
  lineHeight: 1.45,
  maxHeight: 240,
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  userSelect: 'text',
};

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
    <div style={{ margin: '0 0 6px' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Hide the thinking' : 'Show the thinking'}
        style={blockButton}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {live ? 'Thinking…' : 'Thought process'}
      </button>
      {open && (
        <div ref={box} style={blockBody}>
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

// A tool the assistant used, in its place in the reply. The line says what it did;
// open it to see exactly what was called (the tool and its arguments) and how it
// ended. What a page said is not kept, only what was called.
function ToolBlock({
  part,
  chatId,
  messageId,
}: {
  part: ToolPart;
  chatId: number;
  messageId: number;
}) {
  const [open, setOpen] = useState(false);
  const icon =
    part.status === 'running'
      ? '…'
      : part.status === 'waiting'
        ? '?'
        : part.status === 'ok'
          ? '✓'
          : part.status === 'declined'
            ? '⊘'
            : '✕';
  const decide = (decision: 'allow' | 'allow-rest' | 'deny') =>
    window.browserApi.chatDecide(chatId, messageId, part.id, decision);

  // Waiting for you: the question, always visible, with the ways to answer it.
  if (part.status === 'waiting') {
    return (
      <div
        role="group"
        aria-label="Approve this action"
        style={{
          margin: '0 0 8px',
          padding: '8px 10px',
          background: '#fef7e0',
          border: '1px solid #f0d58c',
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <div style={{ ...muted }}>The assistant wants to:</div>
        <div
          style={{
            fontWeight: 600,
            margin: '2px 0 6px',
            overflowWrap: 'anywhere',
          }}
        >
          {part.ask}
        </div>
        {part.risky && (
          <div style={{ fontSize: 12, color: '#b3261e', marginBottom: 6 }}>
            This kind of action always asks you first.
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            type="button"
            onClick={() => decide('allow')}
            style={{
              ...approveButton,
              background: '#1a73e8',
              color: '#ffffff',
              border: 'none',
            }}
          >
            Allow
          </button>
          {!part.risky && (
            <button
              type="button"
              onClick={() => decide('allow-rest')}
              title="Go ahead with the rest of this reply without asking again, except for risky actions"
              style={approveButton}
            >
              Allow the rest of this reply
            </button>
          )}
          <button
            type="button"
            onClick={() => decide('deny')}
            style={approveButton}
          >
            Don't allow
          </button>
          <button
            type="button"
            onClick={() => window.browserApi.chatStop(chatId)}
            title="Stop this reply"
            style={approveButton}
          >
            Stop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ margin: '0 0 6px' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Hide what was called' : 'Show what was called'}
        style={{
          ...blockButton,
          color:
            part.status === 'error'
              ? '#b3261e'
              : part.status === 'declined'
                ? '#80868b'
                : '#5f6368',
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span aria-hidden="true">{icon}</span>
        <span style={{ overflowWrap: 'anywhere' }}>{part.label}</span>
      </button>
      {open && (
        <div
          style={{
            ...blockBody,
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: 12,
          }}
        >
          <div>
            <strong>Called:</strong> {part.name || '(unknown)'}
          </div>
          <div style={{ marginTop: 4 }}>
            <strong>Arguments:</strong>
          </div>
          <div>{showArguments(part.arguments)}</div>
          {part.details !== '' && (
            <div style={{ marginTop: 4 }}>
              <strong>What it found:</strong>
              <div
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  marginTop: 2,
                  padding: '4px 8px',
                  background: '#f8f9fa',
                  borderRadius: 6,
                }}
              >
                {part.details}
              </div>
            </div>
          )}
          {part.ask !== '' && (
            <div style={{ marginTop: 4 }}>
              <strong>You were asked:</strong> {part.ask}
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            <strong>Result:</strong>{' '}
            {part.status === 'running'
              ? 'still running'
              : part.outcome || (part.status === 'ok' ? 'done' : 'failed')}
          </div>
          {part.callId !== '' && (
            <div style={{ marginTop: 4, color: '#80868b' }}>
              Call id: {part.callId}
            </div>
          )}
        </div>
      )}
    </div>
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
  const text: CSSProperties = {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    lineHeight: 1.5,
    fontSize: 14,
    userSelect: 'text',
  };

  if (message.role === 'user') {
    // Pages attached without an "@name" (the Add page button) sit under the text.
    const attached = message.mentions.filter((m) => m.tag === '');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          margin: '10px 0',
        }}
      >
        <div
          style={{
            ...text,
            maxWidth: '85%',
            padding: '8px 12px',
            background: '#e8f0fe',
            borderRadius: 14,
          }}
        >
          {withTokens(message, chatId, tabs, spaces)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {retryNote && (
            <span style={{ ...muted, color: '#b3261e' }}>{retryNote}</span>
          )}
          {isNewestUser ? (
            !busy && (
              <button
                type="button"
                title="Ask this again and replace the reply"
                onClick={() => void retry()}
                style={smallButton}
              >
                Retry
              </button>
            )
          ) : (
            <button
              type="button"
              title="Start a new chat from here (this message and its reply). This chat stays as it is."
              onClick={() => void branch()}
              style={smallButton}
            >
              Branch
            </button>
          )}
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
    <div style={{ margin: '10px 0' }}>
      {/* Everything that happened, in the order it happened. */}
      {message.parts.map((part, i) => {
        const last = i === message.parts.length - 1;
        // The part being worked on right now gets a spinner beside it.
        const active =
          streaming &&
          last &&
          (part.type === 'thinking' ||
            part.type === 'text' ||
            (part.type === 'tool' && part.status === 'running'));
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
            />,
          );
        }
        return wrap(
          <div
            key={i}
            style={{ ...text, whiteSpace: 'normal', margin: '0 0 6px' }}
          >
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
        <div
          style={{
            ...muted,
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>{usageText(message)}</span>
          {message.content !== '' && (
            <button
              type="button"
              title="Copy this reply"
              onClick={() => window.browserApi.chatCopy(message.content)}
              style={smallButton}
            >
              Copy
            </button>
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
}: {
  chatId: number;
  // A reply is being written in this chat right now.
  generating: boolean;
  tabs: TabInfo[];
  spaces: SpaceInfo[];
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
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 4px' }}
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
        />
      ))}
    </div>
  );
}
