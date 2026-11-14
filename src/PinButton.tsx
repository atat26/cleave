import { IconButton } from './ui/controls';

// The pin in the sidebar's header: pinned, the sidebar stays open beside the page;
// not pinned, it is the narrow strip and slides open over the page while the mouse
// is on it.
export function PinButton({ pinned }: { pinned: boolean }) {
  return (
    <IconButton
      icon="pin"
      size="sm"
      className="reveal"
      pressed={pinned}
      label={pinned ? 'Unpin the sidebar' : 'Pin the sidebar open'}
      onClick={() => window.browserApi.toggleSidebarPin()}
    />
  );
}
