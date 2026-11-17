import { useEffect, useState } from 'react';
import { SLEEP_AFTER_CHOICES, sleepAfterWords } from './sleep';
import type { SleepSettings } from './sleep';
import { Select } from './ui/controls';

// Settings > Pages and memory: whether pages you have not used for a while go to
// sleep by themselves. A sleeping page uses no memory and loads again when you open
// it (anything you had typed into it and not sent is lost).
export function SleepSection() {
  const [settings, setSettings] = useState<SleepSettings | null>(null);
  useEffect(() => {
    void window.browserApi.sleepSettingsGet().then(setSettings);
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
          Put unused pages to sleep after
          <span
            className="muted"
            style={{ display: 'block', fontSize: 'var(--fs-xs)' }}
          >
            A sleeping page uses no memory and loads again when you open it. The
            page you are on, pages playing sound, and pages the assistant is
            using never go to sleep. Text you typed into a page and did not send
            is lost. You can also put a whole Space to sleep from its menu.
          </span>
        </span>
        <Select
          aria-label="Put unused pages to sleep after"
          value={settings.afterMinutes}
          onChange={(event) =>
            void window.browserApi
              .sleepSettingsSet({ afterMinutes: Number(event.target.value) })
              .then(setSettings)
          }
        >
          {SLEEP_AFTER_CHOICES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {sleepAfterWords(minutes)}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
