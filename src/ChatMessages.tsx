import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { errorMessage } from './openrouter';
import type { ChatMessage } from './types';

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
    return () => {
      cancelled = true;
      unsubscribe();
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

// One message. Everything is drawn as plain text: a model's reply is never turned
// into markup, so it cannot do anything but be read. (Richer content, such as
// buttons or diagrams, will come later in a safe, sandboxed form.)
function MessageView({
  message,
  isLast,
  chatId,
}: {
  message: ChatMessage;
  isLast: boolean;
  chatId: number;
}) {
  const text: CSSProperties = {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    lineHeight: 1.5,
    fontSize: 14,
    userSelect: 'text',
  };

  if (message.role === 'user') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
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
          {message.content}
        </div>
      </div>
    );
  }

  const streaming = message.status === 'streaming';
  const finished = message.status === 'done' || message.status === 'stopped';
  return (
    <div style={{ margin: '10px 0' }}>
      {streaming && message.content === '' ? (
        <div style={muted}>Thinking…</div>
      ) : message.content !== '' ? (
        <div style={text}>
          {message.content}
          {streaming && <span aria-hidden="true">▍</span>}
        </div>
      ) : message.status === 'done' ? (
        <div style={muted}>The model sent an empty reply.</div>
      ) : null}

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
export function MessageList({ chatId }: { chatId: number }) {
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
          chatId={chatId}
        />
      ))}
    </div>
  );
}
