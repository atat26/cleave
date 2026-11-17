import { useCallback, useEffect, useMemo, useState } from 'react';
import { onSectionRequested, takeRequestedSection } from './settingsNav';
import { AppearanceSettings } from './AppearanceSettings';
import { DownloadsSection } from './DownloadsSection';
import { PrivacySection } from './PrivacySection';
import { NewTabSection } from './NewTabSection';
import { SearchEngineSection } from './SearchEngineSection';
import { ShortcutsSection } from './ShortcutsSection';
import { LibrarySection } from './LibrarySection';
import { NamingSection } from './NamingSection';
import { WebSearchSettings } from './WebSearchSettings';
import type { CSSProperties } from 'react';
import { MAX_SYSTEM_PROMPT } from './providerSettings';
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
  color: 'var(--c-text-2)',
};
const field: CSSProperties = {
  background: 'var(--c-surface)',
  color: 'var(--c-text)',
  width: '100%',
  boxSizing: 'border-box',
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--c-border-strong)',
  borderRadius: 8,
  fontSize: 13,
};
const button: CSSProperties = {
  color: 'var(--c-text)',
  height: 30,
  padding: '0 12px',
  border: '1px solid var(--c-border-strong)',
  borderRadius: 8,
  background: 'var(--c-surface)',
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

// The parts of Settings. Settings opens as a list of these; each opens on its own
// page with a Back button. To add one, add it here and give it a block in
// SettingsPanel below.
const SECTIONS = [
  {
    id: 'appearance',
    label: 'Appearance',
    about: 'Light, dark, or match your computer',
  },
  {
    id: 'downloads',
    label: 'Downloads',
    about: 'Where files are saved',
  },
  {
    id: 'new-tab',
    label: 'New tab',
    about: 'Auto mode and suggestions',
  },
  {
    id: 'search-engine',
    label: 'Search engine',
    about: 'Where address-bar searches go',
  },
  {
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    about: 'Every shortcut, with a search',
  },
  {
    id: 'privacy',
    label: 'Privacy and security',
    about: 'Site permissions and clearing data',
  },
  {
    id: 'library',
    label: 'Library',
    about: 'History and recently deleted items',
  },
  {
    id: 'naming',
    label: 'Naming',
    about: 'Let the assistant name new chats',
  },
  {
    id: 'model',
    label: 'Model & provider',
    about: 'API key, test connection, models and pins',
  },
  {
    id: 'prompt',
    label: 'System prompt',
    about: 'Instructions the model follows in every chat',
  },
  {
    id: 'web-search',
    label: 'Web search',
    about: 'Search provider and key for the assistant',
  },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

// The list you see when Settings opens: one row per section.
function SectionList({ onOpen }: { onOpen: (id: SectionId) => void }) {
  return (
    <nav aria-label="Settings sections">
      {SECTIONS.map(({ id, label, about }) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            gap: 8,
            padding: '12px 4px',
            border: 'none',
            borderBottom: '1px solid var(--c-border)',
            background: 'transparent',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
              {label}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--c-text-2)',
              }}
            >
              {about}
            </span>
          </span>
          <span
            aria-hidden="true"
            style={{ color: 'var(--c-text-3)', fontSize: 18 }}
          >
            ›
          </span>
        </button>
      ))}
    </nav>
  );
}

// The bar at the top of a section: a Back button (to the list) and its name. It
// stays in view while you scroll.
function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '0 -16px 8px',
        padding: '6px 16px',
        background: 'var(--c-surface)',
        borderBottom: '1px solid var(--c-border)',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Settings"
        title="Back"
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--c-accent)',
          padding: '4px 6px 4px 0',
        }}
      >
        ‹ Back
      </button>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
    </div>
  );
}

// "128k context · $2.50 in / $10.00 out per 1M tokens · reads pages · sees images"
// (what a model can do is shown only when the model list says so)
function detailOf(m: ModelInfo): string {
  return [
    contextSize(m.contextLength),
    `${price(m.promptPerMillion)} in / ${price(m.completionPerMillion)} out per 1M tokens`,
    m.supportsTools === true ? 'reads pages' : '',
    m.supportsImages === true ? 'sees images' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

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

  // ---- System prompt ----
  // What is in the box (null until the settings have loaded).
  const [promptText, setPromptText] = useState<string | null>(null);
  const [promptMessage, setPromptMessage] = useState('');

  // Which part of Settings is showing.
  // (null = the list of sections.)
  // (It can open on a given part, when another panel linked here.)
  const [section, setSection] = useState<SectionId | null>(() =>
    takeRequestedSection(),
  );

  useEffect(
    () =>
      onSectionRequested(() => {
        const asked = takeRequestedSection();
        if (asked) setSection(asked);
      }),
    [],
  );

  useEffect(() => {
    void window.browserApi.llmStatus().then((loaded) => {
      setStatus(loaded);
      setPromptText(loaded.systemPrompt ?? loaded.defaultSystemPrompt);
    });
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

  const togglePin = async (id: string) => {
    const result = await window.browserApi.llmTogglePin(id);
    setStatus(result.status);
    setModelMessage(result.ok ? '' : result.error);
  };

  const shownPrompt = status?.systemPrompt ?? status?.defaultSystemPrompt ?? '';
  const promptChanged = promptText !== null && promptText !== shownPrompt;

  const applyPrompt = async (text: string | null, done: string) => {
    const result = await window.browserApi.llmSetSystemPrompt(text);
    setStatus(result.status);
    setPromptText(
      result.status.systemPrompt ?? result.status.defaultSystemPrompt,
    );
    setPromptMessage(result.ok ? done : result.error);
  };
  // Saving the default text exactly as it is just means "use the default".
  const savePrompt = () =>
    applyPrompt(
      promptText !== null &&
        promptText.trim() === status?.defaultSystemPrompt.trim()
        ? null
        : promptText,
      'Saved.',
    );
  const resetPrompt = () => applyPrompt(null, 'Back to the default.');

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = models.filter((m) => {
      const haystack = `${m.name} ${m.id}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    return { total: matches.length, list: matches.slice(0, MAX_SHOWN) };
  }, [models, query]);

  // Settings opens on the list of sections.
  if (section === null) return <SectionList onOpen={setSection} />;

  if (status === null) {
    return (
      <div>
        <BackBar title="Loading…" onBack={() => setSection(null)} />
      </div>
    );
  }

  return (
    <div>
      <BackBar
        title={SECTIONS.find((s) => s.id === section)?.label ?? 'Settings'}
        onBack={() => setSection(null)}
      />

      {section === 'model' && (
        <>
          <h3 style={{ ...heading, marginTop: 4 }}>Provider</h3>
          <p style={{ ...note, color: 'var(--c-text)', fontSize: 13 }}>
            OpenRouter
          </p>

          <h3 style={heading}>API key</h3>
          {!status.encryptionAvailable && (
            <p style={{ ...note, color: 'var(--c-danger)' }}>
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
              style={{
                ...note,
                color: keyMessage.ok ? 'var(--c-ok)' : 'var(--c-danger)',
              }}
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
              style={{
                ...note,
                color: test.ok ? 'var(--c-ok)' : 'var(--c-danger)',
              }}
              role="status"
            >
              {test.text}
            </p>
          )}

          <h3 style={heading}>Model</h3>
          <p style={{ ...note, color: 'var(--c-text)', fontSize: 13 }}>
            {status.model ? (
              <>
                Default for new chats: <strong>{status.model}</strong>
              </>
            ) : (
              'No default model chosen yet.'
            )}
          </p>
          <p style={note}>
            Pin models with ☆ to switch between them quickly in the chat. Each
            chat remembers its own model.
          </p>

          {status.pinned.length > 0 && (
            <>
              <p style={{ ...note, fontWeight: 600, color: 'var(--c-text)' }}>
                Pinned
              </p>
              <div
                style={{
                  border: '1px solid var(--c-border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {status.pinned.map((id) => {
                  const known = models.find((m) => m.id === id);
                  return (
                    <ModelRow
                      key={id}
                      id={id}
                      name={known?.name ?? id}
                      detail={known ? detailOf(known) : ''}
                      selected={id === status.model}
                      pinned
                      onChoose={() => void chooseModel(id)}
                      onTogglePin={() => void togglePin(id)}
                    />
                  );
                })}
              </div>
            </>
          )}

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
            <p style={{ ...note, color: 'var(--c-danger)' }} role="status">
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
                  border: '1px solid var(--c-border)',
                  borderRadius: 8,
                }}
              >
                {shown.list.map((m) => (
                  <ModelRow
                    key={m.id}
                    id={m.id}
                    name={m.name}
                    detail={detailOf(m)}
                    selected={m.id === status.model}
                    pinned={status.pinned.includes(m.id)}
                    onChoose={() => void chooseModel(m.id)}
                    onTogglePin={() => void togglePin(m.id)}
                  />
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
            <p style={{ ...note, color: 'var(--c-danger)' }} role="status">
              {modelMessage}
            </p>
          )}
        </>
      )}

      {section === 'web-search' && <WebSearchSettings />}
      {section === 'appearance' && <AppearanceSettings />}
      {section === 'naming' && <NamingSection />}
      {section === 'library' && <LibrarySection />}
      {section === 'downloads' && <DownloadsSection />}
      {section === 'privacy' && <PrivacySection />}
      {section === 'search-engine' && <SearchEngineSection />}
      {section === 'new-tab' && <NewTabSection />}
      {section === 'shortcuts' && <ShortcutsSection />}

      {section === 'prompt' && (
        <>
          <h3 style={{ ...heading, marginTop: 4 }}>System prompt</h3>
          <p style={note}>
            Instructions the model follows in every chat.{' '}
            {status.systemPrompt === null
              ? 'You are using the default.'
              : 'You are using your own.'}
          </p>
          <textarea
            value={promptText ?? ''}
            onChange={(e) => {
              setPromptText(e.target.value);
              setPromptMessage('');
            }}
            rows={7}
            maxLength={MAX_SYSTEM_PROMPT}
            aria-label="System prompt"
            spellCheck
            style={{
              ...field,
              height: 'auto',
              padding: 10,
              resize: 'vertical',
              lineHeight: 1.4,
              fontFamily: 'inherit',
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => void savePrompt()}
              disabled={!promptChanged}
              style={button}
            >
              Save prompt
            </button>
            <button
              type="button"
              onClick={() => void resetPrompt()}
              disabled={status.systemPrompt === null && !promptChanged}
              style={button}
            >
              Reset to default
            </button>
            <span style={note}>
              {(promptText ?? '').length} / {MAX_SYSTEM_PROMPT}
            </span>
          </div>
          {promptMessage && (
            <p style={{ ...note, color: 'var(--c-ok)' }} role="status">
              {promptMessage}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// One model in a list: click it to make it the default for new chats; the star
// pins it (a quick choice in the chat) or unpins it.
function ModelRow({
  id,
  name,
  detail,
  selected,
  pinned,
  onChoose,
  onTogglePin,
}: {
  id: string;
  name: string;
  detail: string;
  selected: boolean;
  pinned: boolean;
  onChoose: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid var(--c-border)',
        background: selected ? 'var(--c-accent-tint)' : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={onChoose}
        title={`Use ${id} as the default model`}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          padding: '8px 10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--c-text-2)',
            overflowWrap: 'anywhere',
          }}
        >
          {id}
        </div>
        {detail && (
          <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{detail}</div>
        )}
      </button>
      <button
        type="button"
        aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
        aria-pressed={pinned}
        title={pinned ? 'Unpin' : 'Pin (a quick choice in the chat)'}
        onClick={onTogglePin}
        style={{
          border: 'none',
          background: 'transparent',
          fontSize: 17,
          padding: '0 12px',
          cursor: 'pointer',
          color: pinned ? 'var(--c-warn)' : 'var(--c-text-3)',
        }}
      >
        {pinned ? '★' : '☆'}
      </button>
    </div>
  );
}
