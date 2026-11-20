// Within one reply, every tool result and every picture stays in the conversation, and every later
// request pays for all of it again. Three kinds of it are of no use any more, and this leaves them out of
// what is SENT (the conversation the app keeps is not changed):
//
//   - A look at a page (look_at_page) whose control numbers have expired: the page changed (a click, a
//     key, a choice, going to another address or back) or it was looked at again. The app already refuses
//     the old numbers, so the old list can only mislead.
//   - A page read (read_page) of a tab that was read again later: the newer text is the current one.
//   - Pictures (screenshots) other than the newest. The model has already seen and answered about
//     the old ones.
//
// Each is replaced by one short line saying what it was and why it is not repeated, so the conversation
// still makes sense (every tool call keeps an answer). Pure code, so it is easy to test.
import { CHANGES_PAGE } from './agentActions.ts';
import type { ActionName } from './agentActions.ts';
import type { ChatMessageInput, ContentPart } from './openrouter.ts';

interface CallInfo {
  name: string;
  // The tab the call was about (from its arguments), or null.
  tab: number | null;
  // Where the call came in the order of all calls so far.
  order: number;
}

const tabOf = (raw: string): number | null => {
  try {
    const args: unknown = JSON.parse(raw || '{}');
    const tab =
      typeof args === 'object' && args !== null
        ? (args as { tab?: unknown }).tab
        : null;
    return typeof tab === 'number' && Number.isInteger(tab) ? tab : null;
  } catch {
    return null;
  }
};

export const STALE_LOOK = (tab: number | null): string =>
  `[An earlier look at ${tab === null ? 'a page' : `tab ${tab}`}. The page has changed or was looked at again since, so these control numbers no longer work. Use look_at_page again if you need them.]`;
export const STALE_READ = (tab: number | null): string =>
  `[An earlier read of ${tab === null ? 'a page' : `tab ${tab}`}. It was read again later in this reply: use that newer text.]`;
export const PICTURE_NOT_REPEATED =
  '(The picture was shown to you earlier. It is not sent again.)';

export function pruneConversation(
  messages: readonly ChatMessageInput[],
): ChatMessageInput[] {
  // Every tool call of the conversation, by its id, in order.
  const calls = new Map<string, CallInfo>();
  const all: CallInfo[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) continue;
    for (const call of message.toolCalls) {
      const info = {
        name: call.name,
        tab: tabOf(call.arguments),
        order: all.length,
      };
      calls.set(call.id, info);
      all.push(info);
    }
  }
  const laterOnTab = (call: CallInfo, wanted: (name: string) => boolean) =>
    call.tab !== null &&
    all.some(
      (other) =>
        other.order > call.order &&
        other.tab === call.tab &&
        wanted(other.name),
    );

  // The newest message that holds a picture: the only one whose pictures are kept.
  const hasPicture = (message: ChatMessageInput) =>
    message.role === 'user' &&
    Array.isArray(message.content) &&
    message.content.some((part) => part.type === 'image');
  let newestPicture = -1;
  messages.forEach((message, i) => {
    if (hasPicture(message)) newestPicture = i;
  });

  return messages.map((message, i): ChatMessageInput => {
    if (message.role === 'tool') {
      const call = calls.get(message.toolCallId);
      if (!call) return message;
      if (
        call.name === 'look_at_page' &&
        laterOnTab(
          call,
          (name) =>
            name === 'look_at_page' || CHANGES_PAGE.has(name as ActionName),
        )
      ) {
        return { ...message, content: STALE_LOOK(call.tab) };
      }
      if (
        call.name === 'read_page' &&
        laterOnTab(call, (name) => name === 'read_page')
      ) {
        return { ...message, content: STALE_READ(call.tab) };
      }
      return message;
    }
    if (hasPicture(message) && i !== newestPicture) {
      const parts = (message as { content: ContentPart[] }).content;
      return {
        role: 'user',
        content: [
          ...parts.filter((part) => part.type === 'text'),
          { type: 'text', text: PICTURE_NOT_REPEATED },
        ],
      };
    }
    return message;
  });
}
