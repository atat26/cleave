import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { TOOLBAR_HEIGHT } from './layout';

// The toolbar strip: the address bar. Back/forward buttons come next.
export function App() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Show the tab's current address, unless the user is typing in the box.
  useEffect(() => {
    return window.browserApi.onUrlChange((url) => {
      if (document.activeElement !== inputRef.current) setText(url);
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
        padding: '0 12px',
        background: '#f1f3f4',
        borderBottom: '1px solid #d0d0d0',
      }}
    >
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
