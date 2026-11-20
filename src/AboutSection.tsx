import { useEffect, useState } from 'react';
import { CleaveWordmark } from './CleaveWordmark';
import type { AppInfo } from './types';

// Settings > About: the name, the version, and which copy of the app this is (the installed one, or a
// copy started from the project folder, which keeps its data in a different folder).
export function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.browserApi.appInfo().then(setInfo);
  }, []);

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
    </div>
  );
}
