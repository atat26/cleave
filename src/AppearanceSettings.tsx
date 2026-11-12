import { useEffect, useState } from 'react';
import type { ThemeChoice } from './themeSettings';
import { Segmented } from './ui/controls';

// Settings > Appearance: light, dark, or follow the computer. A change applies
// to the whole app at once.
export function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemeChoice | null>(null);
  useEffect(() => {
    void window.browserApi.themeGet().then(setTheme);
  }, []);
  if (theme === null) return null;
  return (
    <>
      <p className="muted" style={{ marginTop: 4, fontSize: 'var(--fs-sm)' }}>
        &ldquo;System&rdquo; follows your computer&apos;s light or dark setting.
      </p>
      <Segmented
        label="Theme"
        value={theme}
        onChange={(next) => {
          setTheme(next);
          void window.browserApi.themeSet(next);
        }}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </>
  );
}
