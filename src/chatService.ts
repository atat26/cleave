// The chat's connection to the model, in the main process. It lets the UI send a
// message, stop or retry a reply, and follow the reply as it streams in. The
// real work is done by the tested runner (chatRunner.ts); this file connects it
// to Electron.
//
// Safety rules:
//   - Only the window's own UI page may ask, and everything it sends is checked
//     (ids, text type and length).
//   - The API key is read at the moment of a call and handed straight to the
//     network request. It never reaches the UI.
//   - Model replies are only ever sent on as plain text; nothing here turns them
//     into markup.
import type { StepTarget } from './marker';
import { clipboard, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { createAgentTools } from './agentTools';
import { chatHasReadWeb } from './webSeen';
import type { ActionEnv, OutlineRead, PageRead } from './agentTools';
import { readLinkText } from './linkReader';
import type { OutlineElement } from './pageOutline';
import {
  buildLinkedContext,
  closedLinkedTabs,
  linkedArtifacts,
  linkedSpaces,
  linkedTabs,
  snapshotLookup,
} from './chatLinks';
import type { ArtifactKind } from './artifacts';
import type { FileReading } from './artifactTools';
import type { FindRead, ShotRead, TablesRead } from './pageEyes';
import type { TabsEnv } from './tabTools';
import type { RecallEnv } from './recallTools';
import type { BookmarkResult, PreviewCheck, SaveResult } from './saveTools';
import { loadedSkills, skillsContext } from './skillTools';
import type { SkillsEnv } from './skillTools';
import {
  messageMenuItems,
  modelMenuItems,
  parseMessageChoice,
  parseModelChoice,
} from './menuData';
import type { MenuItem } from './menuTypes';
import type { Workspace } from './chatLinks';
import { createChatRunner } from './chatRunner';
import type { RunContext } from './chatRunner';
import * as chats from './chats';
import type { ChatsState } from './chats';
import type { Namer } from './aiNamer';
import type { NameResult } from './naming';
import type { LlmContext } from './llm';
import { ChatError, streamChat } from './openrouter';
import { scopedRecall, scopedTabs, testScope } from './testScope';
import { groupsForMessage, groupsUsed } from './toolGroups';
import { howToWork, unsentMessages } from './chatContext';
import { planningEnabled } from './taskPlan';
import type { SearchContext } from './search';
import type { ApprovalLevel } from './toolPolicy';
import { devEnv } from './devEnv';
import { normalizeSite } from './siteTrust';
import type { SiteTrust } from './siteTrust';
import { SearchError } from './webSearch';
import type { ChatSendResult } from './types';

const isId = (value: unknown): value is number => Number.isInteger(value);

// How often a streaming reply is passed on to the screen (about 30 times a second,
// so a fast reply does not make the UI jump or lag).
const UI_UPDATE_MS = 33;
const MAX_COPY_CHARS = 200_000;

const REASON_TEXT = {
  busy: 'A reply is already being written in this chat.',
  empty: 'Type a message first.',
  'unknown-chat': 'That chat no longer exists.',
  'nothing-to-retry': 'There is nothing to retry.',
} as const;

export interface ChatService {
  // Which chats are being written to right now.
  runningChats(): number[];
  // Stop a chat's reply (used when the chat is deleted).
  stop(chatId: number): void;
  // Answer a step that is waiting for your approval (the card popped out over the page).
  decide(
    chatId: number,
    messageId: number,
    partId: number,
    decision: 'allow' | 'allow-rest' | 'deny',
  ): void;
  // "Trust this site" on a waiting card (popped out over the page): trusts the site the card names
  // and allows the step. False if the card is not waiting or names no site.
  trustSiteOfCard(chatId: number, messageId: number, partId: number): boolean;
  // Send a message in a chat from inside the app (the new-tab page's Ask).
  sendMessage(chatId: number, text: string, mentions?: unknown): ChatSendResult;
  // Send the UI the messages that have @ mentions or attached pages again (their
  // tokens changed, for example after a closed page was reopened).
  refreshMentions(): void;
  // Name a chat with the model (the "name it with AI" button and menu entry).
  nameChat(chatId: number): Promise<NameResult>;
  // Stop everything and unhook from the window.
  dispose(): void;
}

export function createChatService(options: {
  win: BrowserWindow;
  llm: Promise<LlmContext | null>;
  getChats(): ChatsState;
  // The Spaces and tabs, for building what a chat's links tell the model.
  getWorkspace(): Workspace;
  // Read a tab's text for the assistant (read-only; see pageReader.ts).
  readPage(tabId: number, signal: AbortSignal): Promise<PageRead>;
  // Look at a tab's controls (the numbered outline).
  outlinePage(tabId: number, signal: AbortSignal): Promise<OutlineRead>;
  // The skills (see skills.ts and skillTools.ts).
  skillStore: SkillsEnv;
  // Saving a page, bookmarking it, and checking an HTML artifact (see saveTools.ts).
  // Saving also links the new artifact to the chat.
  saveStore: {
    savePage(
      chatId: number,
      tabId: number,
      what: 'page' | 'selection',
      title: string | null,
      spaceId: number | null,
      signal: AbortSignal,
    ): Promise<SaveResult>;
    bookmarkPage(tabId: number, signal: AbortSignal): Promise<BookmarkResult>;
    checkPreview(
      artifactId: number,
      signal: AbortSignal,
    ): Promise<PreviewCheck>;
  };
  // What the assistant can look up: your history, bookmarks and earlier chats (see
  // recallTools.ts).
  recallStore: Omit<RecallEnv, 'currentChatId'>;
  // The assistant's tab and Space tools (see tabTools.ts).
  tabStore: Omit<TabsEnv, 'linkedSpaces'>;
  // More ways to look at a tab (read-only; see pageEyes.ts).
  screenshotPage(tabId: number, signal: AbortSignal): Promise<ShotRead>;
  findInPage(
    tabId: number,
    text: string,
    signal: AbortSignal,
  ): Promise<FindRead>;
  readTables(tabId: number, signal: AbortSignal): Promise<TablesRead>;
  // The full address a numbered link on a tab goes to (or null).
  linkAddress(
    tabId: number,
    control: OutlineElement,
    signal: AbortSignal,
  ): Promise<string | null>;
  // Doing things in a tab (click, type, ...). Every one is approved by you first.
  actions: ActionEnv;
  // Link a tab to a chat (used for tabs the assistant opens).
  linkTab(chatId: number, tabId: number): void;
  // The artifact store, for the assistant's artifact tools. Making one also links
  // it to the chat; changing one lets an open editor know.
  artifactStore: {
    read(
      id: number,
    ): { title: string; kind: ArtifactKind; content: string } | null;
    // An uploaded image or PDF: a PDF's text, or a picture ready to show the model.
    readFile(id: number): Promise<FileReading>;
    create(
      chatId: number,
      input: {
        title: string;
        kind: ArtifactKind;
        content: string;
        emoji: string | null;
        spaceId: number | null;
      },
    ):
      | { ok: true; id: number }
      | { ok: false; reason: 'too-many' | 'too-long' | 'bad-kind' };
    update(
      id: number,
      changes: { title?: string; content?: string; emoji?: string },
    ): { ok: true } | { ok: false; reason: 'not-found' | 'too-long' };
  };
  // Making a Space for the assistant's create_space tool; the app links it to the
  // chat too.
  spaceStore: {
    create(
      chatId: number,
      input: { name: string; emoji: string | null; color: string | null },
    ): { ok: true; id: number } | { ok: false; reason: 'too-many' };
  };
  // How much a tool may do without asking (your choice in the Tools panel).
  toolLevel(tool: string): ApprovalLevel;
  // What the assistant may do on a site you have trusted or blocked (see siteTrust.ts), and the way
  // a card's "Trust this site" button makes a site trusted. Only you can: nothing here is a tool.
  siteTrust(host: string): SiteTrust;
  trustSite(host: string): void;
  // Web search (set up in Settings).
  search: Promise<SearchContext | null>;

  // Names things with the model, and whether new chats are named on their own.
  namer: Namer;
  autoName(): boolean;

  // Save the chats, without refreshing the whole UI (this runs for every piece
  // of a streaming reply).
  setChats(next: ChatsState): void;
  // The chat list's information changed (a title, a model, who is generating).
  onMeta(): void;
  // A reply changed (as the window is told about it): what the page overlay follows.
  onReplyChanged?(chatId: number, message: chats.ChatMessage): void;
  // A step acts on an element of a page (see chatRunner.ts).
  onStepTarget?(
    chatId: number,
    messageId: number,
    partId: number,
    target: StepTarget,
  ): void;
  // A step took a picture of a page (see chatRunner.ts).
  onPicture?(
    chatId: number,
    messageId: number,
    partId: number,
    picture: { mime: string; data: string },
  ): void;
  openSettings(): void;
  // Show a menu in the popup layer at a place in the window; `choose` gets the
  // id of the item picked. The keyboard goes back to `opener` afterwards.
  showMenu(
    items: MenuItem[],
    x: number,
    y: number,
    choose: (id: string) => void,
    opener: Electron.WebContents,
    alignCenter?: number,
  ): void;
}): ChatService {
  const { win } = options;

  let llm: LlmContext | null = null;
  void options.llm.then((context) => {
    llm = context;
  });
  let searchContext: SearchContext | null = null;
  void options.search.then((context) => {
    searchContext = context;
  });

  // ---- Telling the UI about messages, a bit at a time ------------------------

  const dirty = new Map<string, [number, number]>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const [chatId, messageId] of dirty.values()) {
      const message = chats.findMessage(options.getChats(), chatId, messageId);
      if (message && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('chat:message', { chatId, message });
      }
      if (message) options.onReplyChanged?.(chatId, message);
    }
    dirty.clear();
  };

  const markDirty = (chatId: number, messageId: number) => {
    dirty.set(`${chatId}:${messageId}`, [chatId, messageId]);
    if (timer === null) timer = setTimeout(flush, UI_UPDATE_MS);
  };

  // The addresses of earlier search results in a chat, so reading one of them
  // counts as reading a known address. Only the address at the end of each result
  // line is taken (a page's title could contain text that looks like an address).
  const rememberedAddresses = (chatId: number): string[] => {
    const found: string[] = [];
    // Closed pages the chat links to are known addresses too.
    const linkRefs =
      chats.findConversation(options.getChats(), chatId)?.refs ?? [];
    for (const tab of closedLinkedTabs(linkRefs, options.getWorkspace())) {
      found.push(tab.url);
    }
    const messages =
      chats.findConversation(options.getChats(), chatId)?.messages ?? [];
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== 'tool' || part.name !== 'web_search') continue;
        for (const hit of part.details.matchAll(
          /^\[\d+\] .* - (https?:\/\/\S+)$/gm,
        )) {
          found.push(hit[1]);
        }
      }
    }
    return found.slice(-200);
  };

  // ---- The runner ---------------------------------------------------------------

  // ---- Asking you to approve what the assistant wants to do ----------------------

  // Waiting approvals: the chat, reply and call each one is for.
  const pending = new Map<
    string,
    (decision: 'allow' | 'allow-rest' | 'deny') => void
  >();
  const key = (chatId: number, messageId: number, partId: number) =>
    `${chatId}:${messageId}:${partId}`;

  // The runner has put the question in the chat (the call is marked "waiting");
  // now wait for your answer. Stop (or anything that aborts) counts as "no".
  const confirm = (
    request: { chatId: number; messageId: number; partId: number },
    signal: AbortSignal,
  ) =>
    new Promise<'allow' | 'allow-rest' | 'deny'>((resolve) => {
      const id = key(request.chatId, request.messageId, request.partId);
      const finish = (decision: 'allow' | 'allow-rest' | 'deny') => {
        pending.delete(id);
        signal.removeEventListener('abort', onAbort);
        resolve(decision);
      };
      const onAbort = () => finish('deny');
      pending.set(id, finish);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort);
    });

  const runner = createChatRunner({
    getState: options.getChats,
    setState: options.setChats,
    confirm,
    stream: async function* ({ model, messages, tools, maxTokens, signal }) {
      const apiKey = llm?.getApiKey() ?? null;
      if (llm === null || apiKey === null) throw new ChatError('auth');
      yield* streamChat({
        apiKey,
        model,
        messages,
        tools,
        maxTokens,
        signal,
        fetchImpl: llm.fetchImpl,
      });
    },
    now: Date.now,
    onMessage: markDirty,
    onStepTarget: (chatId, messageId, partId, target) =>
      options.onStepTarget?.(chatId, messageId, partId, target),
    onPicture: (chatId, messageId, partId, picture) =>
      options.onPicture?.(chatId, messageId, partId, picture),
    onRunningChange: () => {
      flush();
      options.onMeta();
    },
  });

  // What to use for a chat, or why we cannot send yet.
  function contextFor(
    chatId: number,
    // The message being sent right now (it is not in the chat yet when this is worked out).
    pendingText?: string,
  ):
    | { ok: true; context: RunContext }
    | Extract<ChatSendResult, { ok: false }> {
    if (llm === null || !llm.hasKey()) {
      return {
        ok: false,
        kind: 'no-key',
        error: 'Add your OpenRouter key in Settings first.',
      };
    }
    const settings = llm.getSettings();
    const chat = chats.findConversation(options.getChats(), chatId);
    const model = chat?.model ?? settings.model;
    if (!model) {
      return {
        ok: false,
        kind: 'no-model',
        error: 'Choose a model in Settings first.',
      };
    }
    // What the chat's links tell the model, built fresh from the current Spaces
    // and tabs (titles and cleaned addresses only). First bring each link's
    // remembered name up to date.
    const workspace = options.getWorkspace();
    options.setChats(
      chats.refreshRefs(options.getChats(), snapshotLookup(workspace)),
    );
    const refs = chats.findConversation(options.getChats(), chatId)?.refs ?? [];

    // The assistant may use its tools unless the model is known to lack tool
    // support. (An unknown model is tried: if it
    // cannot, the provider says so and the chat shows the error.)
    // The tools are there even when nothing is linked: the assistant can always
    // open a new tab (which is then linked to the chat).
    const canRead = llm.getModelInfo(model)?.supportsTools !== false;
    const seesImages = llm.getModelInfo(model)?.supportsImages !== false;
    // Test runs only (AIB_TEST_SCOPE=1): the tools see just the test fixtures (see testScope.ts).
    const recallStore = testScope
      ? scopedRecall(options.recallStore)
      : options.recallStore;
    const tabStore = testScope
      ? scopedTabs(testScope, options.tabStore)
      : options.tabStore;
    // Which tools to send: the core, the groups the latest message points to, and the groups
    // already used in this chat (see toolGroups.ts). AIB_ALL_TOOLS=1 sends them all (to compare).
    const conversation = chats.findConversation(options.getChats(), chatId);
    const lastUser =
      pendingText ??
      [...(conversation?.messages ?? [])]
        .reverse()
        .find((message) => message.role === 'user')?.content ??
      '';
    const open = new Set([
      ...groupsForMessage(lastUser),
      ...groupsUsed(
        (conversation?.messages ?? []).flatMap((message) =>
          message.parts.flatMap((part) =>
            part.type === 'tool' ? [part.name] : [],
          ),
        ),
      ),
    ]);
    const routing = { open, everything: devEnv('AIB_ALL_TOOLS') === '1' };
    const tools = canRead
      ? createAgentTools(
          {
            // Looked up again at each use, so a link removed mid-reply stops
            // counting at once.
            linkedTabs: () =>
              linkedTabs(
                chats.findConversation(options.getChats(), chatId)?.refs ?? [],
                options.getWorkspace(),
              ),
            // Looked up again at each use, so a change you make mid-reply counts at once.
            siteTrust: (host: string) => options.siteTrust(host),
            // Any earlier reply in this chat that read the web (a skill outlives the reply).
            webSeenInChat: () =>
              chatHasReadWeb(
                (
                  chats.findConversation(options.getChats(), chatId)
                    ?.messages ?? []
                ).flatMap((message) =>
                  message.parts.flatMap((part) =>
                    part.type === 'tool' ? [part] : [],
                  ),
                ),
              ),
            // The artifacts and Spaces the chat links to, as they are now.
            linkedArtifacts: () =>
              linkedArtifacts(
                chats.findConversation(options.getChats(), chatId)?.refs ?? [],
                options.getWorkspace(),
              ),
            linkedSpaces: () =>
              linkedSpaces(
                chats.findConversation(options.getChats(), chatId)?.refs ?? [],
                options.getWorkspace(),
              ),
            readArtifact: options.artifactStore.read,
            readFile: options.artifactStore.readFile,
            // An unknown model is tried: if it cannot see, the provider says so.
            canSeeImages: () => seesImages,
            createArtifact: (input) =>
              options.artifactStore.create(chatId, input),
            updateArtifact: options.artifactStore.update,
            createSpace: (input) => {
              const made = options.spaceStore.create(chatId, input);
              if (testScope && made.ok) testScope.created.add(made.id);
              return made;
            },
            readPage: options.readPage,
            outlinePage: options.outlinePage,
            listSkills: options.skillStore.listSkills,
            readSkill: options.skillStore.readSkill,
            makeSkill: options.skillStore.makeSkill,
            changeSkill: options.skillStore.changeSkill,
            savePage: (tabId, what, title, spaceId, signal) =>
              options.saveStore.savePage(
                chatId,
                tabId,
                what,
                title,
                spaceId,
                signal,
              ),
            bookmarkPage: options.saveStore.bookmarkPage,
            checkPreview: options.saveStore.checkPreview,
            currentChatId: () => chatId,
            // What is left out of what is sent in this chat (see chatContext.ts).
            unsentMessages: () =>
              unsentMessages(
                chats.findConversation(options.getChats(), chatId)?.messages ??
                  [],
              ).map((message) => ({
                role: message.role,
                text: message.content,
              })),
            now: recallStore.now,
            searchHistory: recallStore.searchHistory,
            searchBookmarks: recallStore.searchBookmarks,
            searchChats: recallStore.searchChats,
            readChat: recallStore.readChat,
            allTabs: tabStore.allTabs,
            allSpaces: tabStore.allSpaces,
            moveTab: tabStore.moveTab,
            closeTab: tabStore.closeTab,
            sleepTab: tabStore.sleepTab,
            reopenTab: tabStore.reopenTab,
            spaceNote: tabStore.spaceNote,
            setSpaceNote: tabStore.setSpaceNote,
            screenshotPage: options.screenshotPage,
            findInPage: options.findInPage,
            readTables: options.readTables,
            linkAddress: options.linkAddress,
            readLink: (url, signal) => readLinkText(url, signal),
            rememberedAddresses: () => rememberedAddresses(chatId),
            searchReady: () => searchContext?.ready() ?? false,
            webSearch: async (query, signal) => {
              if (!searchContext) return { ok: false, reason: 'no-key' };
              try {
                return {
                  ok: true,
                  results: await searchContext.search(query, signal),
                };
              } catch (error) {
                if (error instanceof SearchError) {
                  return { ok: false, reason: error.kind };
                }
                if (signal.aborted) throw error; // Stop was pressed.
                return { ok: false, reason: 'unknown' };
              }
            },
            ...options.actions,
            // A tab the assistant opens is linked to this chat, so it can use it.
            openTab: async (url, signal) => {
              const opened = await options.actions.openTab(url, signal);
              if (opened.ok) options.linkTab(chatId, opened.tabId);
              return opened;
            },
          },
          options.toolLevel,
          routing,
        )
      : null;
    return {
      ok: true,
      context: {
        model,
        systemPrompt: settings.systemPrompt,
        // The rules are about using tools, so a model without tools does not get them.
        rules: canRead
          ? howToWork(planningEnabled() && open.has('plan'))
          : null,
        // The assistant can look up the start of a long chat when it was left out.
        canLookUpStart:
          canRead && options.toolLevel('earlier_in_this_chat') !== 'never',
        linked: buildLinkedContext(refs, workspace, canRead),
        // Skills are listed only when the model can use tools (it needs use_skill).
        // A skill you name as "/Name" has its steps put in right here, so it costs no extra step.
        skills: canRead
          ? skillsContext(
              options.skillStore.listSkills(),
              loadedSkills(
                lastUser,
                options.skillStore.listSkills(),
                options.skillStore.readSkill,
              ),
            )
          : null,
        tools,
      },
    };
  }

  const answer = (started: ReturnType<typeof runner.send>): ChatSendResult =>
    started.ok
      ? { ok: true }
      : { ok: false, kind: started.reason, error: REASON_TEXT[started.reason] };

  // ---- Requests from the UI ---------------------------------------------------------

  const fromUi = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    event.sender === win.webContents;

  const invalid: ChatSendResult = {
    ok: false,
    kind: 'invalid',
    error: 'That request was not understood.',
  };

  // The "@" mentions sent with a message, from the (untrusted) page: only the
  // shape is checked here; chats.ts checks they are really linked to the chat.
  const sanitizeMentions = (raw: unknown) =>
    Array.isArray(raw)
      ? raw.flatMap((m) =>
          typeof m === 'object' &&
          m !== null &&
          isId((m as { id?: unknown }).id) &&
          typeof (m as { kind?: unknown }).kind === 'string' &&
          typeof (m as { tag?: unknown }).tag === 'string'
            ? [
                {
                  kind: (m as { kind: string }).kind,
                  id: (m as { id: number }).id,
                  tag: (m as { tag: string }).tag,
                },
              ]
            : [],
        )
      : [];

  ipcMain.handle('chat:messages', (event, chatId: unknown) => {
    if (!fromUi(event)) throw new Error('Not allowed.');
    if (!isId(chatId)) return [];
    return chats.findConversation(options.getChats(), chatId)?.messages ?? [];
  });

  // ---- Naming a chat with the model ---------------------------------------------

  // Chats being named right now (one request each at a time).
  const naming = new Set<number>();

  // Ask the model for a name and an emoji for a chat and apply them. `force` is the
  // "name it with AI" button: it replaces a name or emoji you chose yourself;
  // otherwise (automatic naming) what you chose is left alone.
  const nameChat = async (
    chatId: number,
    force: boolean,
  ): Promise<NameResult> => {
    const chat = chats.findConversation(options.getChats(), chatId);
    if (!chat) return { ok: false, error: 'That chat no longer exists.' };
    if (naming.has(chatId)) {
      return { ok: false, error: 'Already naming this chat.' };
    }
    naming.add(chatId);
    try {
      const result = await options.namer(
        'chat',
        chats.chatNamingMaterial(chat),
        chat.model,
      );
      if (result.ok) {
        // The chat may have been deleted while the model was thinking.
        const next = chats.applyAiName(
          options.getChats(),
          chatId,
          result,
          force,
        );
        options.setChats(next);
        options.onMeta();
      }
      return result;
    } finally {
      naming.delete(chatId);
    }
  };

  // A chat's first message (sent, or retried) names the chat, if you want that.
  const autoNameFirst = (chatId: number) => {
    const chat = chats.findConversation(options.getChats(), chatId);
    if (!options.autoName() || !chat || !chats.isFirstExchange(chat)) return;
    if (chat.titleByUser && chat.emojiByUser) return;
    void nameChat(chatId, false);
  };

  ipcMain.handle('chat:name-ai', (event, chatId: unknown) => {
    if (!fromUi(event)) throw new Error('Not allowed.');
    if (!isId(chatId))
      return { ok: false, error: 'That chat no longer exists.' };
    return nameChat(chatId, true);
  });

  // Send a message in a chat and start the reply (from the chat's own box, or from
  // inside the app, like the new-tab page's Ask).
  const sendMessage = (
    chatId: unknown,
    text: unknown,
    mentions: unknown,
  ): ChatSendResult => {
    if (!isId(chatId) || typeof text !== 'string') return invalid;
    // Too long to send (the box used to say "Type a message first", which was wrong).
    if (text.trim().length > chats.MAX_USER_CHARS) {
      return {
        ok: false,
        kind: 'too-long',
        error: `That message is too long (over ${chats.MAX_USER_CHARS.toLocaleString('en-US')} characters). Shorten it, or attach the text as a file.`,
      };
    }
    const prepared = contextFor(chatId, text);
    if (!prepared.ok) return prepared;
    const started = runner.send(
      chatId,
      text,
      prepared.context,
      sanitizeMentions(mentions),
    );
    if (started.ok) {
      options.onMeta(); // The first message may have named the chat.
      autoNameFirst(chatId);
      // The reply is written in the background; failures end up in the chat.
      void started.done;
    }
    return answer(started);
  };

  ipcMain.handle(
    'chat:send',
    (
      event,
      chatId: unknown,
      text: unknown,
      mentions: unknown,
    ): ChatSendResult => {
      if (!fromUi(event)) throw new Error('Not allowed.');
      return sendMessage(chatId, text, mentions);
    },
  );

  // Tell the screen to load a chat's messages again (some were removed).
  const resetChat = (chatId: number) => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('chat:reset', chatId);
    }
  };

  ipcMain.handle(
    'chat:retry',
    (event, chatId: unknown, messageId: unknown): ChatSendResult => {
      if (!fromUi(event)) throw new Error('Not allowed.');
      if (!isId(chatId)) return invalid;
      if (messageId !== undefined && !isId(messageId)) return invalid;
      const prepared = contextFor(chatId);
      if (!prepared.ok) return prepared;

      // Only your newest message can be retried (its reply is replaced). An older
      // one can be branched into a new chat instead.
      if (messageId !== undefined) {
        const messages =
          chats.findConversation(options.getChats(), chatId)?.messages ?? [];
        const newest = [...messages].reverse().find((m) => m.role === 'user');
        if (!newest || newest.id !== messageId) {
          return {
            ok: false,
            kind: 'nothing-to-retry',
            error:
              'Only your newest message can be retried. Branch an older one instead.',
          };
        }
      }

      const started = runner.retry(chatId, prepared.context, messageId);
      if (started.ok) {
        resetChat(chatId);
        // Retrying the first message tries for a better name too.
        autoNameFirst(chatId);
        void started.done;
      }
      return answer(started);
    },
  );

  // Change one of your messages and send it again. Your newest message is changed
  // where it is (its reply is replaced). An older one is changed in a NEW chat that
  // starts from everything before it, so this chat stays exactly as it was.
  ipcMain.handle(
    'chat:edit',
    (
      event,
      chatId: unknown,
      messageId: unknown,
      text: unknown,
    ): ChatSendResult => {
      if (!fromUi(event)) throw new Error('Not allowed.');
      if (!isId(chatId) || !isId(messageId) || typeof text !== 'string') {
        return invalid;
      }
      const chat = chats.findConversation(options.getChats(), chatId);
      const message = chat?.messages.find((m) => m.id === messageId);
      if (!chat || !message || message.role !== 'user') return invalid;
      const content = text.trim();
      if (content === '' || content.length > chats.MAX_USER_CHARS) {
        return {
          ok: false,
          kind: 'empty',
          error:
            content === ''
              ? 'The message is empty.'
              : 'That message is too long.',
        };
      }
      // Cannot send (no key, no model)? Then change nothing.
      const prepared = contextFor(chatId);
      if (!prepared.ok) return prepared;

      const newest = [...chat.messages]
        .reverse()
        .find((m) => m.role === 'user');
      if (newest?.id === messageId) {
        if (runner.runningChats().includes(chatId)) {
          return { ok: false, kind: 'busy', error: REASON_TEXT.busy };
        }
        const edited = chats.editUserMessage(
          options.getChats(),
          chatId,
          messageId,
          content,
        );
        if (!edited) return invalid;
        options.setChats(edited);
        const started = runner.retry(chatId, prepared.context, messageId);
        if (started.ok) {
          resetChat(chatId);
          autoNameFirst(chatId);
          void started.done;
        }
        return answer(started);
      }

      const branched = chats.branchBeforeMessage(
        options.getChats(),
        chatId,
        messageId,
        Date.now(),
      );
      if (!branched) {
        return {
          ok: false,
          kind: 'nothing-to-retry',
          error: 'That message cannot be edited.',
        };
      }
      options.setChats(branched.state);
      options.onMeta(); // Switch to the new chat.
      const mentions = message.mentions
        .filter((m) => m.tag !== '' && content.includes(m.tag))
        .map((m) => ({ kind: m.kind, id: m.id, tag: m.tag }));
      return sendMessage(branched.id, content, mentions);
    },
  );

  // Start a new chat from an earlier message of yours (that message and its
  // reply are copied; nothing is sent to the model). The chat it came from is
  // left exactly as it was.
  ipcMain.handle(
    'chat:branch',
    (event, chatId: unknown, messageId: unknown): ChatSendResult => {
      if (!fromUi(event)) throw new Error('Not allowed.');
      if (!isId(chatId) || !isId(messageId)) return invalid;
      const branched = chats.branchConversation(
        options.getChats(),
        chatId,
        messageId,
        Date.now(),
      );
      if (!branched) {
        return {
          ok: false,
          kind: 'nothing-to-retry',
          error: 'That message cannot be branched.',
        };
      }
      options.setChats(branched.state);
      options.onMeta(); // Switch to the new chat.
      return { ok: true };
    },
  );

  // Your answer to an approval card. Only for a question that is really waiting.
  const onDecide = (
    event: Electron.IpcMainEvent,
    chatId: unknown,
    messageId: unknown,
    partId: unknown,
    decision: unknown,
  ) => {
    if (
      !fromUi(event) ||
      !isId(chatId) ||
      !isId(messageId) ||
      !isId(partId) ||
      (decision !== 'allow' && decision !== 'allow-rest' && decision !== 'deny')
    ) {
      return;
    }
    pending.get(key(chatId, messageId, partId))?.(decision);
  };

  // "Trust this site" on a card: the site is the one the card names (read here from the waiting
  // step, never from what the page sent), and the step is allowed. Only for a question that is
  // really waiting. Returns whether it was done.
  const trustFromCard = (
    chatId: number,
    messageId: number,
    partId: number,
  ): boolean => {
    const answer = pending.get(key(chatId, messageId, partId));
    if (!answer) return false;
    const part = chats
      .findConversation(options.getChats(), chatId)
      ?.messages.find((m) => m.id === messageId)
      ?.parts.find((p) => p.type === 'tool' && p.id === partId);
    const site =
      part?.type === 'tool' && part.status === 'waiting'
        ? part.card?.site
        : undefined;
    // Only a site written the way the browser writes it; a card that names none offers no trust.
    if (site === undefined || normalizeSite(site) !== site) return false;
    options.trustSite(site);
    answer('allow');
    return true;
  };
  const onTrustSite = (
    event: Electron.IpcMainEvent,
    chatId: unknown,
    messageId: unknown,
    partId: unknown,
  ) => {
    if (fromUi(event) && isId(chatId) && isId(messageId) && isId(partId)) {
      trustFromCard(chatId, messageId, partId);
    }
  };

  const onStop = (event: Electron.IpcMainEvent, chatId: unknown) => {
    if (fromUi(event) && isId(chatId)) runner.stop(chatId);
  };
  const onCopy = (event: Electron.IpcMainEvent, text: unknown) => {
    if (
      fromUi(event) &&
      typeof text === 'string' &&
      text.length <= MAX_COPY_CHARS
    ) {
      clipboard.writeText(text);
    }
  };

  // The menu of a message: copy it (or the part selected), and for one of yours
  // retry it or branch from it. Retry and branch are done by the chat on screen
  // (it already knows how to show their results), so it is told which was chosen.
  const onMessageMenu = (
    event: Electron.IpcMainEvent,
    chatId: unknown,
    messageId: unknown,
    x: unknown,
    y: unknown,
    selection: unknown,
  ) => {
    if (!fromUi(event) || !isId(chatId) || !isId(messageId)) return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const messages =
      chats.findConversation(options.getChats(), chatId)?.messages ?? [];
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    const picked =
      typeof selection === 'string' && selection.trim() !== ''
        ? selection.slice(0, MAX_COPY_CHARS)
        : '';
    const newest = [...messages].reverse().find((m) => m.role === 'user');
    options.showMenu(
      messageMenuItems({
        role: message.role,
        hasSelection: picked !== '',
        isNewestUser: newest?.id === message.id,
        busy: runner.runningChats().includes(chatId),
      }),
      x,
      y,
      (id) => {
        const choice = parseMessageChoice(id);
        if (choice?.action === 'copy') {
          const text = picked || message.content;
          if (text.length <= MAX_COPY_CHARS) clipboard.writeText(text);
        } else if (choice && !event.sender.isDestroyed()) {
          event.sender.send('chat:message-action', {
            chatId,
            messageId,
            action: choice.action,
          });
        }
      },
      event.sender,
    );
  };

  // The model switcher: your pinned models, with this chat's current one ticked.
  const onModelMenu = (
    event: Electron.IpcMainEvent,
    chatId: unknown,
    x: unknown,
    y: unknown,
  ) => {
    if (!fromUi(event) || !isId(chatId) || llm === null) return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const chat = chats.findConversation(options.getChats(), chatId);
    if (!chat) return;
    const settings = llm.getSettings();
    const current = chat.model ?? settings.model;
    options.showMenu(
      modelMenuItems(settings.pinned, current),
      x,
      y,
      (id) => {
        const choice = parseModelChoice(id);
        if (choice?.action === 'pick') {
          options.setChats(
            chats.setConversationModel(
              options.getChats(),
              chatId,
              choice.model,
            ),
          );
          options.onMeta();
        } else if (choice?.action === 'settings') {
          options.openSettings();
        }
      },
      event.sender,
    );
  };

  ipcMain.on('chat:stop', onStop);
  ipcMain.on('chat:decide', onDecide);
  ipcMain.on('chat:trust-site', onTrustSite);
  ipcMain.on('chat:copy', onCopy);
  ipcMain.on('chat:model-menu', onModelMenu);
  ipcMain.on('chat:message-menu', onMessageMenu);

  return {
    runningChats: () => runner.runningChats(),
    sendMessage: (
      chatId: number,
      text: string,
      mentions: unknown = [],
    ): ChatSendResult => sendMessage(chatId, text, mentions),
    nameChat: (chatId) => nameChat(chatId, true),
    stop: (chatId) => runner.stop(chatId),
    decide: (chatId, messageId, partId, decision) => {
      pending.get(key(chatId, messageId, partId))?.(decision);
    },
    trustSiteOfCard: (chatId, messageId, partId) =>
      trustFromCard(chatId, messageId, partId),
    refreshMentions() {
      for (const chat of options.getChats().conversations) {
        for (const message of chat.messages) {
          if (message.mentions.length > 0) markDirty(chat.id, message.id);
        }
      }
    },
    dispose() {
      runner.stopAll();
      if (timer !== null) clearTimeout(timer);
      timer = null;
      ipcMain.removeHandler('chat:messages');
      ipcMain.removeHandler('chat:send');
      ipcMain.removeHandler('chat:retry');
      ipcMain.removeHandler('chat:branch');
      ipcMain.removeHandler('chat:edit');
      ipcMain.removeHandler('chat:name-ai');
      ipcMain.removeListener('chat:stop', onStop);
      ipcMain.removeListener('chat:decide', onDecide);
      ipcMain.removeListener('chat:trust-site', onTrustSite);
      ipcMain.removeListener('chat:copy', onCopy);
      ipcMain.removeListener('chat:model-menu', onModelMenu);
      ipcMain.removeListener('chat:message-menu', onMessageMenu);
    },
  };
}
