import { useEffect, useState } from 'react';
import type { DownloadSettings } from './downloadSettings';
import { Button, Field, Switch } from './ui/controls';

// Settings > Downloads: the folder downloads are saved into, and whether to ask
// where to save each file.
export function DownloadsSection() {
  const [settings, setSettings] = useState<DownloadSettings | null>(null);
  useEffect(() => {
    void window.browserApi.downloadSettingsGet().then(setSettings);
  }, []);
  if (settings === null) return null;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <Field
        label="Download folder"
        help={
          settings.folder === null
            ? 'Files are saved in your computer’s Downloads folder.'
            : 'Files are saved in this folder.'
        }
      >
        <div className="row-flex" style={{ gap: 'var(--s-2)' }}>
          <span
            className="grow truncate"
            title={settings.folder ?? 'Downloads folder'}
            style={{ fontSize: 'var(--fs-sm)' }}
          >
            {settings.folder ?? 'Downloads folder (default)'}
          </span>
          <Button
            size="sm"
            onClick={() =>
              void window.browserApi
                .downloadSettingsPickFolder()
                .then(setSettings)
            }
          >
            Change…
          </Button>
          {settings.folder !== null && (
            <Button
              size="sm"
              onClick={() =>
                void window.browserApi
                  .downloadSettingsSet({ folder: null })
                  .then(setSettings)
              }
            >
              Reset
            </Button>
          )}
        </div>
      </Field>
      <label
        className="row-flex"
        style={{ gap: 'var(--s-3)', justifyContent: 'space-between' }}
      >
        <span>Ask where to save each file</span>
        <Switch
          label="Ask where to save each file"
          checked={settings.askWhere}
          onChange={(next) =>
            void window.browserApi
              .downloadSettingsSet({ askWhere: next })
              .then(setSettings)
          }
        />
      </label>
      <div>
        <Button
          size="sm"
          icon="folder"
          onClick={() => void window.browserApi.downloadsOpenFolder()}
        >
          Open the downloads folder
        </Button>
      </div>
    </div>
  );
}
