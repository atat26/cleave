import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ChatInfo, LlmInfo } from './types';

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

// The box you type in, with the model chip and the Send / Stop button.
//
//   Enter sends, Shift+Enter adds a new line, Esc stops a reply being written.
//
// In the one-row (compact) chat bar, `before` and `after` hold the chat switcher
// and the expand / close buttons, so everything fits on one line.
export function ChatComposer({
  chat,
  llm,
  compact,
  before,
  after,
  onSent,
}: {
  chat: ChatInfo;
  llm: LlmInfo;
  // The one-row look (a single line, no growing).
  compact: boolean;
  before?: ReactNode;
  after?: ReactNode;
  // Called after a message is sent (the compact bar opens up to show the reply).
  onSent: () => void;
}) {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const model = chat.model ?? llm.model;
  const setup = !llm.hasKey ? 'key' : model === null ? 'model' : null;

  // Grow with the text (up to a few lines) unless in the one-row bar.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${compact ? 32 : Math.min(el.scrollHeight, 140)}px`;
  }, [text, compact]);

  const send = async () => {
    if (text.trim() === '' || sending || chat.generating) return;
    setSending(true);
    setNotice('');
    const result = await window.browserApi.chatSend(chat.id, text);
    setSending(false);
    if (result.ok) {
      setText('');
      onSent();
    } else {
      setNotice(result.error);
    }
  };

  const stop = () => window.browserApi.chatStop(chat.id);

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
      {notice && (
        <div
          role="alert"
          style={{ margin: '0 0 6px', fontSize: 12, color: '#b3261e' }}
        >
          {notice}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        {before}
        <button
          type="button"
          title={
            model ? `Using ${model}. Click to switch models.` : 'Choose a model'
          }
          onClick={() =>
            model
              ? window.browserApi.showModelMenu(chat.id)
              : window.browserApi.openSettings()
          }
          style={chipStyle}
        >
          {model ? shortModel(model) : 'Choose model'}
        </button>
        <textarea
          ref={box}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            } else if (e.key === 'Escape' && chat.generating) {
              stop();
            }
          }}
          placeholder="Ask anything"
          aria-label="Message"
          maxLength={20000}
          style={{
            flex: 1,
            minWidth: 0,
            boxSizing: 'border-box',
            padding: '6px 14px',
            border: '1px solid #d0d0d0',
            borderRadius: 16,
            fontSize: 13,
            fontFamily: 'inherit',
            lineHeight: '18px',
            resize: 'none',
            background: '#ffffff',
            outline: 'none',
          }}
        />
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
            disabled={text.trim() === '' || sending}
            title="Send (Enter)"
            style={{
              ...chipStyle,
              height: 32,
              background: text.trim() === '' ? '#f1f3f4' : '#1a73e8',
              color: text.trim() === '' ? '#9aa0a6' : '#ffffff',
              border: 'none',
              cursor: text.trim() === '' ? 'default' : 'pointer',
            }}
          >
            Send
          </button>
        )}
        {after}
      </div>
    </div>
  );
}
