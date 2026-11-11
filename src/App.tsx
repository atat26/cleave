import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { TOOLBAR_HEIGHT } from './layout';

const buttonStyle: CSSProperties = {
  width: 32,
  height: 32,
  border: 'none',
  borderRadius: 16,
  background: 'transparent',
  fontSize: 18,
  cursor: 'pointer',
};

// The toolbar strip: back/forward buttons and the address bar.
export function App() {
  const [text, setText] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the tab: show its address (unless the user is typing in the box)
  // and enable the buttons only when there is somewhere to go.
  useEffect(() => {
    return window.browserApi.onTabState((state) => {
      if (document.activeElement !== inputRef.current) setText(state.url);
      setCanGoBack(state.canGoBack);
      setCanGoForward(state.canGoForward);
    });
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    window.browserApi.navigate(text);
    inputRef.current?.blur();
  };

  return (
    <form
      onSubmit={submit}
      style={{
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
