import { useEffect, useRef, useState } from 'react';
import { IconButton } from './ui/controls';
import { Icon } from './ui/Icon';

// The "name it with AI" button: asks the model for a name and an emoji for a chat,
// a Space or an artifact, and the app applies them. It shows a spinner while the
// model thinks, and says plainly if it could not.
export function NameButton({
  kind,
  id,
}: {
  kind: 'chat' | 'space' | 'artifact';
  id: number;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const run = () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    void window.browserApi
      .nameWithAi(kind, id)
      .then((result) => {
        if (!result.ok) {
          setProblem(result.error);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => setProblem(null), 6000);
        }
      })
      .catch(() => setProblem('Something went wrong. Try again.'))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <IconButton
        icon={busy ? 'spinner' : 'sparkle'}
        className={busy || problem ? 'reveal is-on' : 'reveal'}
        size="sm"
        label={busy ? 'Naming…' : 'Name it with AI'}
        aria-busy={busy}
        disabled={busy}
        onClick={run}
      />
      {problem && (
        <span
          role="status"
          className="row-flex"
          style={{
            gap: 'var(--s-1)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--c-danger)',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name="warn" />
          {problem}
        </span>
      )}
    </>
  );
}
