import { useEffect, useState } from 'react';
import type { NewTabSettings } from './newTabSettings';
import { Button, Switch } from './ui/controls';

// Settings > New tab: whether the box picks Go to, Search or Ask by itself, and
// whether "Pick up" shows under it.
export function NewTabSection() {
  const [settings, setSettings] = useState<NewTabSettings | null>(null);
  useEffect(() => {
    void window.browserApi.newTabSettingsGet().then(setSettings);
  }, []);
  if (settings === null) return null;

  const set = (changes: { autoMode?: boolean; suggestions?: boolean }) =>
    void window.browserApi.newTabSettingsSet(changes).then(setSettings);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <label
        className="row-flex"
        style={{ gap: 'var(--s-3)', justifyContent: 'space-between' }}
      >
        <span>
          Auto mode
          <span
            className="muted"
            style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
          >
            The box chooses Go to, Search or Ask as you type. Off, it searches
            unless you pick with Tab.
          </span>
        </span>
        <Switch
          label="Auto mode"
          checked={settings.autoMode}
          onChange={(next) => set({ autoMode: next })}
        />
      </label>
      <label
        className="row-flex"
        style={{ gap: 'var(--s-3)', justifyContent: 'space-between' }}
      >
        <span>
          Pick up suggestions
          <span
            className="muted"
            style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
          >
            Up to three unfinished things from the current Space under the box,
            made from what is on this computer.
          </span>
        </span>
        <Switch
          label="Pick up suggestions"
          checked={settings.suggestions}
          onChange={(next) => set({ suggestions: next })}
        />
      </label>
      <div>
        <Button
          size="sm"
          disabled={settings.hidden.length === 0}
          onClick={() =>
            void window.browserApi.newTabShowHidden().then(setSettings)
          }
        >
          Show hidden items again
        </Button>
      </div>
    </div>
  );
}
