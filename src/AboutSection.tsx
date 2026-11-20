import { useEffect, useState } from 'react';
import { CleaveWordmark } from './CleaveWordmark';
import type { AppInfo } from './types';
import { describeUpdate } from './updateState';
import type { UpdateState } from './updateState';
import { Button } from './ui/controls';

// Settings > About: the name, the version, which copy of the app this is (the installed one, or a
// copy started from the project folder, which keeps its data in a different folder), and the update
// button. Cleave only looks for an update when you press it.
export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [update, setUpdate] = useState<UpdateState | null>(null);
  useEffect(() => {
    void window.browserApi.appInfo().then(setInfo);
    void window.browserApi.updateGet().then(setUpdate);
    // The state changes while a check or download runs, even if you left this page and came back.
    return window.browserApi.onUpdateChanged(setUpdate);
  }, []);

  const view = update === null ? null : describeUpdate(update);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <div style={{ padding: 'var(--s-4) 0' }}>
        <CleaveWordmark width={200} />
      </div>
      {info !== null && (
        <>
          <div>
            <div style={{ fontWeight: 600 }}>Version {info.version}</div>
            <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              {info.installed
                ? 'The installed app.'
                : 'A development copy, started from the project folder. It keeps its data apart from the installed app.'}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>Where your data is kept</div>
            <div
              className="muted"
              style={{ fontSize: 'var(--fs-xs)', wordBreak: 'break-all' }}
            >
              {info.dataFolder}
            </div>
          </div>
        </>
      )}
      {view !== null && (
        <div>
          <div style={{ fontWeight: 600 }}>Updates</div>
          <div
            className="muted"
            role="status"
            aria-live="polite"
            style={{ fontSize: 'var(--fs-xs)' }}
          >
            {view.text}
          </div>
          {view.button !== null && (
            <div style={{ marginTop: 'var(--s-3)' }}>
              <Button
                variant={
                  view.button.action === 'install' ? 'primary' : 'secondary'
                }
                loading={view.busy}
                onClick={() =>
                  void (
                    view.button?.action === 'install'
                      ? window.browserApi.updateInstall()
                      : window.browserApi.updateCheck()
                  ).then(setUpdate)
                }
              >
                {view.button.label}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
