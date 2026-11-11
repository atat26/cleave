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
import type { AgentTools } from './agentTools.ts';
import { ChatError } from './openrouter.ts';
import type {
  ChatMessageInput,
  StreamEvent,
  ToolCall,
  ToolDefinition,
} from './openrouter.ts';

// How many times the assistant may stop to use tools within one reply. After that
// it is asked to answer with what it has.
export const MAX_TOOL_ROUNDS = 6;

export interface RunnerDeps {
  getState(): ChatsState;
  setState(next: ChatsState): void;
  // The model call. In the app this is streamChat() with the API key.
  stream(options: {
    model: string;
    messages: ChatMessageInput[];
    tools?: ToolDefinition[];
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
  // What the chat has linked (titles and addresses), already cleaned; or null.
  linked?: string | null;
  // The read-only tools the assistant may use (null or left out: a plain chat).
  tools?: AgentTools | null;
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
    let conversation: ChatMessageInput[] = buildMessages({
      systemPrompt: context.systemPrompt,
      linkedContext: context.linked ?? null,
      history,
    });
    const tools = context.tools ?? null;

    // Tokens and cost, added up over every request of this reply.
    let tokens: number | null = null;
    let cost: number | null = null;
    let result: Parameters<typeof chats.finishMessage>[3] = { status: 'done' };
    const changed = () => deps.onMessage(chatId, replyId);
    try {
      for (let round = 0; ; round++) {
        // Once the tool rounds are used up the model is asked to just answer.
        const useTools = tools !== null && round < MAX_TOOL_ROUNDS;
        let calls: ToolCall[] = [];
        let roundText = '';
        for await (const event of deps.stream({
          model: context.model,
          messages: conversation,
          tools: useTools ? tools.definitions : undefined,
          signal: controller.signal,
        })) {
          if (event.type === 'text') {
            // Text after a tool round starts a new paragraph.
            const current = chats.findMessage(deps.getState(), chatId, replyId);
            const gap =
              roundText === '' && round > 0 && current && current.content !== ''
                ? '\n\n'
                : '';
            roundText += event.text;
            deps.setState(
              chats.appendToMessage(
                deps.getState(),
                chatId,
                replyId,
                gap + event.text,
              ),
            );
            changed();
          } else if (event.type === 'reasoning') {
            deps.setState(
              chats.appendReasoning(
                deps.getState(),
                chatId,
                replyId,
                event.text,
              ),
            );
            changed();
          } else if (event.type === 'usage') {
            if (event.totalTokens !== null) {
              tokens = (tokens ?? 0) + event.totalTokens;
            }
            if (event.cost !== null) cost = (cost ?? 0) + event.cost;
          } else if (event.type === 'tool-calls') {
            calls = event.calls;
          }
          // Stop pressed: stop reading even if the stream does not notice.
          if (controller.signal.aborted) break;
        }
        if (controller.signal.aborted) break;
        if (!useTools || calls.length === 0) break;

        // The model asked for tools: run each one, show it as a step, and hand
        // what it found back to the model.
        conversation = [
          ...conversation,
          { role: 'assistant', content: roundText, toolCalls: calls },
        ];
        for (const call of calls) {
          if (controller.signal.aborted) break;
          const added = chats.addStep(
            deps.getState(),
            chatId,
            replyId,
            tools.describe(call),
          );
          if (added) {
            deps.setState(added.state);
            changed();
          }
          let outcome: { label: string; ok: boolean; result: string };
          try {
            outcome = await tools.run(call, controller.signal);
          } catch (error) {
            if (controller.signal.aborted) throw error;
            outcome = {
              label: 'A tool failed',
              ok: false,
              result: 'The tool failed. Answer with what you already have.',
            };
          }
          if (added) {
            deps.setState(
              chats.finishStep(
                deps.getState(),
                chatId,
                replyId,
                added.stepId,
                outcome.ok,
                outcome.label,
              ),
            );
            changed();
          }
          conversation.push({
            role: 'tool',
            toolCallId: call.id,
            content: outcome.result,
          });
        }
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
          {
            ...result,
            usage:
              tokens === null && cost === null
                ? null
                : { totalTokens: tokens, cost },
          },
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
    send(
      chatId: number,
      text: string,
      context: RunContext,
      mentions: { kind: string; id: number; tag: string }[] = [],
    ): StartResult {
      if (running.has(chatId)) return { ok: false, reason: 'busy' };
      if (!chats.findConversation(deps.getState(), chatId)) {
        return { ok: false, reason: 'unknown-chat' };
      }
      const added = chats.addUserMessage(
        deps.getState(),
        chatId,
        text,
        deps.now(),
        mentions,
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
