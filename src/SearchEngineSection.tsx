import { useEffect, useState } from 'react';
import { ENGINES, isValidTemplate } from './searchEngine';
import type { SearchEngineSettings } from './searchEngine';
import { Button, Field, Input, Select } from './ui/controls';

// Settings > Search engine: which search engine the address bar uses (and the
// "Search the web for…" menu entry on selected text). Pick one, or add your own
// address with %s where the words go.
export function SearchEngineSection() {
  const [settings, setSettings] = useState<SearchEngineSettings | null>(null);
  // Adding or changing the custom engine.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');

  useEffect(() => {
    void window.browserApi.searchEngineGet().then((loaded) => {
      setSettings(loaded);
      setName(loaded.custom?.name ?? '');
      setTemplate(loaded.custom?.template ?? '');
    });
  }, []);
  if (settings === null) return null;

  const choose = (id: string) => {
    if (id === 'custom' && !settings.custom) {
      setEditing(true);
      return;
    }
    setEditing(false);
    void window.browserApi.searchEngineSet({ engine: id }).then(setSettings);
  };
  const showFields = editing || settings.engine === 'custom';
  const valid = name.trim() !== '' && isValidTemplate(template.trim());

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
    >
      <Field
        label="Search engine"
        help="Used when you type words in the address bar, and for “Search the web for…” on selected text."
      >
        <Select
          aria-label="Search engine"
          value={editing ? 'custom' : settings.engine}
          onChange={(event) => choose(event.target.value)}
          style={{ width: '100%' }}
        >
          {ENGINES.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.name}
            </option>
          ))}
          <option value="custom">
            {settings.custom ? settings.custom.name : 'Add your own…'}
          </option>
        </Select>
      </Field>

      {showFields && (
        <>
          <Field label="Name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My search"
              aria-label="Search engine name"
              maxLength={40}
            />
          </Field>
          <Field
            label="Search address"
            help="Start with https:// and put %s where the words go, for example https://example.com/search?q=%s"
          >
            <Input
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              placeholder="https://example.com/search?q=%s"
              aria-label="Search address"
              spellCheck={false}
              invalid={
                template.trim() !== '' && !isValidTemplate(template.trim())
              }
            />
            {template.trim() !== '' && !isValidTemplate(template.trim()) && (
              <p
                role="alert"
                style={{
                  margin: 'var(--s-1) 0 0',
                  color: 'var(--c-danger)',
                  fontSize: 'var(--fs-xs)',
                }}
              >
                This needs to start with https:// and contain %s.
              </p>
            )}
          </Field>
          <div className="row-flex" style={{ gap: 'var(--s-2)' }}>
            <Button
              size="sm"
              variant="primary"
              disabled={!valid}
              onClick={() =>
                void window.browserApi
                  .searchEngineSet({
                    custom: { name: name.trim(), template: template.trim() },
                    engine: 'custom',
                  })
                  .then((next) => {
                    setSettings(next);
                    setEditing(false);
                  })
              }
            >
              Save
            </Button>
            {settings.custom && (
              <Button
                size="sm"
                onClick={() =>
                  void window.browserApi
                    .searchEngineSet({ custom: null })
                    .then((next) => {
                      setSettings(next);
                      setEditing(false);
                      setName('');
                      setTemplate('');
                    })
                }
              >
                Remove
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
