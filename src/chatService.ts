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
import type { PageRead } from './agentTools';
import { buildLinkedContext, linkedTabs, snapshotLookup } from './chatLinks';
import type { Workspace } from './chatLinks';
import { createChatRunner } from './chatRunner';
import type { RunContext } from './chatRunner';
import * as chats from './chats';
import type { ChatsState } from './chats';
import type { LlmContext } from './llm';
import { ChatError, streamChat } from './openrouter';
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

  // ---- The runner ---------------------------------------------------------------

  const runner = createChatRunner({
    getState: options.getChats,
    setState: options.setChats,
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

    // The assistant may read the linked pages if there are any to read and the
    // model is not known to lack tool support. (An unknown model is tried: if it
    // cannot, the provider says so and the chat shows the error.)
    const canRead =
      linkedTabs(refs, workspace).length > 0 &&
      llm.getModelInfo(model)?.supportsTools !== false;
    const tools = canRead
      ? createAgentTools({
          // Looked up again at each use, so a link removed mid-reply stops
          // counting at once.
          linkedTabs: () =>
            linkedTabs(
              chats.findConversation(options.getChats(), chatId)?.refs ?? [],
              options.getWorkspace(),
            ),
          readPage: options.readPage,
        })
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

  ipcMain.handle('chat:retry', (event, chatId: unknown): ChatSendResult => {
    if (!fromUi(event)) throw new Error('Not allowed.');
    if (!isId(chatId)) return invalid;
    const prepared = contextFor(chatId);
    if (!prepared.ok) return prepared;
    const started = runner.retry(chatId, prepared.context);
    if (started.ok) void started.done;
    return answer(started);
  });

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
      ipcMain.removeListener('chat:stop', onStop);
      ipcMain.removeListener('chat:copy', onCopy);
      ipcMain.removeListener('chat:model-menu', onModelMenu);
    },
  };
}
