import { useRef } from 'react';
import { ArtifactsPanel } from './ArtifactsPanel';
import { ExtensionsPanel } from './ExtensionsPanel';
import { LibraryPanel } from './LibraryPanel';
import { PAGE_INSET, RAIL_WIDTH, TOOLBAR_HEIGHT } from './layout';
import type { RightPanel as RightPanelName } from './model';
import { ResizeHandle } from './ResizeHandle';
import { SettingsPanel } from './SettingsPanel';
import { SkillsPanel } from './SkillsPanel';
import type { SkillInfo } from './skills';
import { ToolsPanel } from './ToolsPanel';
import type { ArtifactInfo, SpaceInfo } from './types';
import { IconButton } from './ui/controls';

const TITLES: Record<RightPanelName, string> = {
  skills: 'Skills',
  tools: 'Tools',
  artifacts: 'Artifacts',
  extensions: 'Extensions',
  library: 'Library',
  settings: 'Settings',
};

// The panel that opens to the left of the rail. It is a card on the frame, and
// you can drag its left edge to make it wider or narrower (drag it narrow to
// close it). The app keeps the --panel variable up to date while it slides.
export function RightPanel({
  panel,
  artifacts,
  skills,
  openArtifactIds,
  spaces,
  artifactRenameRequest,
  onArtifactRenameHandled,
}: {
  panel: RightPanelName;
  artifacts: ArtifactInfo[];
  skills: SkillInfo[];
  // The artifacts that are open as tabs.
  openArtifactIds: number[];
  spaces: SpaceInfo[];
  artifactRenameRequest: number | null;
  onArtifactRenameHandled: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);

  return (
    <>
      <section
        ref={cardRef}
        aria-label={TITLES[panel]}
        style={{
          position: 'fixed',
          // Level with the page card, below the window's own buttons.
          top: TOOLBAR_HEIGHT,
          bottom: PAGE_INSET,
          right: RAIL_WIDTH,
          width: 'var(--panel)',
          boxSizing: 'border-box',
          background: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 48,
            flex: 'none',
            padding: '0 var(--s-2) 0 var(--s-4)',
            fontSize: 'var(--fs-lg)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ flex: 1 }}>{TITLES[panel]}</span>
          <IconButton
            icon="x"
            size="sm"
            label={`Close ${TITLES[panel]}`}
            title="Close"
            onClick={() => window.browserApi.togglePanel(panel)}
          />
        </header>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '0 var(--s-4) var(--s-5)',
          }}
        >
          {panel === 'settings' ? (
            <SettingsPanel />
          ) : panel === 'library' ? (
            <LibraryPanel />
          ) : panel === 'extensions' ? (
            <ExtensionsPanel />
          ) : panel === 'tools' ? (
            <ToolsPanel />
          ) : panel === 'artifacts' ? (
            <ArtifactsPanel
              artifacts={artifacts}
              openIds={openArtifactIds}
              spaces={spaces}
              renameRequest={artifactRenameRequest}
              onRenameHandled={onArtifactRenameHandled}
            />
          ) : (
            <SkillsPanel skills={skills} />
          )}
        </div>
      </section>
      <ResizeHandle
        kind="panel"
        axis="x"
        grows={-1}
        measure={() => cardRef.current?.offsetWidth ?? 0}
        title="Drag to resize. Drag all the way right to close."
        style={{
          position: 'fixed',
          top: TOOLBAR_HEIGHT,
          bottom: 0,
          // Straddles the panel's left edge, on the frame side of the page card.
          right: `calc(${RAIL_WIDTH}px + var(--panel) - 8px)`,
          width: 8,
        }}
      />
    </>
  );
}
