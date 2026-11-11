import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatBar } from './ChatBar';
import { CHAT_FULL_MIN_HEIGHT, RAIL_WIDTH } from './layout';
import { ArtifactView } from './ArtifactView';
import { LeadView } from './LeadView';
import type { RightPanel as RightPanelName } from './model';
import { Rail } from './Rail';
import { RightPanel } from './RightPanel';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import type { UiState } from './types';

// This one page plays two roles. The app loads it twice: once as the main
// window's page (the frame: toolbar, chat, right panel and rail, plus a Space's
// overview) and once, with "#sidebar" in the address, as the sidebar that floats
// above the web pages.
const IS_SIDEBAR = window.location.hash === '#sidebar';

// The frame's parts are positioned with CSS variables that the app updates
// while the frame slides or is dragged (--left, --panel and --chat; see
// ChatBar.tsx and friends). This one never changes.
if (!IS_SIDEBAR) {
  document.documentElement.style.setProperty('--rail', `${RAIL_WIDTH}px`);
}

export function App() {
  const [state, setState] = useState<UiState | null>(null);
  // Set when "Rename Space" is chosen from a right-click menu.
  const [renameRequest, setRenameRequest] = useState<number | null>(null);
  const clearRenameRequest = useCallback(() => setRenameRequest(null), []);
  // The right panel is on screen while it is open, and while it slides closed.
  const [panelVisible, setPanelVisible] = useState(false);
  // The chat is on screen unless it is closed (and has finished sliding away).
  const [chatVisible, setChatVisible] = useState(true);
  // The chat draws its expanded look once it is tall enough.
  const [chatFull, setChatFull] = useState(false);
  // Remembered so a panel's content stays visible while it slides closed.
  const lastPanel = useRef<RightPanelName | null>(null);

  // Set when "Rename chat" is chosen from a chat menu.
  const [chatRenameRequest, setChatRenameRequest] = useState<number | null>(
    null,
  );
  const clearChatRenameRequest = useCallback(
    () => setChatRenameRequest(null),
    [],
  );

  useEffect(() => window.browserApi.onState(setState), []);
  useEffect(() => window.browserApi.onRenameRequest(setRenameRequest), []);
  useEffect(
    () => window.browserApi.onChatRenameRequest(setChatRenameRequest),
    [],
  );

  // The app sends the frame's layout many times a second while it slides. A CSS
  // variable moves everything without re-drawing the whole page each time; only
  // the two on/off flags below are React state (and they change rarely).
  useEffect(() => {
    if (IS_SIDEBAR) return;
    return window.browserApi.onLayout(({ left, panel, chat }) => {
      const root = document.documentElement.style;
      root.setProperty('--left', `${left}px`);
      root.setProperty('--panel', `${panel}px`);
      root.setProperty('--chat', `${chat}px`);
      setPanelVisible(panel > 1);
      setChatVisible(chat > 1);
      setChatFull(chat >= CHAT_FULL_MIN_HEIGHT);
    });
  }, []);

  // Everything above is listening now: ask for the current state. (The app also
  // sends it when the page finishes loading, but that can come too early.)
  useEffect(() => window.browserApi.uiReady(), []);

  if (state === null) return null;

  if (IS_SIDEBAR) {
    return (
      <Sidebar
        state={state}
        renameRequest={renameRequest}
        onRenameHandled={clearRenameRequest}
        chatRenameRequest={chatRenameRequest}
        onChatRenameHandled={clearChatRenameRequest}
      />
    );
  }

  const active = state.active;
  const activeTab =
    active?.kind === 'tab'
      ? state.tabs.find((tab) => tab.id === active.id)
      : undefined;
  const activeArtifact =
    active?.kind === 'artifact'
      ? state.artifactTabs.find((a) => a.id === active.id)
      : undefined;
  const leadSpace =
    active?.kind === 'lead'
      ? state.spaces.find((space) => space.id === active.spaceId)
      : undefined;

  if (state.rightPanel !== null) lastPanel.current = state.rightPanel;
  const shownPanel = state.rightPanel ?? lastPanel.current;

  return (
    <>
      <Toolbar
        url={activeTab?.url ?? ''}
        canGoBack={state.canGoBack}
        canGoForward={state.canGoForward}
        disabled={activeTab === undefined}
        viewMode={state.viewMode}
        chats={state.chats}
      />
      {activeArtifact && (
        <ArtifactView key={activeArtifact.id} tab={activeArtifact} />
      )}
      {leadSpace && (
        <LeadView
          key={leadSpace.id}
          space={leadSpace}
          tabs={state.tabs.filter((tab) => tab.spaceId === leadSpace.id)}
        />
      )}
      {chatVisible && (
        <ChatBar
          full={chatFull}
          viewMode={state.viewMode}
          chats={state.chats}
          llm={state.llm}
          tabs={state.tabs}
          spaces={state.spaces}
          activeTabId={activeTab?.id ?? null}
          renameRequest={chatRenameRequest}
          onRenameHandled={clearChatRenameRequest}
        />
      )}
      {panelVisible && shownPanel !== null && (
        <RightPanel
          panel={shownPanel}
          artifacts={state.artifacts}
          spaces={state.spaces}
        />
      )}
      <Rail open={state.rightPanel} viewMode={state.viewMode} />
    </>
  );
}
