import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ARTIFACT_KINDS } from './artifacts';
import type { ArtifactKind } from './artifacts';
import { SPACE_COLOR_HEX } from './colors';
import type { ArtifactInfo, SpaceInfo } from './types';
import { ItemEmoji } from './ui/controls';

const muted: CSSProperties = {
  color: 'var(--c-text-2)',
  fontSize: 12,
  lineHeight: 1.45,
};

const field: CSSProperties = {
  border: '1px solid var(--c-border-strong)',
  borderRadius: 8,
  fontSize: 13,
  padding: '5px 8px',
  background: 'var(--c-surface)',
  minWidth: 0,
};

const smallButton: CSSProperties = {
  border: '1px solid var(--c-border-strong)',
  background: 'var(--c-surface)',
  borderRadius: 14,
  fontSize: 12,
  padding: '3px 10px',
  cursor: 'pointer',
  color: 'var(--c-text)',
};

const KIND_WORDS: Record<ArtifactKind, string> = {
  markdown: 'Markdown',
  text: 'Plain text',
  html: 'HTML',
  code: 'Code',
};

const sizeWords = (chars: number) =>
  chars < 1000 ? `${chars} chars` : `${(chars / 1000).toFixed(1)}k chars`;

// A title that shows a small pencil beside it while the mouse is over it (or the
// pencil has the keyboard), and turns into a text box when the pencil is used.
function EditableTitle({
  text,
  label,
  editing,
  onEdit,
  onSave,
  onCancel,
  onOpen,
  style,
}: {
  text: string;
  label: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (name: string) => void;
  onCancel: () => void;
  // When given, the title itself is a button that opens the artifact.
  onOpen?: () => void;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const [draft, setDraft] = useState(text);
  if (editing) {
    return (
      <input
        aria-label={label}
        autoFocus
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(draft);
          else if (e.key === 'Escape') onCancel();
        }}
        style={{ ...field, width: '100%', boxSizing: 'border-box' }}
      />
    );
  }
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, ...style }}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          title="Open"
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            font: 'inherit',
            color: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </button>
      ) : (
        <span style={{ wordBreak: 'break-word' }}>{text}</span>
      )}
      <button
        type="button"
        aria-label={label}
        title="Rename"
        onClick={() => {
          setDraft(text);
          onEdit();
        }}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 12,
          padding: 0,
          color: 'var(--c-text-2)',
          opacity: hover ? 1 : 0,
        }}
      >
        ✎
      </button>
    </div>
  );
}

// The Artifacts panel: make documents inside the browser, and rename, move or
// delete the ones you have. (Opening one in a tab comes in the next update.)
export function ArtifactsPanel({
  artifacts,
  spaces,
  renameRequest,
  onRenameHandled,
}: {
  artifacts: ArtifactInfo[];
  spaces: SpaceInfo[];
  // Set when "Rename" was chosen from an artifact's menu.
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  // The "+" opens a small chooser for the kind and where it goes.
  const [choosing, setChoosing] = useState(false);
  const [kind, setKind] = useState<ArtifactKind>('markdown');
  // '' = outside every Space, otherwise a Space's id.
  const [where, setWhere] = useState('');
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renamingSpace, setRenamingSpace] = useState<number | null>(null);

  useEffect(() => {
    if (renameRequest !== null) {
      setRenaming(renameRequest);
      onRenameHandled();
    }
  }, [renameRequest, onRenameHandled]);

  // Make it, then let you name it right away.
  const create = async () => {
    const id = await window.browserApi.artifactCreate(
      kind,
      '',
      where === '' ? null : Number(where),
    );
    setChoosing(false);
    if (id !== null) setRenaming(id);
  };

  const groups: {
    key: string;
    space: SpaceInfo | null;
    items: ArtifactInfo[];
  }[] = [
    {
      key: 'none',
      space: null,
      items: artifacts.filter((a) => a.spaceId === null),
    },
    ...spaces.map((space) => ({
      key: String(space.id),
      space,
      items: artifacts.filter((a) => a.spaceId === space.id),
    })),
  ];

  const row = (a: ArtifactInfo) => (
    <li
      key={a.id}
      onContextMenu={(event) => {
        event.preventDefault();
        window.browserApi.showArtifactMenu(a.id, event.clientX, event.clientY);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 0',
        borderTop: '1px solid var(--c-border)',
      }}
    >
      <ItemEmoji emoji={a.emoji} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <EditableTitle
            text={a.title}
            label={`Rename ${a.title}`}
            editing={renaming === a.id}
            onEdit={() => setRenaming(a.id)}
            onSave={(name) => {
              window.browserApi.artifactRename(a.id, name);
              setRenaming(null);
            }}
            onCancel={() => setRenaming(null)}
            onOpen={() => window.browserApi.artifactOpen(a.id)}
            style={{ fontSize: 13, fontWeight: 500 }}
          />
        </div>
        <div
          style={{
            ...muted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span>
            {KIND_WORDS[a.kind]} · {sizeWords(a.size)}
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Delete ${a.title}`}
        title="Delete"
        onClick={() => window.browserApi.artifactDelete(a.id)}
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '0 4px',
          color: 'var(--c-text-2)',
        }}
      >
        ×
      </button>
    </li>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          aria-label="New artifact"
          aria-expanded={choosing}
          title="New artifact"
          onClick={() => setChoosing(!choosing)}
          style={{ ...smallButton, padding: '2px 12px', fontWeight: 600 }}
        >
          +
        </button>
        <span style={muted}>
          Documents made in the browser. Click a name to open it.
        </span>
      </div>
      {choosing && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            margin: '10px 0 4px',
            padding: 10,
            background: 'var(--c-surface-2)',
            borderRadius: 10,
          }}
        >
          <label style={muted}>
            Type
            <select
              aria-label="Type"
              value={kind}
              onChange={(e) => setKind(e.target.value as ArtifactKind)}
              style={{ ...field, display: 'block', width: '100%' }}
            >
              {ARTIFACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_WORDS[k]}
                </option>
              ))}
            </select>
          </label>
          <label style={muted}>
            Space
            <select
              aria-label="Space"
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              style={{ ...field, display: 'block', width: '100%' }}
            >
              <option value="">No space</option>
              {spaces.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              style={smallButton}
              onClick={() => setChoosing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void create()}
              style={{
                ...smallButton,
                background: 'var(--c-accent)',
                color: 'var(--c-on-accent)',
                borderColor: 'var(--c-accent)',
              }}
            >
              Create
            </button>
          </div>
        </div>
      )}
      {artifacts.length === 0 && (
        <p style={{ ...muted, marginTop: 14 }}>
          No artifacts yet. Use the + to make one.
        </p>
      )}
      <div style={{ marginTop: 14 }}>
        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.key} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--c-text-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {g.space && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: SPACE_COLOR_HEX[g.space.color],
                      flex: 'none',
                    }}
                  />
                )}
                {g.space === null ? (
                  'No space'
                ) : (
                  <EditableTitle
                    text={g.space.name}
                    label={`Rename Space ${g.space.name}`}
                    editing={renamingSpace === g.space.id}
                    onEdit={() => setRenamingSpace(g.space!.id)}
                    onSave={(name) => {
                      window.browserApi.renameSpace(g.space!.id, name);
                      setRenamingSpace(null);
                    }}
                    onCancel={() => setRenamingSpace(null)}
                  />
                )}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {g.items.map(row)}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
