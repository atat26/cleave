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
import { clipboard, ipcMain, Menu } from 'electron';
import type { BrowserWindow } from 'electron';
import { createAgentTools } from './agentTools';
import type { ActionEnv, OutlineRead, PageRead } from './agentTools';
import { readLinkText } from './linkReader';
import type { OutlineElement } from './pageOutline';
import { buildLinkedContext, linkedTabs, snapshotLookup } from './chatLinks';
import type { Workspace } from './chatLinks';
import { createChatRunner } from './chatRunner';
import type { RunContext } from './chatRunner';
import * as chats from './chats';
import type { ChatsState } from './chats';
import type { LlmContext } from './llm';
import { ChatError, streamChat } from './openrouter';
import type { SearchContext } from './search';
import type { ApprovalLevel } from './toolPolicy';
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
  // Send the UI the messages that have @ mentions or attached pages again (their
  // tokens changed, for example after a closed page was reopened).
  refreshMentions(): void;
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
  // How much a tool may do without asking (your choice in the Tools panel).
  toolLevel(tool: string): ApprovalLevel;
  // Web search (set up in Settings).
  search: Promise<SearchContext | null>;

  // Save the chats, without refreshing the whole UI (this runs for every piece
  // of a streaming reply).
  setChats(next: ChatsState): void;
  // The chat list's information changed (a title, a model, who is generating).
  onMeta(): void;
  openSettings(): void;
  // Show a menu without letting the sidebar close under it.
  popupMenu(menu: Menu): void;
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
    stream: async function* ({ model, messages, tools, signal }) {
      const apiKey = llm?.getApiKey() ?? null;
      if (llm === null || apiKey === null) throw new ChatError('auth');
      yield* streamChat({
        apiKey,
        model,
        messages,
        tools,
        signal,
        fetchImpl: llm.fetchImpl,
      });
    },
    now: Date.now,
    onMessage: markDirty,
    onRunningChange: () => {
      flush();
      options.onMeta();
    },
  });

  // What to use for a chat, or why we cannot send yet.
  function contextFor(
    chatId: number,
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
            readPage: options.readPage,
            outlinePage: options.outlinePage,
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
        )
      : null;
    return {
      ok: true,
      context: {
        model,
        systemPrompt: settings.systemPrompt,
        linked: buildLinkedContext(refs, workspace, canRead),
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

  ipcMain.handle(
    'chat:send',
    (
      event,
      chatId: unknown,
      text: unknown,
      mentions: unknown,
    ): ChatSendResult => {
      if (!fromUi(event)) throw new Error('Not allowed.');
      if (!isId(chatId) || typeof text !== 'string') return invalid;
      const prepared = contextFor(chatId);
      if (!prepared.ok) return prepared;
      const started = runner.send(
        chatId,
        text,
        prepared.context,
        sanitizeMentions(mentions),
      );
      if (started.ok) {
        options.onMeta(); // The first message may have named the chat.
        // The reply is written in the background; failures end up in the chat.
        void started.done;
      }
      return answer(started);
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
        void started.done;
      }
      return answer(started);
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

  // The model switcher: your pinned models, with this chat's current one ticked.
  const onModelMenu = (event: Electron.IpcMainEvent, chatId: unknown) => {
    if (!fromUi(event) || !isId(chatId) || llm === null) return;
    const chat = chats.findConversation(options.getChats(), chatId);
    if (!chat) return;
    const settings = llm.getSettings();
    const current = chat.model ?? settings.model;
    // Show the current model even if it is not pinned, so it is clear what is in use.
    const choices = [...settings.pinned];
    if (current && !choices.includes(current)) choices.unshift(current);

    const pick = (id: string) => () => {
      options.setChats(
        chats.setConversationModel(options.getChats(), chatId, id),
      );
      options.onMeta();
    };
    const label = (id: string) => id.replace(/&/g, '&&');

    options.popupMenu(
      Menu.buildFromTemplate([
        ...choices.map((id) => ({
          label: label(id),
          type: 'radio' as const,
          checked: id === current,
          click: pick(id),
        })),
        ...(choices.length > 0 ? [{ type: 'separator' as const }] : []),
        {
          label: 'Pin more models in Settings…',
          click: () => options.openSettings(),
        },
      ]),
    );
  };

  ipcMain.on('chat:stop', onStop);
  ipcMain.on('chat:decide', onDecide);
  ipcMain.on('chat:copy', onCopy);
  ipcMain.on('chat:model-menu', onModelMenu);

  return {
    runningChats: () => runner.runningChats(),
    stop: (chatId) => runner.stop(chatId),
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
      ipcMain.removeListener('chat:stop', onStop);
      ipcMain.removeListener('chat:decide', onDecide);
      ipcMain.removeListener('chat:copy', onCopy);
      ipcMain.removeListener('chat:model-menu', onModelMenu);
    },
  };
}
