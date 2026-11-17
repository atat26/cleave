import { useRef } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { CodeText } from './CodeText';
import type { LanguageId } from './highlight';

// A plain text box whose text is coloured for its language. A coloured copy of the
// text sits underneath and the real (see-through) text box on top takes the typing,
// the selection and the right-click; scrolling the box scrolls the copy with it.
export function HighlightedEditor({
  label,
  value,
  language,
  mono,
  maxLength,
  onChange,
  onBlur,
  onContextMenu,
}: {
  label: string;
  value: string;
  language: LanguageId;
  // Code-style (fixed-width) letters.
  mono: boolean;
  maxLength: number;
  onChange: (value: string) => void;
  onBlur: () => void;
  onContextMenu: (event: MouseEvent<HTMLTextAreaElement>) => void;
}) {
  const layer = useRef<HTMLPreElement>(null);
  const font = mono ? 'var(--font-mono)' : 'var(--font)';
  return (
    <div className="hl-editor">
      <pre
        ref={layer}
        className="hl-layer"
        aria-hidden="true"
        style={{ fontFamily: font }}
      >
        <CodeText language={language} code={value} />
        {/* A final empty line needs something on it to be as tall as in the box. */}
        {'\n'}
      </pre>
      <textarea
        className="hl-input"
        aria-label={label}
        value={value}
        maxLength={maxLength}
        spellCheck={!mono}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(event.target.value)
        }
        onScroll={(event) => {
          if (layer.current) {
            layer.current.scrollTop = event.currentTarget.scrollTop;
            layer.current.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
        onContextMenu={onContextMenu}
        onBlur={onBlur}
        style={{ fontFamily: font }}
      />
    </div>
  );
}
