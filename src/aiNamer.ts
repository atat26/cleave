// Naming things with the model, for the main process: finds the key and model,
// makes the call (with a time limit) and hands back the checked result (see
// naming.ts). The key is only read at the moment of the call.
import type { LlmContext } from './llm';
import { requestName } from './naming';
import type { NameKind, NameResult } from './naming';
import { streamChat } from './openrouter';

const NAMING_TIMEOUT_MS = 25_000;

export type Namer = (
  kind: NameKind,
  material: string,
  // The model to use, or null for the default one from Settings.
  model: string | null,
) => Promise<NameResult>;

export function createNamer(getLlm: () => LlmContext | null): Namer {
  return async (kind, material, modelChoice) => {
    const llm = getLlm();
    const apiKey = llm?.getApiKey() ?? null;
    if (llm === null || apiKey === null) {
      return { ok: false, error: 'Add your API key in Settings first.' };
    }
    const model = modelChoice ?? llm.getSettings().model;
    if (model === null) {
      return { ok: false, error: 'Choose a model in Settings first.' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAMING_TIMEOUT_MS);
    try {
      return await requestName({
        kind,
        material,
        signal: controller.signal,
        stream: ({ messages, signal }) =>
          streamChat({
            apiKey,
            model,
            messages,
            signal,
            fetchImpl: llm.fetchImpl,
          }),
      });
    } finally {
      clearTimeout(timer);
    }
  };
}
