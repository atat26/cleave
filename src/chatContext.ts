// Works out exactly what is sent to the model for a chat: the system prompt, then
// as much recent conversation as fits within sensible limits, so a long chat can
// never quietly turn into a huge (and expensive) request. Pure code, no network,
// so it is easy to test.
import type { ChatMessage } from './chats.ts';
import type { ChatMessageInput } from './openrouter.ts';

// Used when you have not written your own system prompt in Settings.
export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant built into a web browser. Be clear and concise, and say so when you are unsure. You can only see, open or use web pages through the tools you are given; if you have none for something, say so.';

// At most this many recent messages, and about this many characters, are sent.
export const MAX_HISTORY_MESSAGES = 30;
export const MAX_HISTORY_CHARS = 60_000;

// Your system prompt, or the default if you have not written one.
export const effectiveSystemPrompt = (custom: string | null): string =>
  custom !== null && custom.trim() !== '' ? custom : DEFAULT_SYSTEM_PROMPT;

type HistoryMessage = Pick<ChatMessage, 'role' | 'content' | 'status'>;

export function buildMessages(options: {
  systemPrompt: string | null;
  // The list of linked Spaces and tabs (see chatLinks.ts), if any. It goes after
  // the system prompt, in the same system message.
  linkedContext?: string | null;
  history: HistoryMessage[];
  maxMessages?: number;
  maxChars?: number;
}): ChatMessageInput[] {
  const maxMessages = options.maxMessages ?? MAX_HISTORY_MESSAGES;
  const maxChars = options.maxChars ?? MAX_HISTORY_CHARS;

  // Leave out a reply still being written, a failed reply (it is incomplete and
  // would only confuse the model), and anything empty. A reply you stopped is
  // kept: it is a real, if short, answer.
  const usable = options.history.filter(
    (m) =>
      m.status !== 'streaming' &&
      m.status !== 'error' &&
      m.content.trim() !== '',
  );

  // Take messages from the newest backwards until a limit is reached. The newest
  // one is always kept (cut down if it alone is too long).
  const chosen: HistoryMessage[] = [];
  let chars = 0;
  for (let i = usable.length - 1; i >= 0; i--) {
    const message = usable[i];
    if (chosen.length >= maxMessages) break;
    if (chosen.length > 0 && chars + message.content.length > maxChars) break;
    chosen.push(message);
    chars += message.content.length;
  }
  chosen.reverse();

  // Start with something you said, not with half a conversation.
  while (chosen.length > 1 && chosen[0].role === 'assistant') chosen.shift();

  const newest = chosen.length - 1;
  const system = options.linkedContext
    ? `${effectiveSystemPrompt(options.systemPrompt)}\n\n${options.linkedContext}`
    : effectiveSystemPrompt(options.systemPrompt);
  return [
    { role: 'system', content: system },
    ...chosen.map((m, i) => ({
      role: m.role,
      content: i === newest ? m.content.slice(0, maxChars) : m.content,
    })),
  ];
}
