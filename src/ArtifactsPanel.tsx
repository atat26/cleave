import { useEffect, useState } from 'react';
import { byteWords } from './artifacts';
import type { ArtifactKind } from './artifacts';
import { ARTIFACT_DRAG, artifactDragData, hasFileDrag } from './artifactDrag';
import { SPACE_COLOR_HEX } from './colors';
import type { ArtifactInfo, SpaceInfo } from './types';
import { Button, IconButton, Input, ItemEmoji } from './ui/controls';

const KIND_WORDS: Record<ArtifactKind, string> = {
  markdown: 'Markdown',
  text: 'Plain text',
  html: 'HTML',
  code: 'Code',
  file: 'File',
};

const sizeWords = (chars: number) =>
  chars < 1000 ? `${chars} chars` : `${(chars / 1000).toFixed(1)}k chars`;

// A name being typed: Enter keeps it, Escape (or clicking away) leaves it as it was.
function RenameBox({
  text,
  onSave,
  onCancel,
}: {
  text: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(text);
  return (
    <Input
      aria-label="Artifact name"
      autoFocus
      value={draft}
      maxLength={80}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing)
          onSave(draft);
        else if (event.key === 'Escape') onCancel();
      }}
      style={{ flex: 1, minWidth: 0 }}
    />
  );
}

// One artifact: its picture, name, and a line about it. Click it (or press Enter) to
// open it. Rename and delete show when the pointer or the keyboard is on the row;
// F2 renames, Delete deletes (it goes to Recently deleted), and the right-click menu
// has the rest.
function Row({
  item,
  open,
  renaming,
  onRename,
  onRenamed,
  onCancelRename,
}: {
  item: ArtifactInfo;
  open: boolean;
  renaming: boolean;
  onRename: () => void;
  onRenamed: (name: string) => void;
  onCancelRename: () => void;
}) {
  const openIt = () => window.browserApi.artifactOpen(item.id);
  return (
    <div
      className={
        open ? 'lrow reveal-host lib-row is-active' : 'lrow reveal-host lib-row'
      }
      role="button"
      tabIndex={0}
      title={open ? 'Open in a tab' : 'Open'}
      // Drag it onto the sidebar to open it in a Space, or onto the chat to add it
      // to the chat. (The right-click menu has both as well.)
      draggable={!renaming}
      onDragStart={(event) => {
        event.dataTransfer.setData(ARTIFACT_DRAG, artifactDragData(item.id));
        event.dataTransfer.effectAllowed = 'copyMove';
      }}
      onClick={() => {
        if (!renaming) openIt();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openIt();
        } else if (event.key === 'F2') {
          event.preventDefault();
          onRename();
        } else if (event.key === 'Delete') {
          event.preventDefault();
          window.browserApi.artifactDelete(item.id);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        window.browserApi.showArtifactMenu(
          item.id,
          event.clientX,
          event.clientY,
        );
      }}
    >
      <ItemEmoji emoji={item.emoji} />
      {renaming ? (
        <RenameBox
          text={item.title}
          onSave={onRenamed}
          onCancel={onCancelRename}
        />
      ) : (
        <>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="truncate" style={{ display: 'block' }}>
              {item.title}
            </span>
            <span
              className="truncate muted"
              style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
            >
              {item.fileLabel ?? KIND_WORDS[item.kind]} ·{' '}
              {item.fileLabel ? byteWords(item.size) : sizeWords(item.size)}
            </span>
          </span>
          <IconButton
            icon="pencil"
            size="sm"
            className="reveal"
            label={`Rename ${item.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onRename();
            }}
          />
          <IconButton
            icon="x"
            size="sm"
            className="reveal"
            label={`Delete ${item.title}`}
            onClick={(event) => {
              event.stopPropagation();
              window.browserApi.artifactDelete(item.id);
            }}
          />
        </>
      )}
    </div>
  );
}

// The Artifacts panel: documents made inside the browser, grouped by Space. "New"
// asks what kind to make; it is made in the Space you are in and named right away.
export function ArtifactsPanel({
  artifacts,
  openIds,
  spaces,
  renameRequest,
  onRenameHandled,
}: {
  artifacts: ArtifactInfo[];
  // The artifacts that are open as tabs.
  openIds: number[];
  spaces: SpaceInfo[];
  // Set when "Rename" was chosen from an artifact's menu (or one was just made).
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const [renaming, setRenaming] = useState<number | null>(null);
  // Files from the computer are being dragged over the panel.
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    if (renameRequest !== null) {
      setRenaming(renameRequest);
      onRenameHandled();
    }
  }, [renameRequest, onRenameHandled]);

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

  return (
    <div
      className={dropping ? 'files-drop is-dropping' : 'files-drop'}
      // Drop files here to add them (text, code, web pages, images and PDFs).
      onDragOver={(event) => {
        if (!hasFileDrag(event.dataTransfer.types)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropping(false);
        }
      }}
      onDrop={(event) => {
        setDropping(false);
        if (!hasFileDrag(event.dataTransfer.types)) return;
        event.preventDefault();
        void window.browserApi.uploadDrop([...event.dataTransfer.files], null);
      }}
    >
      <div
        className="row-flex"
        style={{ gap: 'var(--s-2)', margin: '0 0 var(--s-3)' }}
      >
        <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
          Documents made in the browser. Drop files here to add them.
        </span>
        <Button
          size="sm"
          icon="plus"
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            window.browserApi.showNewArtifactMenu(
              box.right - 200,
              box.bottom + 4,
            );
          }}
        >
          New
        </Button>
      </div>
      {artifacts.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          No artifacts yet. Choose “New” to make one.
        </p>
      )}
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section
            key={g.key}
            aria-label={g.space === null ? 'No Space' : g.space.name}
          >
            <h3 className="sect-title row-flex" style={{ gap: 'var(--s-2)' }}>
              {g.space !== null && (
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: SPACE_COLOR_HEX[g.space.color],
                    flex: 'none',
                  }}
                />
              )}
              <span className="truncate">
                {g.space === null ? 'No Space' : g.space.name}
              </span>
            </h3>
            {g.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                open={openIds.includes(item.id)}
                renaming={renaming === item.id}
                onRename={() => setRenaming(item.id)}
                onRenamed={(name) => {
                  window.browserApi.artifactRename(item.id, name);
                  setRenaming(null);
                }}
                onCancelRename={() => setRenaming(null)}
              />
            ))}
          </section>
        ))}
    </div>
  );
}
