import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LlmStatus, LlmTestResult, ModelInfo } from './types';

// The Settings panel's contents: the AI provider's API key, a "test connection"
// button, and the model picker. The key goes to the app and is stored encrypted;
// the app never sends it back, so all this panel ever knows is whether one is
// saved.

const heading: CSSProperties = {
  margin: '18px 0 6px',
  fontSize: 13,
  fontWeight: 600,
};
const note: CSSProperties = {
  margin: '4px 0',
  fontSize: 12,
  lineHeight: 1.45,
  color: '#5f6368',
};
const field: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 32,
  padding: '0 10px',
  border: '1px solid #c4c4c4',
  borderRadius: 8,
  fontSize: 13,
};
const button: CSSProperties = {
  height: 30,
  padding: '0 12px',
  border: '1px solid #c4c4c4',
  borderRadius: 8,
  background: '#ffffff',
  fontSize: 13,
  cursor: 'pointer',
};

const dollars = (amount: number) => `$${amount.toFixed(amount < 1 ? 4 : 2)}`;

const price = (perMillion: number | null) =>
  perMillion === null
    ? '?'
    : perMillion === 0
      ? 'free'
      : `$${perMillion.toFixed(perMillion < 0.1 ? 3 : 2)}`;

const contextSize = (tokens: number | null) =>
  tokens === null ? '' : `${Math.round(tokens / 1000)}k context`;

// How many matches to draw at once (the list has hundreds of models).
const MAX_SHOWN = 60;

function describeTest(result: LlmTestResult): string {
  if (!result.ok) return result.error;
  const spent = result.usage === null ? '' : ` ${dollars(result.usage)} used.`;
  const left =
    result.limitRemaining === null
      ? ' No spending limit on this key.'
      : ` ${dollars(result.limitRemaining)} left under this key's limit.`;
  return `Connected. Key "${result.label}".${spent}${left}`;
}

export function SettingsPanel() {
  const [status, setStatus] = useState<LlmStatus | null>(null);

  // ---- API key ----
  const [keyText, setKeyText] = useState('');
  const [keyMessage, setKeyMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- Test connection ----
  const [test, setTest] = useState<{
    running: boolean;
    text: string;
    ok: boolean;
  } | null>(null);

  // ---- Models ----
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsState, setModelsState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [modelsError, setModelsError] = useState('');
  const [query, setQuery] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [modelMessage, setModelMessage] = useState('');

  useEffect(() => {
    void window.browserApi.llmStatus().then(setStatus);
  }, []);

  const loadModels = useCallback(async (refresh: boolean) => {
    setModelsState('loading');
    const result = await window.browserApi.llmListModels(refresh);
    if (result.ok) {
      setModels(result.models);
      setModelsState('ready');
    } else {
      setModelsError(result.error);
      setModelsState('error');
    }
  }, []);

  useEffect(() => {
    void loadModels(false);
  }, [loadModels]);

  const saveKey = async () => {
    setBusy(true);
    const result = await window.browserApi.llmSaveKey(keyText);
    setKeyText(''); // Never keep the key on screen or in memory longer than needed.
    setStatus(result.status);
    setKeyMessage(
      result.ok
        ? { ok: true, text: 'Key saved.' }
        : { ok: false, text: result.error },
    );
    setTest(null);
    setBusy(false);
    if (result.ok) void loadModels(true);
  };

  const removeKey = async () => {
    setBusy(true);
    setStatus(await window.browserApi.llmRemoveKey());
    setKeyMessage({ ok: true, text: 'Key removed.' });
    setTest(null);
    setBusy(false);
  };

  const testConnection = async () => {
    setTest({ running: true, ok: true, text: 'Testing…' });
    const result = await window.browserApi.llmTestConnection();
    setTest({ running: false, ok: result.ok, text: describeTest(result) });
  };

  const chooseModel = async (id: string | null) => {
    const result = await window.browserApi.llmSetModel(id);
    setStatus(result.status);
    setModelMessage(result.ok ? '' : result.error);
    if (result.ok) setCustomModel('');
  };

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = models.filter((m) => {
      const haystack = `${m.name} ${m.id}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    return { total: matches.length, list: matches.slice(0, MAX_SHOWN) };
  }, [models, query]);

  if (status === null) return <p style={note}>Loading…</p>;

  return (
    <div>
      <h3 style={{ ...heading, marginTop: 4 }}>Provider</h3>
      <p style={{ ...note, color: '#202124', fontSize: 13 }}>OpenRouter</p>

      <h3 style={heading}>API key</h3>
      {!status.encryptionAvailable && (
        <p style={{ ...note, color: '#b3261e' }}>
          Secure storage isn&apos;t available on this computer, so a key
          can&apos;t be saved safely.
        </p>
      )}
      <p style={note}>
        {status.hasKey
          ? 'A key is saved. It is stored encrypted on this computer and is never shown again.'
          : 'No key saved yet. Paste your OpenRouter key below. It is stored encrypted on this computer and is never shown again.'}
      </p>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={keyText}
        onChange={(e) => setKeyText(e.target.value)}
        placeholder={
          status.hasKey
            ? 'Paste a new key to replace it'
            : 'Paste your OpenRouter key'
        }
        aria-label="OpenRouter API key"
        disabled={!status.encryptionAvailable}
        style={field}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => void saveKey()}
          disabled={
            busy || keyText.trim() === '' || !status.encryptionAvailable
          }
          style={button}
        >
          Save key
        </button>
        {status.hasKey && (
          <button
            type="button"
            onClick={() => void removeKey()}
            disabled={busy}
            style={button}
          >
            Remove key
          </button>
        )}
      </div>
      {keyMessage && (
        <p
          style={{ ...note, color: keyMessage.ok ? '#188038' : '#b3261e' }}
          role="status"
        >
          {keyMessage.text}
        </p>
      )}

      <h3 style={heading}>Test connection</h3>
      <button
        type="button"
        onClick={() => void testConnection()}
        disabled={!status.hasKey || test?.running === true}
        style={button}
      >
        Test connection
      </button>
      {test && (
        <p
          style={{ ...note, color: test.ok ? '#188038' : '#b3261e' }}
          role="status"
        >
          {test.text}
        </p>
      )}

      <h3 style={heading}>Model</h3>
      <p style={{ ...note, color: '#202124', fontSize: 13 }}>
        {status.model ? (
          <>
            Using <strong>{status.model}</strong>
          </>
        ) : (
          'No model chosen yet.'
        )}
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search models (for example: claude, llama, free)"
        aria-label="Search models"
        style={field}
      />

      {modelsState === 'loading' && <p style={note}>Loading models…</p>}
      {modelsState === 'error' && (
        <p style={{ ...note, color: '#b3261e' }} role="status">
          {modelsError}
        </p>
      )}
      {modelsState === 'ready' && (
        <>
          <div
            style={{
              marginTop: 8,
              maxHeight: 280,
              overflowY: 'auto',
              border: '1px solid #e0e0e0',
              borderRadius: 8,
            }}
          >
            {shown.list.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void chooseModel(m.id)}
                title={m.id}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  borderBottom: '1px solid #f0f0f0',
                  background: m.id === status.model ? '#e8f0fe' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#5f6368' }}>{m.id}</div>
                <div style={{ fontSize: 11, color: '#5f6368' }}>
                  {[
                    contextSize(m.contextLength),
                    `${price(m.promptPerMillion)} in / ${price(m.completionPerMillion)} out per 1M tokens`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </button>
            ))}
            {shown.list.length === 0 && (
              <p style={{ ...note, padding: '8px 10px' }}>
                No models match that search.
              </p>
            )}
          </div>
          <p style={note}>
            {shown.total > MAX_SHOWN
              ? `Showing the first ${MAX_SHOWN} of ${shown.total}. Type to narrow it down.`
              : `${shown.total} model${shown.total === 1 ? '' : 's'}.`}
          </p>
        </>
      )}
      <button
        type="button"
        onClick={() => void loadModels(true)}
        disabled={modelsState === 'loading'}
        style={button}
      >
        Refresh list
      </button>

      <p style={{ ...note, marginTop: 14 }}>
        Not in the list? Type a model name exactly as OpenRouter writes it:
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={customModel}
          onChange={(e) => setCustomModel(e.target.value)}
          placeholder="provider/model-name"
          aria-label="Model name"
          spellCheck={false}
          style={field}
        />
        <button
          type="button"
          onClick={() => void chooseModel(customModel.trim())}
          disabled={customModel.trim() === ''}
          style={button}
        >
          Use
        </button>
      </div>
      {modelMessage && (
        <p style={{ ...note, color: '#b3261e' }} role="status">
          {modelMessage}
        </p>
      )}
    </div>
  );
}
