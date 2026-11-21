import { useEffect, useState } from 'react';
import { formatBytes } from './backupFormat';
import type { BackupSummary } from './backupFormat';
import type { BackupInfo } from './types';
import { Button, Switch } from './ui/controls';

const when = (iso: string) =>
  iso === '' ? 'an unknown time' : new Date(iso).toLocaleString();

const describe = (summary: BackupSummary) =>
  `${summary.files} settings and content files and ${summary.uploads} uploaded file${summary.uploads === 1 ? '' : 's'} (${formatBytes(summary.bytes)}); saved API keys ${summary.includesKeys ? 'included' : 'not included'}.`;

// Settings > Backup and restore: save a copy of your Spaces, chats, history and settings to a folder
// you choose, or put a copy back. A restore asks first, keeps what you have now in a before-restore
// folder, and restarts Cleave to swap the files in.
export function BackupSection() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // A backup that was picked and checked, waiting for you to confirm.
  const [chosen, setChosen] = useState<{
    folder: string;
    summary: BackupSummary;
  } | null>(null);

  const refresh = () => void window.browserApi.backupInfo().then(setInfo);
  useEffect(refresh, []);

  const backUp = async () => {
    setBusy(true);
    setMessage(null);
    setChosen(null);
    const result = await window.browserApi.backupCreate(includeKeys);
    setBusy(false);
    if (result.kind === 'ok') {
      setMessage(
        `Backed up ${describe(result.summary)} Saved in: ${result.folder}`,
      );
    } else if (result.kind === 'error') {
      setMessage(result.message);
    }
  };

  const chooseRestore = async () => {
    setBusy(true);
    setMessage(null);
    const result = await window.browserApi.backupChooseRestore();
    setBusy(false);
    if (result.kind === 'ok') {
      setChosen({ folder: result.folder, summary: result.summary });
    } else {
      setChosen(null);
      if (result.kind === 'error') setMessage(result.message);
    }
  };

  const restore = async () => {
    setBusy(true);
    const result = await window.browserApi.backupRestore();
    // On success Cleave restarts in a moment.
    setMessage(result.message);
    if (!result.ok) {
      setBusy(false);
      setChosen(null);
    }
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
        A backup is a folder holding your Spaces, chats, artifacts, bookmarks,
        history, settings and uploaded files. It does not hold extensions (add
        them again from the Chrome Web Store) or website logins and site data,
        so after a restore you will be signed out of websites. Keep backups
        somewhere other than this computer too.
      </div>

      <label
        className="row-flex"
        style={{ gap: 'var(--s-3)', justifyContent: 'space-between' }}
      >
        <span>
          Include my saved API keys
          <span
            className="muted"
            style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
          >
            They stay encrypted and only work for your Windows account on this
            computer. Leave this off if the backup will be stored where others
            can reach it.
          </span>
        </span>
        <Switch
          label="Include my saved API keys"
          checked={includeKeys}
          onChange={setIncludeKeys}
          disabled={busy}
        />
      </label>

      <div className="row-flex" style={{ gap: 'var(--s-3)' }}>
        <Button
          variant="primary"
          loading={busy && chosen === null}
          disabled={busy}
          onClick={() => void backUp()}
        >
          Back up now…
        </Button>
        <Button disabled={busy} onClick={() => void chooseRestore()}>
          Restore from a backup…
        </Button>
      </div>

      {chosen !== null && (
        <div
          role="group"
          aria-label="Confirm the restore"
          style={{
            border: '1px solid var(--c-border-strong)',
            borderRadius: 8,
            padding: 'var(--s-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-3)',
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>
              Restore the backup made {when(chosen.summary.createdAt)}?
            </div>
            <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              It holds {describe(chosen.summary)} It was made by Cleave{' '}
              {chosen.summary.appVersion}.
            </div>
            <div
              className="muted"
              style={{ fontSize: 'var(--fs-xs)', wordBreak: 'break-all' }}
            >
              {chosen.folder}
            </div>
          </div>
          <div style={{ fontSize: 'var(--fs-xs)' }}>
            This replaces your current Spaces, chats, history and settings with
            the ones in the backup. Cleave keeps what you have now in a folder
            called “before-restore…” inside your data folder, then restarts.
          </div>
          <div className="row-flex" style={{ gap: 'var(--s-3)' }}>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void restore()}
            >
              Restore and restart
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setChosen(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {message !== null && (
        <div
          role="status"
          aria-live="polite"
          style={{ fontSize: 'var(--fs-xs)', wordBreak: 'break-word' }}
        >
          {message}
        </div>
      )}

      {info !== null && (
        <>
          {info.lastRestore !== null && (
            <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              {info.lastRestore.ok
                ? `Last restore: ${when(info.lastRestore.at)}, from a backup made ${when(info.lastRestore.madeAt)}. What you had before is in the folder “${info.lastRestore.safetyFolder}” inside your data folder.`
                : `The last restore (${when(info.lastRestore.at)}) did not go ahead: ${info.lastRestore.error}`}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600 }}>Safety copies before updates</div>
            <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              Before a new version starts, Cleave keeps a copy of your data here
              (the newest three, without API keys). To use one, choose “Restore
              from a backup” and pick its folder.
              {info.autoCopies.length === 0
                ? ' There are none yet.'
                : ` Now: ${info.autoCopies.map((name) => name.replace(/^auto /, '')).join(', ')}.`}
            </div>
            <div
              className="muted"
              style={{ fontSize: 'var(--fs-xs)', wordBreak: 'break-all' }}
            >
              {info.autoCopiesFolder}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
