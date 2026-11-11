import { useEffect, useState } from 'react';
import { LeadView } from './LeadView';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import type { UiState } from './types';

// The app's own UI: the tab sidebar, the toolbar, and (for a Space's Lead tab)
// the overview. Web pages are drawn by the main process on top of the empty
// area below the toolbar.
export function App() {
  const [state, setState] = useState<UiState | null>(null);

  useEffect(() => window.browserApi.onState(setState), []);

  if (state === null) return null;

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
      <Sidebar state={state} />
      <Toolbar
        url={activeTab?.url ?? ''}
        canGoBack={state.canGoBack}
        canGoForward={state.canGoForward}
        disabled={activeTab === undefined}
      />
      {leadSpace && (
        <LeadView
          space={leadSpace}
          tabs={state.tabs.filter((tab) => tab.spaceId === leadSpace.id)}
        />
      )}
    </>
  );
}
