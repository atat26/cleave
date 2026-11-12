import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { APPROVAL_LEVELS, GROUP_TITLES, LEVEL_WORDS } from './toolPolicy';
import type { ApprovalLevel, ToolGroup } from './toolPolicy';
import { requestSettingsSection } from './settingsNav';
import type { ToolRow } from './toolSettings';
import type { SearchStatus } from './types';

const muted: CSSProperties = {
  color: '#5f6368',
  fontSize: 12,
  lineHeight: 1.45,
};

const button: CSSProperties = {
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  borderRadius: 14,
  fontSize: 12,
  padding: '4px 12px',
  cursor: 'pointer',
  color: '#202124',
};

const GROUPS: ToolGroup[] = ['look', 'act', 'artifacts', 'chat'];

// What each level means, in plain words.
const LEVEL_HELP: Record<ApprovalLevel, string> = {
  always: 'It just happens, with no question.',
  'if-safe':
    'It happens unless it is risky (buying, sending, deleting, the Enter key, another website). Risky ones still ask.',
  ask: 'An approval card appears every time.',
  never: 'The assistant is not given this tool at all.',
};

// The Tools panel: what the assistant can do, and how much of it it may do without
// asking. A change applies from the assistant's next reply and is saved.
export function ToolsPanel() {
  const [rows, setRows] = useState<ToolRow[] | null>(null);
  // A tool waiting for you to confirm "Always allow" (it changes things).
  const [confirming, setConfirming] = useState<string | null>(null);

  // Web search needs setting up: whether it is, for the row that says so.
  const [search, setSearch] = useState<SearchStatus | null>(null);

  useEffect(() => {
    void window.browserApi.toolsList().then(setRows);
    void window.browserApi.searchStatus().then(setSearch);
  }, []);

  if (rows === null) return <p style={muted}>Loading…</p>;

  const apply = async (tool: string, level: ApprovalLevel) => {
    setConfirming(null);
    setRows(await window.browserApi.toolsSetLevel(tool, level));
  };

  // Choosing "Always allow" for something that changes things asks first.
  const choose = (row: ToolRow, level: ApprovalLevel) => {
    if (level === 'always' && row.changesThings && row.level !== 'always') {
      setConfirming(row.name);
    } else {
      void apply(row.name, level);
    }
  };

  const changed = rows.some((row) => row.level !== row.defaultLevel);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ ...muted, margin: 0 }}>
        Choose how much the assistant may do on its own. A change applies from
        its next reply.
      </p>

      <div style={{ ...muted, display: 'grid', gap: 2 }}>
        {APPROVAL_LEVELS.map((level) => (
          <div key={level}>
            <strong style={{ color: '#202124' }}>{LEVEL_WORDS[level]}:</strong>{' '}
            {LEVEL_HELP[level]}
          </div>
        ))}
      </div>

      {GROUPS.map((group) => (
        <section key={group} aria-label={GROUP_TITLES[group]}>
          <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>
            {GROUP_TITLES[group]}
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {rows
              .filter((row) => row.group === group)
              .map((row) => (
                <div
                  key={row.name}
                  style={{
                    border: '1px solid #e3e3e3',
                    borderRadius: 8,
                    padding: '8px 10px',
                    background: row.level === 'never' ? '#f8f9fa' : '#ffffff',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: row.level === 'never' ? '#80868b' : '#202124',
                        }}
                      >
                        {row.title}
                      </div>
                      <div style={muted}>{row.summary}</div>
                      {row.setup === 'web-search' && search !== null && (
                        <div
                          style={{
                            ...muted,
                            whiteSpace: 'nowrap',
                            color: search.hasKey ? '#188038' : '#b3261e',
                          }}
                        >
                          {search.hasKey
                            ? (search.providers.find(
                                (p) => p.id === search.provider,
                              )?.name ?? 'Provider')
                            : 'Not set up yet'}
                        </div>
                      )}
                      {row.level !== row.defaultLevel && (
                        <button
                          type="button"
                          title={`Put this back to its default: ${LEVEL_WORDS[row.defaultLevel]}`}
                          onClick={() => void apply(row.name, row.defaultLevel)}
                          style={{
                            ...button,
                            marginTop: 4,
                            padding: '2px 10px',
                            color: '#1a73e8',
                            borderColor: '#c6dafc',
                          }}
                        >
                          Return to default
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
                      <select
                        aria-label={`How to handle: ${row.title}`}
                        value={row.level}
                        onChange={(e) =>
                          choose(row, e.target.value as ApprovalLevel)
                        }
                        style={{
                          fontSize: 12,
                          padding: '4px 6px',
                          borderRadius: 8,
                          border: '1px solid #d0d0d0',
                          background: '#ffffff',
                        }}
                      >
                        {APPROVAL_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {LEVEL_WORDS[level]}
                          </option>
                        ))}
                      </select>
                      {row.setup === 'web-search' && (
                        <button
                          type="button"
                          onClick={() => {
                            requestSettingsSection('web-search');
                            window.browserApi.openSettings();
                          }}
                          style={{
                            ...button,
                            padding: '0 7px',
                            fontSize: 11,
                            color: '#1a73e8',
                            borderColor: '#c6dafc',
                          }}
                        >
                          Settings
                        </button>
                      )}
                    </div>
                  </div>

                  {confirming === row.name && (
                    <div
                      role="alert"
                      style={{
                        marginTop: 8,
                        padding: '8px 10px',
                        background: '#fef7e0',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#202124',
                        lineHeight: 1.45,
                      }}
                    >
                      Allow this without asking?{' '}
                      {row.warning ??
                        `The assistant will be able to ${row.title.toLowerCase()} on its own, including risky things such as buying or sending.`}{' '}
                      The safety rules below still apply.
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => void apply(row.name, 'always')}
                          style={{
                            ...button,
                            background: '#b3261e',
                            color: '#ffffff',
                            border: 'none',
                          }}
                        >
                          Allow without asking
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          style={button}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}

      <div
        style={{
          ...muted,
          padding: '8px 10px',
          background: '#f1f3f4',
          borderRadius: 8,
        }}
      >
        Never allowed, whatever you choose here: typing in password, card or
        code fields; accepting terms or cookies for you; downloads; and acting
        in tabs that are not linked to the chat.
      </div>

      <div>
        <button
          type="button"
          disabled={!changed}
          onClick={() => void window.browserApi.toolsReset().then(setRows)}
          style={{
            ...button,
            cursor: changed ? 'pointer' : 'default',
            opacity: changed ? 1 : 0.5,
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
