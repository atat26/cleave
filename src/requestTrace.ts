// A recorder for model requests, to find out where the context goes. It is OFF unless the app is
// started with AIB_TRACE=1, and it never writes what was said: only sizes (characters), counts and
// tool names, plus what the provider reports (tokens, cost) and the time taken. No page text, no
// messages, no keys. Pure code with no Electron, so it is easy to test; the file is chosen in
// main (see tabs.ts). Used by the AI prompt pipeline inspection (docs/pipeline/).
import type {
  ChatMessageInput,
  StreamEvent,
  ToolDefinition,
} from './openrouter.ts';

// What a request looks like, in sizes.
export interface RequestSummary {
  model: string;
  // Messages by kind.
  messages: number;
  // Characters in the system message, in what you and the assistant said, and in tool results.
  systemChars: number;
  userChars: number;
  assistantChars: number;
  toolResultChars: number;
  // The same tool results, by tool: how many and how many characters.
  toolResults: Record<string, { count: number; chars: number }>;
  // Pictures (base64 characters, as sent).
  images: { count: number; chars: number };
  // The tool definitions as sent, and how many tool-call rounds came before this request.
  toolDefs: { count: number; chars: number };
  rounds: number;
}

export interface TraceEntry extends RequestSummary {
  at: number;
  ms: number;
  firstEventMs: number | null;
  replyChars: number;
  reasoningChars: number;
  // The names of the tools the model asked for in this answer.
  toolCalls: string[];
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    cost: number | null;
  } | null;
  finish: string | null;
  // "aborted", an error kind, or null.
  error: string | null;
}

// The tools as the provider receives them (the same shape streamChat sends).
const asSent = (tools: readonly ToolDefinition[]) =>
  tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

export function summarizeRequest(
  model: string,
  messages: readonly ChatMessageInput[],
  tools?: readonly ToolDefinition[],
): RequestSummary {
  const summary: RequestSummary = {
    model,
    messages: messages.length,
    systemChars: 0,
    userChars: 0,
    assistantChars: 0,
    toolResultChars: 0,
    toolResults: {},
    images: { count: 0, chars: 0 },
    toolDefs: {
      count: tools?.length ?? 0,
      chars:
        tools && tools.length > 0 ? JSON.stringify(asSent(tools)).length : 0,
    },
    rounds: 0,
  };
  // Which tool a result belongs to (from the assistant's request that came before it).
  const toolOf = new Map<string, string>();
  for (const message of messages) {
    if (message.role === 'system') {
      summary.systemChars += message.content.length;
    } else if (message.role === 'user') {
      if (typeof message.content === 'string') {
        summary.userChars += message.content.length;
      } else {
        for (const part of message.content) {
          if (part.type === 'text') summary.userChars += part.text.length;
          else {
            summary.images.count++;
            summary.images.chars += part.data.length;
          }
        }
      }
    } else if (message.role === 'assistant') {
      summary.assistantChars += message.content.length;
      if (message.toolCalls && message.toolCalls.length > 0) {
        summary.rounds++;
        for (const call of message.toolCalls) toolOf.set(call.id, call.name);
      }
    } else {
      const name = toolOf.get(message.toolCallId) ?? 'unknown';
      const row = summary.toolResults[name] ?? { count: 0, chars: 0 };
      row.count++;
      row.chars += message.content.length;
      summary.toolResults[name] = row;
      summary.toolResultChars += message.content.length;
    }
  }
  return summary;
}

type Sink = (entry: TraceEntry) => void;
let sink: Sink | null = null;

// Turn the recorder on (with somewhere to write) or off (null).
export const setTraceSink = (next: Sink | null): void => {
  sink = next;
};
export const tracing = (): boolean => sink !== null;

// Pass a model call through, and when it ends (however it ends) write one entry about it.
export async function* traced(
  request: {
    model: string;
    messages: readonly ChatMessageInput[];
    tools?: readonly ToolDefinition[];
  },
  inner: () => AsyncGenerator<StreamEvent>,
  now: () => number = Date.now,
): AsyncGenerator<StreamEvent> {
  const write = sink;
  if (write === null) {
    yield* inner();
    return;
  }
  const started = now();
  const entry: TraceEntry = {
    ...summarizeRequest(request.model, request.messages, request.tools),
    at: started,
    ms: 0,
    firstEventMs: null,
    replyChars: 0,
    reasoningChars: 0,
    toolCalls: [],
    usage: null,
    finish: null,
    error: null,
  };
  let finished = false;
  try {
    for await (const event of inner()) {
      if (entry.firstEventMs === null) entry.firstEventMs = now() - started;
      if (event.type === 'text') entry.replyChars += event.text.length;
      else if (event.type === 'reasoning')
        entry.reasoningChars += event.text.length;
      else if (event.type === 'usage') {
        entry.usage = {
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          totalTokens: event.totalTokens,
          cost: event.cost,
        };
      } else if (event.type === 'finish') entry.finish = event.reason;
      else if (event.type === 'tool-calls') {
        entry.toolCalls = event.calls.map((call) => call.name);
      }
      yield event;
    }
    finished = true;
  } catch (error) {
    entry.error =
      error instanceof Error && error.name === 'AbortError'
        ? 'aborted'
        : String((error as { kind?: unknown })?.kind ?? 'unknown');
    throw error;
  } finally {
    // The caller stopped reading before the end (Stop): that is "aborted".
    if (!finished && entry.error === null) entry.error = 'aborted';
    entry.ms = now() - started;
    try {
      write(entry);
    } catch {
      // A recorder must never break a chat.
    }
  }
}
