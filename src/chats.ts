// The data model for conversations (chats): plain data plus pure functions that
// return a NEW state instead of changing the old one. Conversations are managed
// on their own: they do not belong to a Space or a tab. This is what gets saved
// to chats.json. No Electron in here, so it is easy to test.
//
// Messages and linked Spaces/tabs (`refs`) are reserved here and filled in by
// the chat feature itself; for now every conversation is empty.

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
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
const MAX_CONVERSATIONS = 500;
const MAX_TITLE = 80;
const MAX_MESSAGES = 2000;
const MAX_CONTENT = 100_000;
const MAX_REFS = 50;

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    if (Array.isArray(item.messages)) {
      for (const m of item.messages) {
        if (messages.length >= MAX_MESSAGES) break;
        if (!isRecord(m) || !isId(m.id)) continue;
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        if (typeof m.content !== 'string') continue;
        maxId = Math.max(maxId, m.id);
        messages.push({
          id: m.id,
          role: m.role,
          content: m.content.slice(0, MAX_CONTENT),
          createdAt: isTime(m.createdAt) ? m.createdAt : now,
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

// ---------------------------------------------------------------------------
// Changing (each returns a new state)
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
