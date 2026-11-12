import { useEffect, useState } from 'react';
import { Switch } from './ui/controls';

// Settings > Naming: whether the assistant names a new chat (and picks its emoji)
// on its own. The "name it with AI" buttons work either way.
export function NamingSection() {
  const [auto, setAuto] = useState<boolean | null>(null);
  useEffect(() => {
    void window.browserApi.namingGet().then(setAuto);
  }, []);
  if (auto === null) return null;
  return (
    <>
      <p className="muted" style={{ marginTop: 4, fontSize: 'var(--fs-sm)' }}>
        When you send the first message in a chat, the assistant picks a short
        name and an emoji for it. This uses one small request to your chosen
        model each time. A name you chose yourself is never replaced.
      </p>
      <label
        className="row-flex"
        style={{ gap: 'var(--s-3)', justifyContent: 'space-between' }}
      >
        <span>Name new chats automatically</span>
        <Switch
          label="Name new chats automatically"
          checked={auto}
          onChange={(next) => {
            setAuto(next);
            void window.browserApi.namingSet(next);
          }}
        />
      </label>
    </>
  );
}
