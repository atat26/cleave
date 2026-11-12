import type { CSSProperties } from 'react';

// Looks shared by everything in the sidebar (the tab list and the chat list).

export const iconButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  border: 'none',
  borderRadius: 12,
  background: 'transparent',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
};

// A row in the full-width list.
export const rowStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 32,
  padding: '0 6px 0 8px',
  marginBottom: 2,
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
  background: active ? 'var(--c-surface)' : 'transparent',
  boxShadow: active ? 'var(--sh-card)' : 'none',
});

// Text that is cut off with "…" instead of wrapping.
export const ellipsis: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// An icon button in the narrow strip.
export const stripButton = (active: boolean): CSSProperties => ({
  width: 32,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 2px',
  borderRadius: 8,
  cursor: 'pointer',
  background: active ? 'var(--c-surface)' : 'transparent',
  boxShadow: active ? 'var(--sh-card)' : 'none',
});
