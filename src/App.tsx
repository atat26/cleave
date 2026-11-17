import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatBar } from './ChatBar';
import { CHAT_FULL_MIN_HEIGHT, RAIL_WIDTH } from './layout';
import { ArtifactView } from './ArtifactView';
import { pushInsert } from './composerBus';
import { extractPdfText } from './pdfText';
import { requestSettingsSection } from './settingsNav';
import { LeadView } from './LeadView';
import { isNewTabPage } from './model';
import { NewTabView } from './NewTabView';
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

  // Set when "Rename" is chosen from an artifact's menu.
  const [artifactRenameRequest, setArtifactRenameRequest] = useState<
    number | null
  >(null);
  const clearArtifactRenameRequest = useCallback(
    () => setArtifactRenameRequest(null),
    [],
  );

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
    () => window.browserApi.onArtifactRenameRequest(setArtifactRenameRequest),
    [],
  );
  // Text sent to the message box waits there until the box is on screen.
  useEffect(() => {
    if (IS_SIDEBAR) return;
    return window.browserApi.onComposerInsert(pushInsert);
  }, []);
  // The lock card's "Site settings" opens Settings on its privacy part.
  useEffect(() => {
    if (IS_SIDEBAR) return;
    return window.browserApi.onSettingsSection(requestSettingsSection);
  }, []);
  useEffect(
    () => window.browserApi.onChatRenameRequest(setChatRenameRequest),
    [],
  );
  // The app asks this window to read the text of a PDF the assistant opens.
  useEffect(() => {
    if (IS_SIDEBAR) return;
    return window.browserApi.onPdfExtract(extractPdfText);
  }, []);

  // The app sends the frame's layout many times a second while it slides. A CSS
  // variable moves everything without re-drawing the whole page each time; only
  // the two on/off flags below are React state (and they change rarely).
  useEffect(() => {
    if (IS_SIDEBAR) return;
    return window.browserApi.onLayout(({ left, sidebar, panel, chat }) => {
      const root = document.documentElement.style;
      root.setProperty('--left', `${left}px`);
      root.setProperty('--sidebar-edge', `${sidebar}px`);
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
  // A new tab: the window draws the new-tab page, and the address bar stays empty.
  const onNewTab = activeTab !== undefined && isNewTabPage(activeTab.url);
  const activeArtifact =
    active?.kind === 'artifact'
      ? state.artifactTabs.find((a) => a.id === active.id)
      : undefined;
  const leadSpace =
    active?.kind === 'lead'
      ? state.spaces.find((space) => space.id === active.spaceId)
      : undefined;

  // The Space you are in (a page, its overview, or one of its artifacts), if any.
  const currentSpaceId = (() => {
    const a = state.active;
    if (a?.kind === 'lead') return a.spaceId;
    if (a?.kind === 'tab') {
      return state.tabs.find((t) => t.id === a.id)?.spaceId ?? null;
    }
    if (a?.kind === 'artifact') {
      return state.artifactTabs.find((t) => t.id === a.id)?.spaceId ?? null;
    }
    return null;
  })();
  const currentSpace =
    currentSpaceId === null
      ? null
      : (state.spaces.find((s) => s.id === currentSpaceId) ?? null);
  if (state.rightPanel !== null) lastPanel.current = state.rightPanel;
  const shownPanel = state.rightPanel ?? lastPanel.current;

  return (
    <>
      <Toolbar
        url={onNewTab ? '' : (activeTab?.url ?? '')}
        canGoBack={state.canGoBack}
        canGoForward={state.canGoForward}
        loading={state.loading}
        zoom={state.zoom}
        zoomable={state.zoomable}
        bookmarked={state.bookmarked}
        downloads={state.downloads}
        certBypassed={state.certBypassed}
        blockedPopups={state.blockedPopups}
        disabled={activeTab === undefined}
        viewMode={state.viewMode}
        chats={state.chats}
        space={currentSpace}
      />
      {onNewTab && activeTab && state.newTab && (
        <NewTabView
          key={activeTab.id}
          tab={activeTab}
          space={state.spaces.find((s) => s.id === activeTab.spaceId)}
          info={state.newTab}
          tabs={state.tabs}
          spaces={state.spaces}
          artifacts={state.artifacts}
        />
      )}
      {activeArtifact && (
        <ArtifactView
          key={activeArtifact.id}
          tab={activeArtifact}
          zoom={state.zoom}
        />
      )}
      {leadSpace && (
        <LeadView
          key={leadSpace.id}
          space={leadSpace}
          tabs={state.tabs.filter((tab) => tab.spaceId === leadSpace.id)}
          artifacts={state.artifacts.filter((a) => a.spaceId === leadSpace.id)}
          chats={state.chats.conversations.filter((c) =>
            c.spaceIds.includes(leadSpace.id),
          )}
          activeChatId={state.chats.activeId}
          openArtifactIds={state.artifactTabs.map((a) => a.id)}
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
          artifacts={state.artifacts}
          skills={state.skills}
          activeTabId={activeTab?.id ?? null}
          renameRequest={chatRenameRequest}
          onRenameHandled={clearChatRenameRequest}
        />
      )}
      {panelVisible && shownPanel !== null && (
        <RightPanel
          panel={shownPanel}
          artifacts={state.artifacts}
          skills={state.skills}
          openArtifactIds={state.artifactTabs.map((t) => t.id)}
          spaces={state.spaces}
          artifactRenameRequest={artifactRenameRequest}
          onArtifactRenameHandled={clearArtifactRenameRequest}
        />
      )}
      <Rail open={state.rightPanel} viewMode={state.viewMode} />
    </>
  );
}
