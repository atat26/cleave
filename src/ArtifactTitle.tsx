import { useState } from 'react';
import { NameButton } from './NameButton';

// The title at the top of an open artifact. Click it to rename (Enter saves, Escape
// cancels); the "AI name" button sits next to it.
export function ArtifactTitle({ id, title }: { id: number; title: string }) {
  const [renaming, setRenaming] = useState(false);
  const finish = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (name && name !== title) window.browserApi.artifactRename(id, name);
  };
  return (
    <div className="art-title-row">
      {renaming ? (
        <input
          className="input"
          autoFocus
          defaultValue={title}
          maxLength={80}
          aria-label="Artifact name"
          onFocus={(e) => e.target.select()}
          onBlur={(e) => finish(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(e.currentTarget.value);
            if (e.key === 'Escape') setRenaming(false);
          }}
          style={{
            fontSize: 'var(--fs-xl)',
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            height: 36,
          }}
        />
      ) : (
        <h1
          className="truncate"
          onClick={() => setRenaming(true)}
          title="Click to rename"
          style={{
            margin: 0,
            fontSize: 'var(--fs-xl)',
            fontWeight: 600,
            minWidth: 0,
            cursor: 'text',
          }}
        >
          {title}
        </h1>
      )}
      <NameButton kind="artifact" id={id} />
    </div>
  );
}
