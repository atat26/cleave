// The data model for conversations (chats): plain data plus pure functions that
// return a NEW state instead of changing the old one. Conversations are managed
// on their own: they do not belong to a Space or a tab. This is what gets saved
// to chats.json. No Electron in here, so it is easy to test.
//
// Linked Spaces/tabs (`refs`) are reserved here and filled in by the "@" feature
// (a later step); for now they are always empty.
import { isWebUrl } from './model.ts';
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
  // For your messages: the Spaces and tabs you mentioned with "@" in it, drawn as
  // small tokens where their "@name" (`tag`) is in the text, plus anything newly
  // attached without an "@name" (empty `tag`), drawn under the message. They keep
  // their own copy of the name and address, so they stay in an old message even
  // after the link is removed from the chat (a closed tab can be reopened).
  mentions: Mention[];
  // For a reply: what happened, in the order it happened (thinking, a tool the
  // assistant used, more thinking, the answer...). `content` and `reasoning`
  // above are those same texts joined together (the answer, and the thinking).
  // The page text a tool read is never saved: only what was called.
  parts: MessagePart[];
}

export type MessagePart =
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  // Buttons the assistant offered: clicking one fills your message box.
  | { type: 'choices'; question: string; options: string[] }
  | {
      type: 'tool';
      id: number;
      // The model's own id for the call, the tool's name, and its arguments
      // exactly as the model wrote them (JSON text), so you can see what was called.
      callId: string;
      name: string;
      arguments: string;
      // Lines written by the app: what it is doing, and how it ended.
      label: string;
      // "waiting" is waiting for you to approve it; "declined" is when you said no.
      status: 'waiting' | 'running' | 'ok' | 'error' | 'declined';
      outcome: string;
      // For something that needed your approval: what the approval card said, and
      // whether it was one of the kinds that always asks.
      ask: string;
      risky: boolean;
    };

export interface Mention extends ChatRef {
  tag: string;
}

// A Space or tab the conversation has been linked to, so the agent knows where
// to work. By id: if the Space or tab is closed later, the link just goes grey.
export interface ChatRef {
  kind: 'space' | 'tab';
  id: number;
  // The item's last known name and address, kept so that a link to something that
  // has since been closed can still be shown by name (and a tab reopened).
  title: string;
  // The full address, for tabs (so it can be reopened); null for Spaces.
  url: string | null;
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
const MAX_PARTS = 300;
const MAX_STEP_LABEL = 300;
const MAX_TOOL_ARGUMENTS = 2000;
const MAX_REFS = 50;
const MAX_REF_TITLE = 200;
// The most Spaces and tabs you can link to one chat.
export const MAX_LINKS = 20;

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

const validTag = (tag: unknown): tag is string =>
  typeof tag === 'string' &&
  tag.length >= 2 &&
  tag.length <= MAX_REF_TITLE + 1 &&
  tag.startsWith('@') &&
  !/[\r\n]/.test(tag);

function parseMentions(raw: unknown): Mention[] {
  const out: Mention[] = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    if (out.length >= MAX_LINKS) break;
    // An empty tag is an item attached without an "@name" in the text.
    if (!isRecord(r) || !isId(r.id) || !(r.tag === '' || validTag(r.tag)))
      continue;
    if (r.kind !== 'space' && r.kind !== 'tab') continue;
    if (out.some((x) => x.kind === r.kind && x.id === r.id)) continue;
    out.push({
      kind: r.kind,
      id: r.id,
      tag: r.tag,
      title: typeof r.title === 'string' ? r.title.slice(0, MAX_REF_TITLE) : '',
      url: r.kind === 'tab' && isWebUrl(r.url) ? r.url : null,
    });
  }
  return out;
}

const str = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

// The ordered parts of a reply, read defensively.
function parseParts(raw: unknown): MessagePart[] {
  const out: MessagePart[] = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    if (out.length >= MAX_PARTS) break;
    if (!isRecord(r)) continue;
    if (r.type === 'thinking' && typeof r.text === 'string') {
      out.push({ type: 'thinking', text: r.text.slice(0, MAX_REASONING) });
    } else if (r.type === 'text' && typeof r.text === 'string') {
      out.push({ type: 'text', text: r.text.slice(0, MAX_CONTENT) });
    } else if (r.type === 'choices' && Array.isArray(r.options)) {
      const options = r.options
        .filter((o): o is string => typeof o === 'string' && o !== '')
        .map((o) => o.slice(0, 120))
        .slice(0, 6);
      if (options.length >= 2) {
        out.push({ type: 'choices', question: str(r.question, 200), options });
      }
    } else if (r.type === 'tool' && isId(r.id)) {
      out.push({
        type: 'tool',
        id: r.id,
        callId: str(r.callId, 200),
        name: str(r.name, 100),
        arguments: str(r.arguments, MAX_TOOL_ARGUMENTS),
        label: str(r.label, MAX_STEP_LABEL),
        // A call still "running" (or waiting for approval) when the app closed
        // did not happen.
        status:
          r.status === 'ok'
            ? 'ok'
            : r.status === 'declined'
              ? 'declined'
              : 'error',
        outcome: str(r.outcome, MAX_STEP_LABEL),
        ask: str(r.ask, 400),
        risky: r.risky === true,
      });
    }
  }
  return out;
}

// A reply saved before replies kept their order: thinking, then the tools it
// used, then the answer is the best guess.
function partsFromOldReply(m: Record<string, unknown>): MessagePart[] {
  const parts: MessagePart[] = [];
  const reasoning = str(m.reasoning, MAX_REASONING);
  if (reasoning !== '') parts.push({ type: 'thinking', text: reasoning });
  if (Array.isArray(m.steps)) {
    for (const r of m.steps) {
      if (parts.length >= MAX_PARTS - 1) break;
      if (!isRecord(r) || !isId(r.id)) continue;
      parts.push({
        type: 'tool',
        id: r.id,
        callId: '',
        name: 'read_page',
        arguments: '',
        label: str(r.label, MAX_STEP_LABEL),
        status: r.status === 'ok' ? 'ok' : 'error',
        outcome: '',
        ask: '',
        risky: false,
      });
    }
  }
  const content = str(m.content, MAX_CONTENT);
  if (content !== '') parts.push({ type: 'text', text: content });
  return parts;
}

const joinParts = (parts: MessagePart[], type: 'text' | 'thinking') =>
  parts.flatMap((p) => (p.type === type ? [p.text] : [])).join('');

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

        // A reply keeps its parts in order; one saved before that is converted.
        // Content and thinking are always rebuilt from the parts, so the two can
        // never disagree.
        let parts: MessagePart[] = [];
        let content = m.content.slice(0, MAX_CONTENT);
        let reasoning = str(m.reasoning, MAX_REASONING);
        if (m.role === 'assistant') {
          parts = Array.isArray(m.parts)
            ? parseParts(m.parts)
            : partsFromOldReply(m);
          content = joinParts(parts, 'text').slice(0, MAX_CONTENT);
          reasoning = joinParts(parts, 'thinking').slice(0, MAX_REASONING);
        }
        const parsed = { parts, content, reasoning };

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
          content: parsed.content,
          reasoning: parsed.reasoning,
          createdAt: isTime(m.createdAt) ? m.createdAt : now,
          status,
          model: isValidModelId(m.model) ? m.model : null,
          usage,
          errorKind: ERROR_KINDS.find((k) => k === m.errorKind) ?? null,
          mentions: parseMentions(m.mentions),
          parts: parsed.parts,
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
        refs.push({
          kind: r.kind,
          id: r.id,
          title:
            typeof r.title === 'string' ? r.title.slice(0, MAX_REF_TITLE) : '',
          url: r.kind === 'tab' && isWebUrl(r.url) ? r.url : null,
        });
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

// Start a new chat from a message of yours: a copy of the conversation up to and
// including that message and its reply (with the same links and model), which
// becomes the active chat. Nothing is asked of the model: you carry on from
// there. The original chat is left exactly as it was.
export function branchConversation(
  state: ChatsState,
  chatId: number,
  messageId: number,
  now = Date.now(),
): { state: ChatsState; id: number } | null {
  const chat = findConversation(state, chatId);
  const index =
    chat?.messages.findIndex((m) => m.id === messageId && m.role === 'user') ??
    -1;
  if (!chat || index < 0 || state.conversations.length >= MAX_CONVERSATIONS) {
    return null;
  }
  const id = state.nextId;
  const copy: Conversation = {
    ...chat,
    id,
    title: cleanTitle(`${chat.title} (branch)`, DEFAULT_CHAT_TITLE),
    createdAt: now,
    updatedAt: now,
    refs: chat.refs.map((r) => ({ ...r })),
    messages: chat.messages
      .slice(
        0,
        chat.messages[index + 1]?.role === 'assistant' ? index + 2 : index + 1,
      )
      .map((m) => ({ ...m })),
  };
  return {
    id,
    state: {
      ...state,
      conversations: [...state.conversations, copy],
      activeId: id,
      nextId: id + 1,
    },
  };
}

// Remove every message after the given one (which stays). Used when a past
// prompt is retried: the conversation carries on from there.
export function truncateAfter(
  state: ChatsState,
  chatId: number,
  messageId: number,
): ChatsState {
  const chat = findConversation(state, chatId);
  const index = chat?.messages.findIndex((m) => m.id === messageId) ?? -1;
  if (!chat || index < 0 || index === chat.messages.length - 1) return state;
  return update(state, chatId, (c) => ({
    ...c,
    messages: c.messages.slice(0, index + 1),
  }));
}

// Add your message to a chat. Empty text (or text over the limit) is refused.
// The first message in a chat that still has the default name also names it.
export function addUserMessage(
  state: ChatsState,
  chatId: number,
  text: string,
  now = Date.now(),
  mentions: { kind: string; id: number; tag: string }[] = [],
): { state: ChatsState; id: number } | null {
  const chat = findConversation(state, chatId);
  const content = text.trim();
  if (!chat || content === '' || content.length > MAX_USER_CHARS) return null;
  if (chat.messages.length >= MAX_MESSAGES) return null;

  const inline = mentions.flatMap((m) => {
    const ref = chat.refs.find((r) => sameLink(r, m));
    return ref && m.tag !== '' && content.includes(m.tag)
      ? [{ ...ref, tag: m.tag }]
      : [];
  });
  const shown = chat.messages.flatMap((m) => m.mentions);
  const attached = chat.refs
    .filter((r) => ![...inline, ...shown].some((x) => sameLink(x, r)))
    .map((r) => ({ ...r, tag: '' }));

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
    // Only things linked to this chat, and whose "@name" is really in the text,
    // can be mentioned. The name and address come from the link, not the sender.
    // Links added since they were last shown (for example with the "Add page"
    // button) are attached to this message too, with no "@name" in the text.
    mentions: parseMentions(inline.concat(attached)),
    parts: [],
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
    mentions: [],
    parts: [],
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

// Add to the last part if it is of the same kind (the thinking or the answer is
// still going), otherwise start a new part (something else happened in between).
function extendParts(
  parts: MessagePart[],
  type: 'text' | 'thinking',
  text: string,
  max: number,
): MessagePart[] {
  if (text === '') return parts;
  const last = parts[parts.length - 1];
  if (last && last.type === type) {
    return [
      ...parts.slice(0, -1),
      { type, text: (last.text + text).slice(0, max) },
    ];
  }
  if (parts.length >= MAX_PARTS) return parts;
  return [...parts, { type, text: text.slice(0, max) }];
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
    parts: extendParts(m.parts, 'thinking', text, MAX_REASONING),
  }));
}

// Add more text to a reply as it arrives. `gap` is a paragraph break to put in
// the joined text (not in the part) when the answer carries on after a tool.
export function appendToMessage(
  state: ChatsState,
  chatId: number,
  messageId: number,
  text: string,
  gap = '',
): ChatsState {
  return updateMessage(state, chatId, messageId, (m) => ({
    ...m,
    content: (m.content + gap + text).slice(0, MAX_CONTENT),
    parts: extendParts(m.parts, 'text', text, MAX_CONTENT),
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
      // Nothing is still running once the reply is over (for example Stop).
      parts: m.parts.map((part) =>
        part.type === 'tool' &&
        (part.status === 'running' || part.status === 'waiting')
          ? { ...part, status: 'error' }
          : part,
      ),
    }),
    now,
  );
}

// Record that the assistant started using a tool, in its place in the reply.
export function addToolPart(
  state: ChatsState,
  chatId: number,
  messageId: number,
  call: {
    callId: string;
    name: string;
    arguments: string;
    label: string;
    // If it needs your approval: the card's words, and whether it always asks.
    ask?: string;
    risky?: boolean;
  },
): { state: ChatsState; partId: number } | null {
  const message = findMessage(state, chatId, messageId);
  if (!message || message.parts.length >= MAX_PARTS) return null;
  const partId =
    message.parts.reduce(
      (max, p) => (p.type === 'tool' ? Math.max(max, p.id) : max),
      0,
    ) + 1;
  return {
    partId,
    state: updateMessage(state, chatId, messageId, (m) => ({
      ...m,
      parts: [
        ...m.parts,
        {
          type: 'tool',
          id: partId,
          callId: call.callId.slice(0, 200),
          name: call.name.slice(0, 100),
          arguments: call.arguments.slice(0, MAX_TOOL_ARGUMENTS),
          label: call.label.slice(0, MAX_STEP_LABEL),
          status: call.ask ? 'waiting' : 'running',
          outcome: '',
          ask: (call.ask ?? '').slice(0, 400),
          risky: call.risky === true,
        },
      ],
    })),
  };
}

// Add the buttons the assistant offered, in their place in the reply.
export function addChoicesPart(
  state: ChatsState,
  chatId: number,
  messageId: number,
  choices: { question: string; options: string[] },
): ChatsState {
  const message = findMessage(state, chatId, messageId);
  if (!message || message.parts.length >= MAX_PARTS) return state;
  return updateMessage(state, chatId, messageId, (m) => ({
    ...m,
    parts: [
      ...m.parts,
      {
        type: 'choices',
        question: choices.question.slice(0, 200),
        options: choices.options.slice(0, 6).map((o) => o.slice(0, 120)),
      },
    ],
  }));
}

// Change a tool call's status (for example from waiting for approval to running).
export function setToolStatus(
  state: ChatsState,
  chatId: number,
  messageId: number,
  partId: number,
  status: 'waiting' | 'running',
  outcome?: string,
): ChatsState {
  return updateMessage(state, chatId, messageId, (m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === 'tool' && p.id === partId
        ? { ...p, status, outcome: outcome ?? p.outcome }
        : p,
    ),
  }));
}

// Record how a tool call ended, with its final wording and a short note.
export function finishToolPart(
  state: ChatsState,
  chatId: number,
  messageId: number,
  partId: number,
  result: {
    ok: boolean;
    declined?: boolean;
    label?: string;
    outcome?: string;
  },
): ChatsState {
  return updateMessage(state, chatId, messageId, (m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === 'tool' && p.id === partId
        ? {
            ...p,
            status: result.declined ? 'declined' : result.ok ? 'ok' : 'error',
            label:
              result.label === undefined
                ? p.label
                : result.label.slice(0, MAX_STEP_LABEL),
            outcome:
              result.outcome === undefined
                ? p.outcome
                : result.outcome.slice(0, MAX_STEP_LABEL),
          }
        : p,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Links to Spaces and tabs
// ---------------------------------------------------------------------------

const sameLink = (
  a: { kind: string; id: number },
  b: { kind: string; id: number },
) => a.kind === b.kind && a.id === b.id;

// Link a Space or tab to a chat. Linking something already linked just refreshes
// what is remembered about it. Over the limit, or with a bad id or kind, nothing
// happens.
export function addRef(
  state: ChatsState,
  chatId: number,
  ref: ChatRef,
): ChatsState {
  if (!isId(ref.id) || (ref.kind !== 'space' && ref.kind !== 'tab'))
    return state;
  const clean: ChatRef = {
    kind: ref.kind,
    id: ref.id,
    title: ref.title.slice(0, MAX_REF_TITLE),
    url: ref.kind === 'tab' && isWebUrl(ref.url) ? ref.url : null,
  };
  const chat = findConversation(state, chatId);
  if (!chat) return state;
  const exists = chat.refs.some((r) => sameLink(r, clean));
  if (!exists && chat.refs.length >= MAX_LINKS) return state;
  return update(state, chatId, (c) => ({
    ...c,
    refs: exists
      ? c.refs.map((r) => (sameLink(r, clean) ? clean : r))
      : [...c.refs, clean],
  }));
}

export function removeRef(
  state: ChatsState,
  chatId: number,
  kind: ChatRef['kind'],
  id: number,
): ChatsState {
  return update(state, chatId, (c) => ({
    ...c,
    refs: c.refs.filter((r) => !sameLink(r, { kind, id })),
  }));
}

// Point a link at a different item (a closed tab that was reopened is a new tab
// with a new id).
export function retargetRef(
  state: ChatsState,
  chatId: number,
  kind: ChatRef['kind'],
  oldId: number,
  next: { id: number; title: string; url: string | null },
): ChatsState {
  const chat = findConversation(state, chatId);
  const old = { kind, id: oldId };
  const inRefs = chat?.refs.some((r) => sameLink(r, old)) ?? false;
  const inMessages =
    chat?.messages.some((m) => m.mentions.some((x) => sameLink(x, old))) ??
    false;
  if (!chat || (!inRefs && !inMessages)) return state;

  const title = next.title.slice(0, MAX_REF_TITLE);
  const url = kind === 'tab' && isWebUrl(next.url) ? next.url : null;
  return update(state, chatId, (c) => {
    const alreadyLinked = c.refs.some((r) =>
      sameLink(r, { kind, id: next.id }),
    );
    return {
      ...c,
      // Earlier mentions (even of a link since removed) follow the reopened tab.
      messages: c.messages.map((m) =>
        m.mentions.some((x) => sameLink(x, old))
          ? {
              ...m,
              mentions: m.mentions.map((x) =>
                sameLink(x, old) ? { ...x, id: next.id, title, url } : x,
              ),
            }
          : m,
      ),
      refs: alreadyLinked
        ? c.refs.filter((r) => !sameLink(r, old))
        : c.refs.map((r) =>
            sameLink(r, old) ? { kind, id: next.id, title, url } : r,
          ),
    };
  });
}

// Same as retargetRef, but for every chat that links or mentions the item (a
// reopened page is picked up by all the chats that used it).
export function retargetEverywhere(
  state: ChatsState,
  kind: ChatRef['kind'],
  oldId: number,
  next: { id: number; title: string; url: string | null },
): ChatsState {
  return state.conversations.reduce(
    (current, chat) => retargetRef(current, chat.id, kind, oldId, next),
    state,
  );
}

// Bring every link's remembered name and address up to date with the workspace.
// `lookup` gives the latest for an item, or null if it no longer exists (then the
// last remembered copy is kept). Returns the same state if nothing changed.
export function refreshRefs(
  state: ChatsState,
  lookup: (
    kind: ChatRef['kind'],
    id: number,
  ) => { title: string; url: string | null } | null,
): ChatsState {
  let changed = false;
  const conversations = state.conversations.map((chat) => {
    let chatChanged = false;
    const refs = chat.refs.map((ref) => {
      const latest = lookup(ref.kind, ref.id);
      if (!latest) return ref;
      const title = latest.title.slice(0, MAX_REF_TITLE);
      const url =
        ref.kind === 'tab' && isWebUrl(latest.url) ? latest.url : ref.url;
      if (title === ref.title && url === ref.url) return ref;
      chatChanged = true;
      return { ...ref, title, url };
    });
    if (!chatChanged) return chat;
    changed = true;
    return { ...chat, refs };
  });
  return changed ? { ...state, conversations } : state;
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
