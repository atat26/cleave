import { useCallback, useEffect, useState } from 'react';
import { LeadView } from './LeadView';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import type { UiState } from './types';

// This one page plays two roles. The app loads it twice: once as the main
// window's page (toolbar, and a Space's overview) and once, with "#sidebar" in
// the address, as the sidebar that floats above the web pages.
const IS_SIDEBAR = window.location.hash === '#sidebar';

export function App() {
  const [state, setState] = useState<UiState | null>(null);
  // Set when "Rename Space" is chosen from a right-click menu.
  const [renameRequest, setRenameRequest] = useState<number | null>(null);
  const clearRenameRequest = useCallback(() => setRenameRequest(null), []);

  useEffect(() => window.browserApi.onState(setState), []);
  useEffect(() => window.browserApi.onRenameRequest(setRenameRequest), []);

  // The main page starts to the right of the sidebar. While the sidebar slides
  // or is dragged, the app sends the new position many times a second; a CSS
  // variable moves everything without re-drawing the whole page each time.
  useEffect(() => {
    if (IS_SIDEBAR) return;
    return window.browserApi.onLayout((left) =>
      document.documentElement.style.setProperty('--content-left', `${left}px`),
    );
  }, []);

  if (state === null) return null;

  if (IS_SIDEBAR) {
    return (
      <Sidebar
        state={state}
        renameRequest={renameRequest}
        onRenameHandled={clearRenameRequest}
      />
    );
  }

  const active = state.active;
  const activeTab =
    active?.kind === 'tab'
      ? state.tabs.find((tab) => tab.id === active.id)
      : undefined;
  const leadSpace =
    active?.kind === 'lead'
      ? state.spaces.find((space) => space.id === active.spaceId)
      : undefined;

  return (
    <>
      <Toolbar
        url={activeTab?.url ?? ''}
        canGoBack={state.canGoBack}
        canGoForward={state.canGoForward}
        disabled={activeTab === undefined}
      />
      {leadSpace && (
        <LeadView
          key={leadSpace.id}
          space={leadSpace}
          tabs={state.tabs.filter((tab) => tab.spaceId === leadSpace.id)}
        />
      )}
    </>
  );
}
