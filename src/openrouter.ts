// A client for OpenRouter (https://openrouter.ai): streaming chat, checking an API
// key, and listing models. It follows OpenRouter's documented formats. It uses no
// Electron: the network call (`fetchImpl`) is passed in, so this can be tested
// with a fake network, and the app passes Electron's own.
//
// Three rules this file keeps:
//   - The address is fixed (below). Nothing from outside can choose where we send
//     the API key.
//   - The API key is only ever used in the Authorization header. It is never put
//     in an error, a log, or anything returned.
//   - Error messages are written here, in plain words. Raw text from the server
//     is never shown to the user.
import { createSseParser } from './sse.ts';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// The network call, in the shape of the standard fetch().
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// ---- Errors ----------------------------------------------------------------

export type ChatErrorKind =
  | 'auth' // the key was not accepted
  | 'credit' // no credit left
  | 'rate-limit' // too many requests
  | 'timeout'
  | 'provider' // the model or its provider is down or overloaded
  | 'bad-request' // e.g. an unknown model name
  | 'blocked' // permissions or content rules
  | 'network' // could not reach OpenRouter at all
  | 'unknown';

const MESSAGES: Record<ChatErrorKind, string> = {
  auth: "OpenRouter didn't accept your API key. Check it in Settings.",
  credit: 'Your OpenRouter account has no credit left for this request.',
  'rate-limit': 'OpenRouter is rate limiting this key. Try again in a moment.',
  timeout: 'The request timed out. Try again.',
  provider:
    'The model or its provider is unavailable right now. Try again, or pick another model.',
  'bad-request':
    "OpenRouter couldn't use that request. Check the model name in Settings.",
  blocked: 'OpenRouter blocked this request (permissions or content rules).',
  network: "Couldn't reach OpenRouter. Check your internet connection.",
  unknown: 'Something went wrong talking to OpenRouter.',
};

// The plain-language text for a kind of failure (written here, never from the
// server). The chat uses this to show a message that failed.
export const errorMessage = (kind: ChatErrorKind): string => MESSAGES[kind];

// An error whose message is safe to show to the user.
export class ChatError extends Error {
  readonly kind: ChatErrorKind;
  constructor(kind: ChatErrorKind) {
    super(MESSAGES[kind]);
    this.name = 'ChatError';
    this.kind = kind;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Work out what kind of failure this was. OpenRouter describes errors as
// { error: { code, message, metadata: { error_type } } }. `code` is normally a
// number (the HTTP-style status), but the docs also show a string, so both are
// handled. `error_type` is the most reliable, then the code, then the HTTP status.
export function errorKind(status: number | null, body: unknown): ChatErrorKind {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const metadata = error && isRecord(error.metadata) ? error.metadata : null;

  const type =
    metadata && typeof metadata.error_type === 'string'
      ? metadata.error_type
      : '';
  switch (type) {
    case 'authentication':
      return 'auth';
    case 'payment_required':
      return 'credit';
    case 'rate_limit_exceeded':
      return 'rate-limit';
    case 'timeout':
      return 'timeout';
    case 'provider_unavailable':
    case 'provider_overloaded':
    case 'server':
      return 'provider';
  }

  const code = error && typeof error.code === 'number' ? error.code : status;
  switch (code) {
    case 400:
      return 'bad-request';
    case 401:
      return 'auth';
    case 402:
      return 'credit';
    case 403:
      return 'blocked';
    case 408:
    case 504:
      return 'timeout';
    case 429:
      return 'rate-limit';
    case 500:
    case 502:
    case 503:
      return 'provider';
  }
  return 'unknown';
}

// Turn a failed HTTP response (anything but 200) into an error. At most the first
// 20,000 characters are read, and only the shape is looked at.
async function errorFromResponse(response: Response): Promise<ChatError> {
  let body: unknown = null;
  try {
    body = JSON.parse((await response.text()).slice(0, 20_000));
  } catch {
    // Not JSON: fall back on the status code alone.
  }
  return new ChatError(errorKind(response.status, body));
}

// A cancelled request is not an error to show: let it pass through untouched.
const isAbort = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError';

// ---- Streaming chat ---------------------------------------------------------

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | {
      type: 'usage';
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
      cost: number | null;
    }
  | { type: 'finish'; reason: string | null };

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

// What one SSE event's data means. `data: [DONE]` ends the stream; keep-alive
// comments never get here (the SSE parser drops them); anything unreadable is
// skipped rather than crashing the chat.
export function interpretData(data: string): {
  events: StreamEvent[];
  done: boolean;
  error: ChatError | null;
} {
  const nothing = { events: [], done: false, error: null };
  if (data.trim() === '[DONE]') return { ...nothing, done: true };

  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return nothing;
  }
  if (!isRecord(json)) return nothing;

  // A mid-stream error: the HTTP status was already 200, so it comes as an event.
  // It can even be the first and only event.
  if (isRecord(json.error)) {
    return { ...nothing, error: new ChatError(errorKind(null, json)) };
  }

  const events: StreamEvent[] = [];
  const choice =
    Array.isArray(json.choices) && isRecord(json.choices[0])
      ? json.choices[0]
      : null;

  if (choice) {
    const delta = isRecord(choice.delta) ? choice.delta : null;
    if (delta && typeof delta.content === 'string' && delta.content !== '') {
      events.push({ type: 'text', text: delta.content });
    }
    if (typeof choice.finish_reason === 'string') {
      if (choice.finish_reason === 'error') {
        return { events, done: false, error: new ChatError('provider') };
      }
      events.push({ type: 'finish', reason: choice.finish_reason });
    }
  }

  // The last chunk before [DONE] carries the token counts (and the cost).
  if (isRecord(json.usage)) {
    events.push({
      type: 'usage',
      promptTokens: num(json.usage.prompt_tokens),
      completionTokens: num(json.usage.completion_tokens),
      totalTokens: num(json.usage.total_tokens),
      cost: num(json.usage.cost),
    });
  }
  return { events, done: false, error: null };
}

const headers = (apiKey: string, json = false): Record<string, string> => ({
  Authorization: `Bearer ${apiKey}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

// Send a conversation and get the reply back piece by piece. Stops quietly (an
// "AbortError") if `signal` is aborted: that is how the Stop button works, and
// OpenRouter stops generating when the connection closes.
export async function* streamChat(options: {
  apiKey: string;
  model: string;
  messages: ChatMessageInput[];
  signal?: AbortSignal;
  fetchImpl: FetchLike;
}): AsyncGenerator<StreamEvent> {
  const { apiKey, model, messages, signal, fetchImpl } = options;

  let response: Response;
  try {
    response = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: headers(apiKey, true),
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ChatError('network');
  }
  if (!response.ok) throw await errorFromResponse(response);
  if (!response.body) throw new ChatError('unknown');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  try {
    for (;;) {
      let read: ReadableStreamReadResult<Uint8Array>;
      try {
        read = await reader.read();
      } catch (error) {
        if (isAbort(error)) throw error;
        throw new ChatError('network'); // The connection dropped mid-reply.
      }
      const text = read.done
        ? decoder.decode()
        : decoder.decode(read.value, { stream: true });
      const events = read.done
        ? [...parser.push(text), ...parser.flush()]
        : parser.push(text);

      for (const event of events) {
        const result = interpretData(event.data);
        yield* result.events;
        if (result.error) throw result.error;
        if (result.done) return;
      }
      if (read.done) return;
    }
  } finally {
    // Closing the connection also tells OpenRouter to stop generating.
    reader.cancel().catch(() => undefined);
  }
}

// ---- Checking a key ----------------------------------------------------------

export interface KeyInfo {
  // The name you gave the key on openrouter.ai.
  label: string;
  // Credit used so far, and the key's own spending limit and what is left of it
  // (null means no limit). Amounts are in US dollars.
  usage: number | null;
  limit: number | null;
  limitRemaining: number | null;
}

// Ask OpenRouter about the key (GET /key). A good answer proves the key works.
export async function checkKey(
  apiKey: string,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<KeyInfo> {
  let response: Response;
  try {
    response = await fetchImpl(`${OPENROUTER_BASE}/key`, {
      headers: headers(apiKey),
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ChatError('network');
  }
  if (!response.ok) throw await errorFromResponse(response);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ChatError('unknown');
  }
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  if (!data || typeof data.label !== 'string') throw new ChatError('unknown');
  return {
    label: data.label,
    usage: num(data.usage),
    limit: num(data.limit),
    limitRemaining: num(data.limit_remaining),
  };
}

// ---- Listing models ------------------------------------------------------------

export interface ModelInfo {
  // What you send as the model name, e.g. "anthropic/claude-sonnet-4".
  id: string;
  name: string;
  contextLength: number | null;
  // US dollars per million tokens (null if OpenRouter did not say).
  promptPerMillion: number | null;
  completionPerMillion: number | null;
}

const MAX_MODELS = 3000;
const MODEL_ID = /^[A-Za-z0-9_.:/~-]{1,200}$/;

// OpenRouter gives prices as strings in dollars per TOKEN ("0.00003"); show them
// per million tokens, which is how people compare models.
function perMillion(price: unknown): number | null {
  if (typeof price !== 'string' && typeof price !== 'number') return null;
  const perToken = Number(price);
  if (!Number.isFinite(perToken) || perToken < 0) return null;
  return perToken * 1_000_000;
}

// Read OpenRouter's model list defensively: anything odd is skipped.
export function parseModels(body: unknown): ModelInfo[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  const models: ModelInfo[] = [];
  for (const item of body.data) {
    if (models.length >= MAX_MODELS) break;
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !MODEL_ID.test(item.id)
    ) {
      continue;
    }
    const pricing = isRecord(item.pricing) ? item.pricing : {};
    models.push({
      id: item.id,
      name:
        typeof item.name === 'string' && item.name !== ''
          ? item.name.slice(0, 120)
          : item.id,
      contextLength: num(item.context_length),
      promptPerMillion: perMillion(pricing.prompt),
      completionPerMillion: perMillion(pricing.completion),
    });
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch the model list. The docs do not say whether a key is needed, so it is
// sent when there is one and the call is tried without one otherwise.
export async function listModels(
  apiKey: string | null,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${OPENROUTER_BASE}/models`, {
      headers: apiKey === null ? {} : headers(apiKey),
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ChatError('network');
  }
  if (!response.ok) throw await errorFromResponse(response);
  try {
    return parseModels(await response.json());
  } catch {
    throw new ChatError('unknown');
  }
}

// Is this a model name we are willing to send? (Used before saving a choice.)
export const isValidModelId = (value: unknown): value is string =>
  typeof value === 'string' && MODEL_ID.test(value);
