import { useEffect, useState } from 'react';
import type { ExtensionSettings } from './extensionSettings';
import { Switch } from './ui/controls';

// Settings > Extensions: whether extensions from the Chrome Web Store update by
// themselves.
export function ExtensionsSection() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  useEffect(() => {
    void window.browserApi.extensionSettingsGet().then(setSettings);
  }, []);
  if (settings === null) return null;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <label
        className="row-flex"
        style={{ gap: 'var(--s-3)', justifyContent: 'space-between' }}
      >
        <span>
          Update extensions automatically
          <span
            className="muted"
            style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
          >
            Extensions from the Chrome Web Store are checked for updates when
            the browser starts and every few hours. Only extensions that are
            turned on are updated. If an update asks for more access, the
            extension is turned off until you say yes.
          </span>
        </span>
        <Switch
          label="Update extensions automatically"
          checked={settings.autoUpdate}
          onChange={(next) =>
            void window.browserApi
              .extensionSettingsSet({ autoUpdate: next })
              .then(setSettings)
          }
        />
      </label>
    </div>
  );
}
