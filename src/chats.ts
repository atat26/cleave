// The data model for conversations (chats): plain data plus pure functions that
// return a NEW state instead of changing the old one. Conversations are managed
// on their own: they do not belong to a Space or a tab. This is what gets saved
// to chats.json. No Electron in here, so it is easy to test.
//
// Linked Spaces/tabs (`refs`) are reserved here and filled in by the "@" feature
// (a later step); for now they are always empty.
import { isValidModelId } from './openrouter.ts';
import type { ChatErrorKind } from './openrouter.ts';

// How a message ended up:
//   done      finished normally
//   streaming being written right now
//   stopped   you pressed Stop (or the app closed) before it finished; the text
//             written so far is kept
//   error     it failed; `errorKind` says why (the text so far, if any, is kept)
export type MessageStatus = 'done' | 'streaming' | 'stopped' | 'error';

// What a reply cost: tokens and US dollars (null if the provider did not say).
export interface MessageUsage {
  totalTokens: number | null;
  cost: number | null;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  // For a reply: the model's "thinking" text, for models that show it (shown in
  // an expandable block; never sent back to the model). Empty otherwise.
  reasoning: string;
  createdAt: number;
  status: MessageStatus;
  // For a reply: the model that wrote it (null for your own messages).
  model: string | null;
  usage: MessageUsage | null;
  errorKind: ChatErrorKind | null;
}

// A Space or tab the conversation has been linked to, so the agent knows where
// to work. By id: if the Space or tab is closed later, the link just goes grey.
export interface ChatRef {
  kind: 'space' | 'tab';
  id: number;
}

export interface Conversation {
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  // The model this chat uses, or null to use the default from Settings.
  model: string | null;
  refs: ChatRef[];
  messages: ChatMessage[];
}

export interface ChatsState {
  version: 1;
  // In the order they were created.
  conversations: Conversation[];
  // There is always at least one conversation, and one of them is active.
  activeId: number;
  nextId: number;
}

export const DEFAULT_CHAT_TITLE = 'New chat';
// The longest message you can send, in characters.
export const MAX_USER_CHARS = 20_000;
const MAX_CONVERSATIONS = 500;
const MAX_TITLE = 80;
const AUTO_TITLE_CHARS = 40;
const MAX_MESSAGES = 2000;
const MAX_CONTENT = 100_000;
const MAX_REASONING = 50_000;
const MAX_REFS = 50;

const ERROR_KINDS: readonly ChatErrorKind[] = [
  'auth',
  'credit',
  'rate-limit',
  'timeout',
  'provider',
  'bad-request',
  'blocked',
  'network',
  'unknown',
];
const STATUSES: readonly MessageStatus[] = [
  'done',
  'streaming',
  'stopped',
  'error',
];

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function cleanTitle(value: unknown, fallback: string): string {
  const title =
    typeof value === 'string' ? value.trim().slice(0, MAX_TITLE) : '';
  return title === '' ? fallback : title;
}

function emptyConversation(id: number, now: number): Conversation {
  return {
    id,
    title: DEFAULT_CHAT_TITLE,
    createdAt: now,
    updatedAt: now,
    model: null,
    refs: [],
    messages: [],
  };
}

// A fresh state: one empty conversation, ready to use.
export function defaultChats(now = Date.now()): ChatsState {
  return {
    version: 1,
    conversations: [emptyConversation(1, now)],
    activeId: 1,
    nextId: 2,
  };
}

// ---------------------------------------------------------------------------
// Loading: turn untrusted data (the file on disk) into a valid state.
// Anything invalid is dropped or repaired; this never throws.
// ---------------------------------------------------------------------------

export function parseChats(raw: unknown, now = Date.now()): ChatsState {
  if (!isRecord(raw) || !Array.isArray(raw.conversations)) {
    return defaultChats(now);
  }

  const seen = new Set<number>();
  const conversations: Conversation[] = [];
  let maxId = 0;

  for (const item of raw.conversations) {
    if (conversations.length >= MAX_CONVERSATIONS) break;
    if (!isRecord(item) || !isId(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    maxId = Math.max(maxId, item.id);

    const messages: ChatMessage[] = [];
    const messageIds = new Set<number>();
    if (Array.isArray(item.messages)) {
      for (const m of item.messages) {
        if (messages.length >= MAX_MESSAGES) break;
        if (!isRecord(m) || !isId(m.id) || messageIds.has(m.id)) continue;
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        if (typeof m.content !== 'string') continue;
        messageIds.add(m.id);
        maxId = Math.max(maxId, m.id);

        // A reply that was still being written when the app closed was cut off:
        // keep what it had, and mark it stopped.
        let status = STATUSES.find((s) => s === m.status) ?? 'done';
        if (status === 'streaming') status = 'stopped';
        const usage = isRecord(m.usage)
          ? {
              totalTokens: numOrNull(m.usage.totalTokens),
              cost: numOrNull(m.usage.cost),
            }
          : null;
        messages.push({
          id: m.id,
          role: m.role,
          content: m.content.slice(0, MAX_CONTENT),
          reasoning:
            typeof m.reasoning === 'string'
              ? m.reasoning.slice(0, MAX_REASONING)
              : '',
          createdAt: isTime(m.createdAt) ? m.createdAt : now,
          status,
          model: isValidModelId(m.model) ? m.model : null,
          usage,
          errorKind: ERROR_KINDS.find((k) => k === m.errorKind) ?? null,
        });
      }
    }

    const refs: ChatRef[] = [];
    if (Array.isArray(item.refs)) {
      for (const r of item.refs) {
        if (refs.length >= MAX_REFS) break;
        if (!isRecord(r) || !isId(r.id)) continue;
        if (r.kind !== 'space' && r.kind !== 'tab') continue;
        if (refs.some((x) => x.kind === r.kind && x.id === r.id)) continue;
        refs.push({ kind: r.kind, id: r.id });
      }
    }

    const createdAt = isTime(item.createdAt) ? item.createdAt : now;
    conversations.push({
      id: item.id,
      title: cleanTitle(item.title, DEFAULT_CHAT_TITLE),
      createdAt,
      updatedAt: isTime(item.updatedAt) ? item.updatedAt : createdAt,
      model: isValidModelId(item.model) ? item.model : null,
      refs,
      messages,
    });
  }

  // There is always at least one conversation.
  if (conversations.length === 0) return defaultChats(now);

  const nextId = Math.max(isId(raw.nextId) ? raw.nextId : 1, maxId + 1);
  const activeId = conversations.some((c) => c.id === raw.activeId)
    ? (raw.activeId as number)
    : conversations[0].id;

  return { version: 1, conversations, activeId, nextId };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export const findConversation = (state: ChatsState, id: number) =>
  state.conversations.find((c) => c.id === id);

export const activeConversation = (state: ChatsState): Conversation =>
  findConversation(state, state.activeId) ?? state.conversations[0];

export const findMessage = (
  state: ChatsState,
  chatId: number,
  messageId: number,
) => findConversation(state, chatId)?.messages.find((m) => m.id === messageId);

// ---------------------------------------------------------------------------
// Changing conversations (each returns a new state)
// ---------------------------------------------------------------------------

// Start a new, empty conversation and switch to it.
export function newConversation(
  state: ChatsState,
  now = Date.now(),
): { state: ChatsState; id: number } {
  const id = state.nextId;
  return {
    id,
    state: {
      ...state,
      conversations: [...state.conversations, emptyConversation(id, now)],
      activeId: id,
      nextId: id + 1,
    },
  };
}

export function setActiveConversation(
  state: ChatsState,
  id: number,
): ChatsState {
  return findConversation(state, id) ? { ...state, activeId: id } : state;
}

export function renameConversation(
  state: ChatsState,
  id: number,
  title: string,
): ChatsState {
  return {
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === id ? { ...c, title: cleanTitle(title, c.title) } : c,
    ),
  };
}

// Choose the model a chat uses (null = use the default from Settings). A bad
// model name leaves the chat as it was.
export function setConversationModel(
  state: ChatsState,
  id: number,
  model: string | null,
): ChatsState {
  if (model !== null && !isValidModelId(model)) return state;
  return update(state, id, (c) => ({ ...c, model }));
}

// Delete a conversation. If it was the active one, the one before it (or after,
// if it was first) becomes active. Deleting the last one leaves a fresh empty
// conversation, so there is always something to type into.
export function deleteConversation(
  state: ChatsState,
  id: number,
  now = Date.now(),
): ChatsState {
  const index = state.conversations.findIndex((c) => c.id === id);
  if (index < 0) return state;
  const remaining = state.conversations.filter((c) => c.id !== id);
  if (remaining.length === 0) {
    const fresh = emptyConversation(state.nextId, now);
    return {
      ...state,
      conversations: [fresh],
      activeId: fresh.id,
      nextId: state.nextId + 1,
    };
  }
  const activeId =
    state.activeId === id
      ? remaining[Math.max(0, index - 1)].id
      : state.activeId;
  return { ...state, conversations: remaining, activeId };
}

// ---------------------------------------------------------------------------
// Changing messages
// ---------------------------------------------------------------------------

function update(
  state: ChatsState,
  chatId: number,
  change: (chat: Conversation) => Conversation,
): ChatsState {
  if (!findConversation(state, chatId)) return state;
  return {
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === chatId ? change(c) : c,
    ),
  };
}

function updateMessage(
  state: ChatsState,
  chatId: number,
  messageId: number,
  change: (message: ChatMessage) => ChatMessage,
  now?: number,
): ChatsState {
  return update(state, chatId, (c) => ({
    ...c,
    updatedAt: now ?? c.updatedAt,
    messages: c.messages.map((m) => (m.id === messageId ? change(m) : m)),
  }));
}

// A short title taken from your first message: its first non-empty line, with
// spaces tidied, cut to about 40 characters.
export function autoTitle(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const tidy = line.replace(/\s+/g, ' ').trim();
  if (tidy === '') return DEFAULT_CHAT_TITLE;
  return tidy.length > AUTO_TITLE_CHARS
    ? `${tidy.slice(0, AUTO_TITLE_CHARS).trimEnd()}…`
    : tidy;
}

// Add your message to a chat. Empty text (or text over the limit) is refused.
// The first message in a chat that still has the default name also names it.
export function addUserMessage(
  state: ChatsState,
  chatId: number,
  text: string,
  now = Date.now(),
): { state: ChatsState; id: number } | null {
  const chat = findConversation(state, chatId);
  const content = text.trim();
  if (!chat || content === '' || content.length > MAX_USER_CHARS) return null;
  if (chat.messages.length >= MAX_MESSAGES) return null;

  const id = state.nextId;
  const message: ChatMessage = {
    id,
    role: 'user',
    content,
    reasoning: '',
    createdAt: now,
    status: 'done',
    model: null,
    usage: null,
    errorKind: null,
  };
  const firstMessage = !chat.messages.some((m) => m.role === 'user');
  const next = update({ ...state, nextId: id + 1 }, chatId, (c) => ({
    ...c,
    updatedAt: now,
    title:
      firstMessage && c.title === DEFAULT_CHAT_TITLE
        ? autoTitle(content)
        : c.title,
    messages: [...c.messages, message],
  }));
  return { state: next, id };
}

// Add an empty reply that is about to be written by `model`.
export function startAssistantMessage(
  state: ChatsState,
  chatId: number,
  model: string,
  now = Date.now(),
): { state: ChatsState; id: number } | null {
  const chat = findConversation(state, chatId);
  if (!chat || chat.messages.length >= MAX_MESSAGES) return null;
  const id = state.nextId;
  const message: ChatMessage = {
    id,
    role: 'assistant',
    content: '',
    reasoning: '',
    createdAt: now,
    status: 'streaming',
    model,
    usage: null,
    errorKind: null,
  };
  return {
    id,
    state: update({ ...state, nextId: id + 1 }, chatId, (c) => ({
      ...c,
      updatedAt: now,
      messages: [...c.messages, message],
    })),
  };
}

// Add more of the model's thinking to a reply as it arrives.
export function appendReasoning(
  state: ChatsState,
  chatId: number,
  messageId: number,
  text: string,
): ChatsState {
  return updateMessage(state, chatId, messageId, (m) => ({
    ...m,
    reasoning: (m.reasoning + text).slice(0, MAX_REASONING),
  }));
}

// Add more text to a reply as it arrives.
export function appendToMessage(
  state: ChatsState,
  chatId: number,
  messageId: number,
  text: string,
): ChatsState {
  return updateMessage(state, chatId, messageId, (m) => ({
    ...m,
    content: (m.content + text).slice(0, MAX_CONTENT),
  }));
}

// Mark a reply as finished, stopped, or failed.
export function finishMessage(
  state: ChatsState,
  chatId: number,
  messageId: number,
  result: {
    status: 'done' | 'stopped' | 'error';
    usage?: MessageUsage | null;
    errorKind?: ChatErrorKind | null;
  },
  now = Date.now(),
): ChatsState {
  return updateMessage(
    state,
    chatId,
    messageId,
    (m) => ({
      ...m,
      status: result.status,
      usage: result.usage ?? m.usage,
      errorKind:
        result.status === 'error' ? (result.errorKind ?? 'unknown') : null,
    }),
    now,
  );
}

export function removeMessage(
  state: ChatsState,
  chatId: number,
  messageId: number,
): ChatsState {
  return update(state, chatId, (c) => ({
    ...c,
    messages: c.messages.filter((m) => m.id !== messageId),
  }));
}
