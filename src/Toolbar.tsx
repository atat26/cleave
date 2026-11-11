import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { SIDEBAR_WIDTH, TOOLBAR_HEIGHT } from './layout';

const buttonStyle: CSSProperties = {
  width: 32,
  height: 32,
  border: 'none',
  borderRadius: 16,
  background: 'transparent',
  fontSize: 18,
  cursor: 'pointer',
};

interface ToolbarProps {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

// The strip along the top: back/forward buttons and the address bar. It always
// shows the active tab's address.
export function Toolbar({ url, canGoBack, canGoForward }: ToolbarProps) {
  const [text, setText] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the active tab's address, unless the user is typing in the box.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(url);
  }, [url]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    window.browserApi.navigate(text);
    inputRef.current?.blur();
  };

  return (
    <form
      onSubmit={submit}
      style={{
        marginLeft: SIDEBAR_WIDTH,
        height: TOOLBAR_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 12px',
        background: '#f1f3f4',
        borderBottom: '1px solid #d0d0d0',
      }}
    >
      <button
        type="button"
        aria-label="Back"
        title="Back"
        disabled={!canGoBack}
        onClick={() => window.browserApi.goBack()}
        style={{ ...buttonStyle, opacity: canGoBack ? 1 : 0.35 }}
      >
        ←
      </button>
      <button
        type="button"
        aria-label="Forward"
        title="Forward"
        disabled={!canGoForward}
        onClick={() => window.browserApi.goForward()}
        style={{ ...buttonStyle, opacity: canGoForward ? 1 : 0.35 }}
      >
        →
      </button>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder="Search or enter address"
        spellCheck={false}
        style={{
          flex: 1,
          height: 32,
          marginLeft: 4,
          padding: '0 14px',
          border: '1px solid #c4c4c4',
          borderRadius: 16,
          fontSize: 14,
          outline: 'none',
        }}
      />
    </form>
  );
}
