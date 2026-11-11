import type { CSSProperties } from 'react';
import { RAIL_WIDTH } from './layout';
import { isPanelRelevant } from './model';
import type { RightPanel, ViewMode } from './model';

const buttonStyle = (active: boolean): CSSProperties => ({
  width: 36,
  height: 36,
  border: 'none',
  borderRadius: 10,
  background: active ? '#ffffff' : 'transparent',
  boxShadow: active ? '0 1px 2px rgba(0, 0, 0, 0.15)' : 'none',
  fontSize: 17,
  cursor: 'pointer',
  // The symbols are emoji: draw them in grey so they match the rest of the frame.
  filter: 'grayscale(1)',
});

// Every button on the rail. Which view each belongs to (chat, web, or both) is
// declared with the panel in model.ts (PANEL_CONTEXT): add a panel there and a
// line here, and the rail shows it only when it is relevant.
const RAIL_ITEMS: {
  panel: RightPanel;
  label: string;
  icon: string;
  // Pinned to the bottom of the rail instead of the top.
  bottom?: boolean;
}[] = [
  { panel: 'skills', label: 'Skills', icon: '⚡' },
  { panel: 'extensions', label: 'Extensions', icon: '🧩' },
  { panel: 'settings', label: 'Settings', icon: '⚙️', bottom: true },
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
    <button
      key={panel}
      type="button"
      aria-label={label}
      aria-pressed={open === panel}
      title={label}
      onClick={() => window.browserApi.togglePanel(panel)}
      style={buttonStyle(open === panel)}
    >
      {icon}
    </button>
  );

  return (
    <nav
      aria-label="Tools"
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
        gap: 6,
      }}
    >
      {shown.filter((item) => !item.bottom).map(button)}
      <div style={{ flex: 1 }} />
      {shown.filter((item) => item.bottom).map(button)}
    </nav>
  );
}
