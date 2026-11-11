import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SearchStatus } from './types';

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

// Settings > Web search: which search provider to use and its key. The key is
// stored encrypted by the app and is never shown again. Whether the assistant may
// search on its own is set in the Tools panel.
export function WebSearchSettings() {
  const [status, setStatus] = useState<SearchStatus | null>(null);
  const [keyText, setKeyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    void window.browserApi.searchStatus().then(setStatus);
  }, []);

  if (status === null) return <p style={note}>Loading…</p>;

  const provider =
    status.providers.find((p) => p.id === status.provider) ??
    status.providers[0];

  const saveKey = async () => {
    setBusy(true);
    setMessage(null);
    const result = await window.browserApi.searchSaveKey(keyText);
    setBusy(false);
    setStatus(result.status);
    if (result.ok) {
      setKeyText(''); // The key is not kept on screen.
      setMessage({ ok: true, text: 'Key saved.' });
    } else {
      setMessage({ ok: false, text: result.error });
    }
  };

  const removeKey = async () => {
    setMessage(null);
    setStatus(await window.browserApi.searchRemoveKey());
    setMessage({ ok: true, text: 'Key removed.' });
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    const result = await window.browserApi.searchTest();
    setBusy(false);
    setMessage(
      result.ok
        ? {
            ok: true,
            text: `It works: the search returned ${result.count} result${result.count === 1 ? '' : 's'}.`,
          }
        : { ok: false, text: result.error },
    );
  };

  return (
    <>
      <h3 style={{ ...heading, marginTop: 4 }}>Provider</h3>
      <select
        aria-label="Search provider"
        value={status.provider}
        onChange={(e) =>
          void window.browserApi
            .searchSetProvider(e.target.value)
            .then(setStatus)
        }
        style={{ ...field, background: '#ffffff' }}
      >
        {status.providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <p style={note}>
        Get a key at {provider.site}. Check the provider&apos;s site for its
        current limits and prices.
      </p>

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
          : `No key saved yet. Paste your ${provider.name} key below. It is stored encrypted on this computer and is never shown again.`}
      </p>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={keyText}
        onChange={(e) => {
          setKeyText(e.target.value);
          setMessage(null);
        }}
        placeholder={
          status.hasKey ? 'Paste a new key to replace it' : 'Paste your key'
        }
        aria-label="Search API key"
        style={field}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
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
        <button
          type="button"
          onClick={() => void test()}
          disabled={busy || !status.hasKey}
          style={button}
        >
          Test
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
      {message && (
        <p
          role="status"
          style={{ ...note, color: message.ok ? '#188038' : '#b3261e' }}
        >
          {message.text}
        </p>
      )}

      <h3 style={heading}>Privacy and approvals</h3>
      <p style={note}>
        What the assistant searches for is sent to {provider.name}. By default
        every search is approved on a card in the chat, and a search that could
        carry something private (an email address, a web address, a long number)
        always asks.
      </p>
      <button
        type="button"
        onClick={() => window.browserApi.togglePanel('tools')}
        style={{ ...button, marginTop: 4 }}
      >
        Change search permissions in Tools
      </button>
    </>
  );
}
