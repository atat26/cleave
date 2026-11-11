import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import type { TabsState } from './types';

// The app's own UI: the tab sidebar and the toolbar. The web pages themselves
// are drawn by the main process on top of the empty area below the toolbar.
export function App() {
  const [state, setState] = useState<TabsState | null>(null);

  useEffect(() => window.browserApi.onTabsState(setState), []);

  const active = state?.tabs.find((tab) => tab.id === state.activeId);

  return (
    <>
      <Sidebar tabs={state?.tabs ?? []} activeId={state?.activeId ?? -1} />
      <Toolbar
        url={active?.url ?? ''}
        canGoBack={state?.canGoBack ?? false}
        canGoForward={state?.canGoForward ?? false}
      />
    </>
  );
}
