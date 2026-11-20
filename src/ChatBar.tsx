import {
  ARTIFACT_DRAG,
  hasArtifactDrag,
  hasFileDrag,
  hasItemDrag,
  ITEM_DRAG,
  readArtifactDrag,
  readItemDrag,
} from './artifactDrag';
import { useEffect, useRef, useState } from 'react';
import { chatNeedOf, finishedNotice, liveLine } from './chatPreview';
import { noOverlayFlags } from './agentVisuals';
import type { OverlayFlags } from './agentVisuals';
import { CONTINUE_TEXT, runOf } from './runModel';
import { LimitBanner, RunBar, WorkingOnCard } from './StepList';
import { ChatComposer } from './ChatComposer';
import { MessageList, useChatMessages } from './ChatMessages';
import { ChatSwitcher } from './ChatSwitcher';
import { NewChatView } from './NewChatView';
import type { SkillInfo } from './skills';
import { PAGE_INSET, RAIL_WIDTH } from './layout';
import type { ViewMode } from './model';
import { ResizeHandle } from './ResizeHandle';
import { IconButton } from './ui/controls';
import { Icon } from './ui/Icon';
import type {
  ArtifactInfo,
  ChatsInfo,
  LlmInfo,
  SpaceInfo,
  TabInfo,
} from './types';

// The chat. It is a card on the frame: a compact bar (one row) along the bottom
// that you can drag taller, an expanded look with the conversation, or, when the
// page is closed, the whole middle of the window.
//
// `full` is true once it is tall enough for the expanded look. The app keeps
// the --chat, --left and --panel variables up to date while the frame slides.
export function ChatBar({
  full,
  viewMode,
  chats,
  llm,
  tabs,
  spaces,
  artifacts,
  skills,
  activeTabId,
  renameRequest,
  onRenameHandled,
}: {
  full: boolean;
  viewMode: ViewMode;
  chats: ChatsInfo;
  llm: LlmInfo;
  // The Spaces and tabs (for linking them), and the tab you are looking at.
  tabs: TabInfo[];
  spaces: SpaceInfo[];
  artifacts: ArtifactInfo[];
  skills: SkillInfo[];
  activeTabId: number | null;
  renameRequest: number | null;
  onRenameHandled: () => void;
}) {
  const regionRef = useRef<HTMLElement>(null);
  const chatOnly = viewMode === 'chat';
  const chat = chats.conversations.find((c) => c.id === chats.activeId);

  // What the chat needs on screen, even when it is slim: a line of a reply being
  // written, or the room to show an approval that is waiting.
  const messages = useChatMessages(chats.activeId);
  const generating = chat?.generating ?? false;
  const live = liveLine(messages);

  // The run bar: what the assistant is doing, while it works, and after it has
  // finished, stopped or got stuck until you dismiss it or send your next message.
  const newest = messages[messages.length - 1];
  const run = runOf(newest);
  const [endedFor, setEndedFor] = useState<number | null>(null);
  // "Continue" (after a Stop, or a limit): a new reply in the same chat that carries on.
  const carryOn = () => {
    if (chats.activeId !== null) {
      void window.browserApi.chatSend(chats.activeId, CONTINUE_TEXT, []);
    }
  };
  const wasGenerating = useRef(false);
  const newestRef = useRef(newest);
  newestRef.current = newest;
  useEffect(() => {
    if (generating) {
      setEndedFor(null);
    } else if (wasGenerating.current) {
      const last = newestRef.current;
      if (runOf(last) !== null) setEndedFor(last.id);
    }
    wasGenerating.current = generating;
  }, [generating]);
  useEffect(() => {
    setEndedFor(null);
    wasGenerating.current = false;
  }, [chats.activeId]);
  // What the page already shows (see agentVisuals.ts): while its pill is up, the chat does
  // not show the same status a second time; while a card is popped out or minimized, the
  // chat holds only a note.
  const [onPage, setOnPage] = useState<OverlayFlags>(noOverlayFlags());
  useEffect(() => {
    const stop = window.browserApi.onOverlayFlags(setOnPage);
    void window.browserApi.overlayFlagsGet().then(setOnPage);
    return stop;
  }, []);
  // The pill on the page was dismissed: the chat's copy of that status goes with it.
  useEffect(
    () =>
      window.browserApi.onOverlayDismissed((messageId) =>
        setEndedFor((current) => (current === messageId ? null : current)),
      ),
    [],
  );
  // With only the chat showing: the page the assistant is working on, if it is on one.
  const workingOn =
    run !== null &&
    (run.word === 'working' || run.word === 'waiting') &&
    run.tabId !== null
      ? tabs.find((tab) => tab.id === run.tabId && !tab.closed)
      : undefined;
  const barVisible =
    run !== null &&
    !onPage.pill &&
    (generating || (newest && endedFor === newest.id));
  // After a reply used up a limit: the banner offering to go on (the page's pill does not carry it).
  const limitVisible = !generating && !!newest && endedFor === newest.id;

  // A reply that finishes while the chat is too slim to show it: say so, until the
  // chat is opened enough to read it (or something new is sent).
  const [unreadReply, setUnreadReply] = useState(false);
  // An artifact is being dragged over the chat.
  const [dropping, setDropping] = useState(false);
  const wasWriting = useRef(false);
  const writingNow = live?.working === true;
  useEffect(() => {
    if (wasWriting.current && !writingNow && !full && !chatOnly) {
      setUnreadReply(true);
    }
    wasWriting.current = writingNow;
  }, [writingNow, full, chatOnly]);
  useEffect(() => {
    // Opened enough to read, or a new reply started, or a different chat.
    if (full || chatOnly || writingNow) setUnreadReply(false);
  }, [full, chatOnly, writingNow]);
  useEffect(() => {
    setUnreadReply(false);
    wasWriting.current = false;
  }, [chats.activeId]);
  const notice = unreadReply
    ? finishedNotice(messages[messages.length - 1])
    : null;

  // The slim chat needs room for the notice too, or it would be out of sight.
  // An approval card popped out over the page: the chat does not have to open up to
  // show it, so the page keeps its room.
  const poppedOut = onPage.card;
  const rawNeed = chatNeedOf(messages, generating);
  const baseNeed = poppedOut && rawNeed === 'approval' ? 'none' : rawNeed;
  const need =
    baseNeed === 'none' && (notice || (barVisible && !full && !chatOnly))
      ? 'activity'
      : baseNeed;
  useEffect(() => {
    window.browserApi.setChatNeed(need);
  }, [need]);

  const closeChat = (
    <IconButton
      icon="x"
      size="sm"
      className="reveal"
      label="Close chat (show only the page)"
      onClick={() => window.browserApi.setViewMode('page')}
    />
  );

  // The message box. On the new chat screen it sits in the middle of the screen.
  const composer = chat ? (
    <ChatComposer
      chat={chat}
      llm={llm}
      refs={chats.refs}
      tabs={tabs}
      spaces={spaces}
      artifacts={artifacts}
      skills={skills}
      activeTabId={activeTabId}
      compact={!full}
      before={
        !full ? (
          <ChatSwitcher
            chats={chats}
            renameRequest={renameRequest}
            onRenameHandled={onRenameHandled}
            compact
          />
        ) : undefined
      }
      after={
        !full ? (
          <>
            {/* Expand stays in view (it is the bar's one way to open up). Close
                  takes no room until the pointer is on the bar. */}
            <IconButton
              icon="chev-u"
              size="sm"
              label="Expand chat (Ctrl+J)"
              onClick={() => window.browserApi.toggleChat()}
            />
            <span className="chat-close-slot">
              <IconButton
                icon="x"
                size="sm"
                label="Close chat (show only the page)"
                onClick={() => window.browserApi.setViewMode('page')}
              />
            </span>
          </>
        ) : undefined
      }
      // The "@" list needs room: open the chat up from the one-row bar.
      onNeedRoom={() => {
        if (!full && viewMode === 'both') window.browserApi.toggleChat();
      }}
      // Sending from the one-row bar opens the chat so the reply is visible.
      onSent={() => {
        if (!full && viewMode === 'both') window.browserApi.toggleChat();
      }}
    />
  ) : null;
  // Only the chat is showing and nothing has been said yet.
  const showNew = chatOnly && chat !== undefined && chat.messageCount === 0;

  return (
    <section
      ref={regionRef}
      aria-label="Chat"
      style={{
        position: 'fixed',
        left: 'var(--left)',
        right: `calc(${RAIL_WIDTH}px + var(--panel))`,
        bottom: 0,
        height: 'var(--chat)',
        boxSizing: 'border-box',
        padding: `0 ${PAGE_INSET}px ${PAGE_INSET}px`,
      }}
    >
      <div
        className={[
          full ? 'chat-card' : 'chat-card is-compact',
          dropping ? 'is-dropping' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        // An artifact dragged from the Artifacts panel, a tab, Space or artifact
        // dragged from the sidebar, or files dragged in from the computer, are added
        // to the chat.
        onDragOver={(event) => {
          if (
            !hasArtifactDrag(event.dataTransfer.types) &&
            !hasItemDrag(event.dataTransfer.types) &&
            !hasFileDrag(event.dataTransfer.types)
          ) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          if (!dropping) setDropping(true);
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setDropping(false);
          }
        }}
        onDrop={(event) => {
          setDropping(false);
          if (hasFileDrag(event.dataTransfer.types)) {
            event.preventDefault();
            if (
              chats.activeId !== null &&
              event.dataTransfer.files.length > 0
            ) {
              void window.browserApi.chatAttachFiles(
                chats.activeId,
                Array.from(event.dataTransfer.files),
              );
            }
            return;
          }
          if (hasItemDrag(event.dataTransfer.types)) {
            event.preventDefault();
            const item = readItemDrag(event.dataTransfer.getData(ITEM_DRAG));
            if (item !== null && chats.activeId !== null) {
              window.browserApi.chatLink(chats.activeId, item.kind, item.id);
            }
            return;
          }
          if (!hasArtifactDrag(event.dataTransfer.types)) return;
          event.preventDefault();
          const id = readArtifactDrag(
            event.dataTransfer.getData(ARTIFACT_DRAG),
          );
          if (id !== null && chats.activeId !== null) {
            window.browserApi.chatLink(chats.activeId, 'artifact', id);
          }
        }}
      >
        {/* With only the chat open, its name is shown up in the top strip
            and the chat list is in the sidebar, so no header is needed here. */}
        {full && !chatOnly && (
          <div className="chat-head reveal-host">
            <div style={{ flex: 1, minWidth: 0 }}>
              <ChatSwitcher
                chats={chats}
                renameRequest={renameRequest}
                onRenameHandled={onRenameHandled}
                compact={false}
              />
            </div>
            <IconButton
              icon="chev-d"
              size="sm"
              className="reveal"
              label="Shrink chat (Ctrl+J)"
              onClick={() => window.browserApi.toggleChat()}
            />
            {closeChat}
          </div>
        )}
        {showNew && chat && (
          <NewChatView
            chats={chats}
            chat={chat}
            spaces={spaces}
            box={composer}
          />
        )}
        {full && !showNew && (
          <MessageList
            chatId={chats.activeId}
            generating={chat?.generating ?? false}
            tabs={tabs}
            spaces={spaces}
            artifacts={artifacts}
            poppedOut={poppedOut}
          />
        )}
        {(full || chatOnly) && !showNew && barVisible && run && chat && (
          <RunBar
            run={run}
            onDismiss={() => setEndedFor(null)}
            onContinue={carryOn}
          />
        )}
        {limitVisible && !showNew && run?.limit && (
          <div className={full || chatOnly ? undefined : 'chat-live'}>
            <LimitBanner
              limit={run.limit}
              onContinue={carryOn}
              onDone={() => setEndedFor(null)}
            />
          </div>
        )}
        {chatOnly && !showNew && barVisible && run && workingOn && (
          <WorkingOnCard
            tab={workingOn}
            spaceName={
              spaces.find((space) => space.id === workingOn.spaceId)?.name ??
              null
            }
          />
        )}
        {!full && !chatOnly && barVisible && run && chat && (
          <div className="chat-live">
            <RunBar
              run={run}
              onDismiss={() => setEndedFor(null)}
              onContinue={carryOn}
            />
          </div>
        )}
        {!full && !chatOnly && !barVisible && !onPage.pill && live?.working && (
          <div className="chat-live" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span className="truncate">{live.text}</span>
          </div>
        )}
        {!full && !chatOnly && !barVisible && notice && (
          <div className="chat-live">
            <button
              type="button"
              className="chat-notice"
              role="status"
              title="Open the chat to read the reply"
              onClick={() => window.browserApi.toggleChat()}
            >
              <Icon name="check" />
              <span className="truncate">{notice}</span>
            </button>
          </div>
        )}
        {!showNew && composer}
      </div>
      {viewMode === 'both' && (
        <ResizeHandle
          kind="chat"
          axis="y"
          grows={-1}
          measure={() => regionRef.current?.offsetHeight ?? 0}
          title="Drag to resize. Drag all the way down to shrink to one line."
          style={{
            position: 'absolute',
            top: 0,
            left: PAGE_INSET,
            right: PAGE_INSET,
            height: 8,
          }}
        />
      )}
    </section>
  );
}
