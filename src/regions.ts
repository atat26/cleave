// Moving the keyboard between the app's separate parts with F6 (and Shift+F6),
// like a normal browser. Tab only moves inside one part, because the sidebar, the
// toolbar/chat/panels and the web page are separate views.
export type Region = 'sidebar' | 'window' | 'page';

// The next part to focus. The page is skipped when it is hidden (chat-only).
export function nextRegion(
  current: Region | null,
  backwards: boolean,
  pageShown: boolean,
): Region {
  const order: Region[] = pageShown
    ? ['sidebar', 'window', 'page']
    : ['sidebar', 'window'];
  const index = current === null ? -1 : order.indexOf(current);
  if (index === -1) return backwards ? order[order.length - 1] : order[0];
  const step = backwards ? -1 : 1;
  return order[(index + step + order.length) % order.length];
}
