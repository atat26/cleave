// What the slim chat bar shows while a reply is being written or waiting for you,
// and how much room the chat needs for it. Pure code, so it is easy to test.
import type { ChatMessage } from './chats.ts';
import type { ChatNeed } from './layout.ts';

const latestAssistant = (messages: ChatMessage[]): ChatMessage | undefined => {
  const last = messages[messages.length - 1];
  return last?.role === 'assistant' ? last : undefined;
};

// Does the newest reply have an action waiting for your approval?
export function hasApprovalWaiting(messages: ChatMessage[]): boolean {
  return (
    latestAssistant(messages)?.parts.some(
      (part) => part.type === 'tool' && part.status === 'waiting',
    ) ?? false
  );
}

// How much the chat needs, so it is never squeezed out of sight:
//   approval: an action is waiting for you (it must be on screen)
//   activity: a reply is being written (one line of it must be on screen)
//   none:     nothing is going on
export function chatNeedOf(
  messages: ChatMessage[],
  generating: boolean,
): ChatNeed {
  if (hasApprovalWaiting(messages)) return 'approval';
  return generating ? 'activity' : 'none';
}

const MAX_LINE = 200;

// Plain text for one line: markdown marks at the start of the line are dropped.
const tidy = (line: string) =>
  line
    .replace(/^[\s>#*\-+`_\d.)]+/, '')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LINE);

// The one line to show for the newest reply: its latest text, or what it is doing
// now. `working` is true while it is still being written.
export function liveLine(
  messages: ChatMessage[],
): { text: string; working: boolean } | null {
  const message = latestAssistant(messages);
  if (!message) return null;
  const working = message.status === 'streaming';
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    if (part.type === 'text') {
      const lines = part.text.split('\n').map(tidy).filter(Boolean);
      const line = lines[lines.length - 1];
      if (line) return { text: line, working };
    } else if (part.type === 'tool') {
      const text = tidy(part.status === 'waiting' ? part.ask : part.label);
      if (text) return { text, working };
    } else if (part.type === 'thinking' && working) {
      return { text: 'Thinking…', working };
    }
  }
  return working ? { text: 'Thinking…', working } : null;
}

// What to tell you when a reply finished while the chat was too slim to show it
// (null if the newest message is not a finished reply).
export function finishedNotice(
  message: ChatMessage | undefined,
): string | null {
  if (!message || message.role !== 'assistant') return null;
  if (message.status === 'done') {
    return 'Your reply is ready. Open the chat to read it.';
  }
  if (message.status === 'stopped') {
    return 'The reply was stopped. Open the chat to see what there is.';
  }
  if (message.status === 'error') {
    return 'The reply could not be finished. Open the chat to see why.';
  }
  return null;
}
