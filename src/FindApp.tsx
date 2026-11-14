// The find bar's own page. It is drawn in a small view of its own over the top
// right of a web page (see tabs.ts), so the page stays usable while it is open.
// Typing searches (the browser engine highlights the matches on the page), Enter
// and Shift+Enter step to the next and previous match, Esc closes it.
import { useEffect, useRef, useState } from 'react';
import { findLabel } from './findBar';
import { IconButton } from './ui/controls';

export function FindApp() {
  const [text, setText] = useState('');
  const [result, setResult] = useState({ active: 0, total: 0 });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // This page shows nothing but the bar.
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const stopOpen = window.browserApi.onFindOpen(() => {
      input.current?.focus();
      input.current?.select();
    });
    const stopResult = window.browserApi.onFindResult(setResult);
    const stopClosed = window.browserApi.onFindClosed(() => {
      setText('');
      setResult({ active: 0, total: 0 });
    });
    window.browserApi.findReady();
    return () => {
      stopOpen();
      stopResult();
      stopClosed();
    };
  }, []);

  const step = (forward: boolean) => {
    if (text !== '') window.browserApi.findQuery(text, forward, true);
  };
  const label = findLabel(text, result.active, result.total);
  // Pressing a button must not take the keyboard from the box.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div className="popup find-bar" role="search" aria-label="Find in page">
      <input
        ref={input}
        className="input"
        value={text}
        autoFocus
        spellCheck={false}
        aria-label="Find in page"
        placeholder="Find in page"
        onChange={(event) => {
          setText(event.target.value);
          window.browserApi.findQuery(event.target.value, true, false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            step(!event.shiftKey);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            window.browserApi.findClose();
          }
        }}
      />
      <span
        className="find-count"
        role="status"
        style={{ color: label.none ? 'var(--c-danger)' : 'var(--c-text-2)' }}
      >
        {label.text}
      </span>
      <IconButton
        icon="chev-u"
        size="sm"
        label="Previous match"
        disabled={result.total <= 0}
        onMouseDown={keepFocus}
        onClick={() => step(false)}
      />
      <IconButton
        icon="chev-d"
        size="sm"
        label="Next match"
        disabled={result.total <= 0}
        onMouseDown={keepFocus}
        onClick={() => step(true)}
      />
      <IconButton
        icon="x"
        size="sm"
        label="Close find"
        onMouseDown={keepFocus}
        onClick={() => window.browserApi.findClose()}
      />
    </div>
  );
}
