import { memo } from 'react';
import { highlight } from './highlight';
import type { LanguageId } from './highlight';

// Code as coloured pieces (inside a <pre> or <code> that the caller provides).
export const CodeText = memo(function CodeText({
  language,
  code,
}: {
  language: LanguageId;
  code: string;
}) {
  return (
    <>
      {highlight(language, code).map((token, i) =>
        token.kind === 'plain' ? (
          token.text
        ) : (
          <span key={i} className={`hl-${token.kind}`}>
            {token.text}
          </span>
        ),
      )}
    </>
  );
});
