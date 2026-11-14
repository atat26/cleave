import { useEffect, useState } from 'react';
import { HISTORY_DAYS_CHOICES, TRASH_DAYS_CHOICES } from './librarySettings';
import type { LibrarySettings } from './librarySettings';
import { Field, Select, Switch } from './ui/controls';

const daysText = (days: number): string =>
  days === 365 ? '1 year' : `${days} days`;

// Settings > Library: whether browsing history is saved and how long it is kept,
// and how long deleted chats and artifacts wait in Recently deleted. A change
// applies at once (a shorter time removes what is older right away).
export function LibrarySection() {
  const [settings, setSettings] = useState<LibrarySettings | null>(null);
  useEffect(() => {
    void window.browserApi.librarySettingsGet().then(setSettings);
  }, []);
  if (settings === null) return null;

  const change = (changes: Partial<Omit<LibrarySettings, 'version'>>) => {
    setSettings({ ...settings, ...changes });
    void window.browserApi.librarySettingsSet(changes).then(setSettings);
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <label
        className="row-flex"
        style={{ gap: 'var(--s-3)', justifyContent: 'space-between' }}
      >
        <span>Save browsing history</span>
        <Switch
          label="Save browsing history"
          checked={settings.saveHistory}
          onChange={(next) => change({ saveHistory: next })}
        />
      </label>
      <Field
        label="Keep history for"
        htmlFor="library-history-days"
        help="Older pages are removed from History. You can also clear it from the Library."
      >
        <Select
          id="library-history-days"
          value={settings.historyDays}
          onChange={(event) =>
            change({ historyDays: Number(event.target.value) })
          }
        >
          {HISTORY_DAYS_CHOICES.map((days) => (
            <option key={days} value={days}>
              {daysText(days)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Keep recently deleted chats and artifacts for"
        htmlFor="library-trash-days"
        help="After this they are removed for good. Until then you can bring them back from the Library."
      >
        <Select
          id="library-trash-days"
          value={settings.trashDays}
          onChange={(event) =>
            change({ trashDays: Number(event.target.value) })
          }
        >
          {TRASH_DAYS_CHOICES.map((days) => (
            <option key={days} value={days}>
              {daysText(days)}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
