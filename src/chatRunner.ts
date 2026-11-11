// Runs a reply: sends a chat to the model and writes the answer into the chat as
// it streams in. It handles Stop, errors (keeping the text written so far), and
// Retry. It does not know about Electron or the network: the model call is
// passed in, so this can be tested with a fake one.
//
// At most one reply is generated per chat at a time. Other chats are unaffected
// (a chat keeps generating while you look at another one).
import { buildMessages } from './chatContext.ts';
import * as chats from './chats.ts';
import type { ChatsState } from './chats.ts';
import { ChatError } from './openrouter.ts';
import type { ChatMessageInput, StreamEvent } from './openrouter.ts';

export interface RunnerDeps {
  getState(): ChatsState;
  setState(next: ChatsState): void;
  // The model call. In the app this is streamChat() with the API key.
  stream(options: {
    model: string;
    messages: ChatMessageInput[];
    signal: AbortSignal;
  }): AsyncIterable<StreamEvent>;
  now(): number;
  // A message in a chat changed (it may change many times a second while a reply
  // streams in; the app decides how much of that to pass on to the screen).
  onMessage(chatId: number, messageId: number): void;
  // A chat started or stopped generating.
  onRunningChange(): void;
}

// What the model should be, and your system prompt.
export interface RunContext {
  model: string;
  systemPrompt: string | null;
}

export type StartResult =
  | { ok: true; replyId: number; done: Promise<void> }
  | {
      ok: false;
      reason: 'busy' | 'empty' | 'unknown-chat' | 'nothing-to-retry';
    };

export function createChatRunner(deps: RunnerDeps) {
  const running = new Map<number, AbortController>();

  // Write one reply into the chat, from the conversation as it stands now.
  async function generate(
    chatId: number,
    replyId: number,
    context: RunContext,
  ): Promise<void> {
    const controller = new AbortController();
    running.set(chatId, controller);
    deps.onRunningChange();

    const history =
      chats.findConversation(deps.getState(), chatId)?.messages ?? [];
    const messages = buildMessages({
      systemPrompt: context.systemPrompt,
      history,
    });

    let usage: chats.MessageUsage | null = null;
    let result: Parameters<typeof chats.finishMessage>[3] = { status: 'done' };
    try {
      for await (const event of deps.stream({
        model: context.model,
        messages,
        signal: controller.signal,
      })) {
        if (event.type === 'text') {
          deps.setState(
            chats.appendToMessage(deps.getState(), chatId, replyId, event.text),
          );
          deps.onMessage(chatId, replyId);
        } else if (event.type === 'usage') {
          usage = { totalTokens: event.totalTokens, cost: event.cost };
        }
        // Stop pressed: stop reading even if the stream does not notice.
        if (controller.signal.aborted) break;
      }
      result = controller.signal.aborted
        ? { status: 'stopped' }
        : { status: 'done' };
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        result = { status: 'stopped' };
      } else if (error instanceof ChatError) {
        result = { status: 'error', errorKind: error.kind };
      } else {
        result = { status: 'error', errorKind: 'unknown' };
      }
    } finally {
      deps.setState(
        chats.finishMessage(
          deps.getState(),
          chatId,
          replyId,
          { ...result, usage },
          deps.now(),
        ),
      );
      running.delete(chatId);
      deps.onMessage(chatId, replyId);
      deps.onRunningChange();
    }
  }

  return {
    // Is a reply being written in this chat right now?
    isRunning: (chatId: number) => running.has(chatId),

    // Which chats are generating (for the chat list).
    runningChats: () => [...running.keys()],

    // Add your message to the chat and start the reply.
    send(chatId: number, text: string, context: RunContext): StartResult {
      if (running.has(chatId)) return { ok: false, reason: 'busy' };
      if (!chats.findConversation(deps.getState(), chatId)) {
        return { ok: false, reason: 'unknown-chat' };
      }
      const added = chats.addUserMessage(
        deps.getState(),
        chatId,
        text,
        deps.now(),
      );
      if (!added) return { ok: false, reason: 'empty' };
      const reply = chats.startAssistantMessage(
        added.state,
        chatId,
        context.model,
        deps.now(),
      );
      if (!reply) return { ok: false, reason: 'unknown-chat' };
      deps.setState(reply.state);
      deps.onMessage(chatId, added.id);
      deps.onMessage(chatId, reply.id);
      return {
        ok: true,
        replyId: reply.id,
        done: generate(chatId, reply.id, context),
      };
    },

    // Try again after a failed or stopped reply: remove it, and ask again from
    // your last message.
    retry(chatId: number, context: RunContext): StartResult {
      if (running.has(chatId)) return { ok: false, reason: 'busy' };
      const chat = chats.findConversation(deps.getState(), chatId);
      if (!chat) return { ok: false, reason: 'unknown-chat' };
      const last = chat.messages[chat.messages.length - 1];
      let state = deps.getState();
      if (
        last?.role === 'assistant' &&
        (last.status === 'error' || last.status === 'stopped')
      ) {
        state = chats.removeMessage(state, chatId, last.id);
      }
      const remaining = chats.findConversation(state, chatId)?.messages;
      if (!remaining || remaining[remaining.length - 1]?.role !== 'user') {
        return { ok: false, reason: 'nothing-to-retry' };
      }
      const reply = chats.startAssistantMessage(
        state,
        chatId,
        context.model,
        deps.now(),
      );
      if (!reply) return { ok: false, reason: 'unknown-chat' };
      deps.setState(reply.state);
      deps.onMessage(chatId, reply.id);
      return {
        ok: true,
        replyId: reply.id,
        done: generate(chatId, reply.id, context),
      };
    },

    // Stop writing the reply in this chat (what has arrived so far is kept).
    stop(chatId: number): void {
      running.get(chatId)?.abort();
    },

    // Stop everything (the window is closing).
    stopAll(): void {
      for (const controller of running.values()) controller.abort();
    },
  };
}
