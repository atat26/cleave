import { RAIL_WIDTH } from './layout';
import { isPanelRelevant } from './model';
import type { RightPanel, ViewMode } from './model';
import { IconButton } from './ui/controls';
import type { IconName } from './ui/Icon';

// Every button on the rail, top to bottom: the page's things first, the chat's
// things last. Which view each belongs to (chat, web, or both) is declared with
// the panel in model.ts (PANEL_CONTEXT): add a panel there and a line here, and the
// rail shows it only when it is relevant.
const RAIL_ITEMS: {
  panel: RightPanel;
  label: string;
  icon: IconName;
  // Pinned to the bottom of the rail instead of the top.
  bottom?: boolean;
}[] = [
  { panel: 'extensions', label: 'Extensions', icon: 'puzzle' },
  { panel: 'artifacts', label: 'Artifacts', icon: 'doc' },
  { panel: 'skills', label: 'Skills', icon: 'sparkle' },
  { panel: 'tools', label: 'Tools', icon: 'tools' },
  { panel: 'settings', label: 'Settings', icon: 'settings', bottom: true },
];

// The column of buttons down the right edge of the frame. Each opens a panel to
// its left (click again to close it). Only the buttons that make sense for what
// is open are shown: chat tools with the chat, web tools with the page.
export function Rail({
  open,
  viewMode,
}: {
  open: RightPanel | null;
  viewMode: ViewMode;
}) {
  const shown = RAIL_ITEMS.filter((item) =>
    isPanelRelevant(item.panel, viewMode),
  );
  const button = ({ panel, label, icon }: (typeof RAIL_ITEMS)[number]) => (
    <IconButton
      key={panel}
      icon={icon}
      large
      label={label}
      pressed={open === panel}
      onClick={() => window.browserApi.togglePanel(panel)}
      style={{ width: 36, height: 36 }}
    />
  );

  return (
    <nav
      aria-label="Panels"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: RAIL_WIDTH,
        boxSizing: 'border-box',
        padding: '12px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {shown.filter((item) => !item.bottom).map(button)}
      <div style={{ flex: 1 }} />
      {shown.filter((item) => item.bottom).map(button)}
    </nav>
  );
}
