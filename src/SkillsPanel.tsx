import { useEffect, useState } from 'react';
import {
  MAX_DESCRIPTION_CHARS,
  MAX_INSTRUCTION_CHARS,
  MAX_NAME_CHARS,
  ORIGIN_WORDS,
} from './skills';
import type { SkillInfo } from './skills';
import type { SkillDetail } from './types';
import {
  Banner,
  Button,
  Field,
  IconButton,
  Input,
  ItemEmoji,
  Switch,
  Textarea,
} from './ui/controls';

// The Skills panel: reusable instructions for the assistant. Each skill is a name, a line
// saying when to use it, and the steps. They apply everywhere. The list shows each one
// quietly: Edit and "more" appear when the pointer or the keyboard is on the row (the
// right-click menu has all of it, and Delete deletes the focused one; deleted skills wait
// in Recently deleted in the Library).
export function SkillsPanel({ skills }: { skills: SkillInfo[] }) {
  // Which skill is open in the editor: its number, "new", or none (the list).
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  // "Edit" in a skill's menu, or "New skill" in the New menu, opens the editor.
  useEffect(
    () =>
      window.browserApi.onSkillEdit((id) =>
        setEditing(id === null ? 'new' : id),
      ),
    [],
  );
  // A skill that is deleted while it is open closes the editor.
  useEffect(() => {
    if (typeof editing === 'number' && !skills.some((s) => s.id === editing)) {
      setEditing(null);
    }
  }, [skills, editing]);

  if (editing !== null) {
    return (
      <SkillEditor
        key={editing}
        id={editing === 'new' ? null : editing}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <div
        className="row-flex"
        style={{ gap: 'var(--s-2)', margin: '0 0 var(--s-3)' }}
      >
        <span className="muted grow" style={{ fontSize: 'var(--fs-sm)' }}>
          Instructions the assistant can follow: when to use each one, and what
          to do.
        </span>
        <Button
          size="sm"
          icon="plus"
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            window.browserApi.showNewSkillMenu(box.right - 200, box.bottom + 4);
          }}
        >
          New
        </Button>
      </div>
      {skills.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No skills yet. Choose “New” to write one, or import a skill file.
        </p>
      ) : (
        skills.map((skill) => (
          <Row
            key={skill.id}
            skill={skill}
            onEdit={() => setEditing(skill.id)}
          />
        ))
      )}
    </div>
  );
}

function Row({ skill, onEdit }: { skill: SkillInfo; onEdit: () => void }) {
  return (
    <div
      className="lrow reveal-host lib-row"
      role="button"
      tabIndex={0}
      title="Edit this skill"
      style={{
        alignItems: 'flex-start',
        padding: 'var(--s-2)',
        opacity: skill.enabled ? 1 : 0.6,
      }}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit();
        } else if (event.key === 'Delete') {
          event.preventDefault();
          window.browserApi.skillDelete(skill.id);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        window.browserApi.showSkillMenu(skill.id, event.clientX, event.clientY);
      }}
    >
      <ItemEmoji emoji="⚡" />
      <span className="grow" style={{ minWidth: 0 }}>
        <span
          className="truncate"
          style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'baseline' }}
        >
          <span className="truncate" style={{ fontWeight: 600 }}>
            {skill.name}
          </span>
          {!skill.enabled && (
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              Off
            </span>
          )}
        </span>
        {skill.description !== '' && (
          <span
            className="muted"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontSize: 'var(--fs-xs)',
            }}
          >
            {skill.description}
          </span>
        )}
        <span
          className="muted"
          style={{ display: 'block', fontSize: 'var(--fs-xs)', opacity: 0.8 }}
        >
          {ORIGIN_WORDS[skill.origin]}
        </span>
      </span>
      <IconButton
        icon="pencil"
        size="sm"
        className="reveal"
        label={`Edit ${skill.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      />
      <IconButton
        icon="more"
        size="sm"
        className="reveal"
        aria-haspopup="menu"
        label={`More for ${skill.name}`}
        onClick={(event) => {
          event.stopPropagation();
          const box = event.currentTarget.getBoundingClientRect();
          window.browserApi.showSkillMenu(
            skill.id,
            box.right - 200,
            box.bottom + 4,
          );
        }}
      />
    </div>
  );
}

// Writing or changing one skill.
function SkillEditor({
  id,
  onDone,
}: {
  id: number | null;
  onDone: () => void;
}) {
  const [loaded, setLoaded] = useState<SkillDetail | 'missing' | 'new' | null>(
    id === null ? 'new' : null,
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === null) return;
    let current = true;
    void window.browserApi.skillGet(id).then((skill) => {
      if (!current) return;
      if (!skill) {
        setLoaded('missing');
        return;
      }
      setLoaded(skill);
      setName(skill.name);
      setDescription(skill.description);
      setInstructions(skill.instructions);
      setEnabled(skill.enabled);
    });
    return () => {
      current = false;
    };
  }, [id]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    const result = await window.browserApi.skillSave({
      id,
      name,
      description,
      instructions,
    });
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return;
    }
    // The on/off switch is kept apart from the text, so it is applied after.
    if (loaded !== 'new' && loaded !== null && loaded !== 'missing') {
      if (loaded.enabled !== enabled) {
        window.browserApi.skillEnable(result.id, enabled);
      }
    }
    onDone();
  };

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <div
        className="row-flex"
        style={{ gap: 'var(--s-2)', margin: '0 0 var(--s-3)' }}
      >
        <Button size="sm" variant="ghost" icon="arrow-left" onClick={onDone}>
          Skills
        </Button>
      </div>
      {loaded === null ? (
        <p className="muted">Loading…</p>
      ) : loaded === 'missing' ? (
        <p className="muted">That skill no longer exists.</p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
          <Field label="Name" htmlFor="skill-name">
            <Input
              id="skill-name"
              autoFocus={loaded === 'new'}
              value={name}
              maxLength={MAX_NAME_CHARS}
              placeholder="Compare prices"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="When to use it"
            htmlFor="skill-description"
            help="The assistant always sees this line. Start with “Use when…”."
          >
            <Textarea
              id="skill-description"
              rows={2}
              value={description}
              maxLength={MAX_DESCRIPTION_CHARS}
              placeholder="Use when the user wants to compare prices across shops."
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field
            label="What to do"
            htmlFor="skill-instructions"
            help={`The steps. The assistant reads them only when it uses the skill. ${instructions.length.toLocaleString('en-US')} of ${MAX_INSTRUCTION_CHARS.toLocaleString('en-US')} characters.`}
          >
            <Textarea
              id="skill-instructions"
              rows={12}
              value={instructions}
              maxLength={MAX_INSTRUCTION_CHARS}
              placeholder={
                '1. Read each page.\n2. Write the prices in a table.\n3. Say which is best.'
              }
              onChange={(event) => setInstructions(event.target.value)}
            />
          </Field>
          {loaded !== 'new' && (
            <div className="row-flex" style={{ gap: 'var(--s-2)' }}>
              <Switch
                checked={enabled}
                onChange={setEnabled}
                label="Skill is on"
              />
              <span style={{ fontSize: 'var(--fs-sm)' }}>
                {enabled ? 'On' : 'Off: the assistant will not use it'}
              </span>
            </div>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-xs)' }}>
            A skill is only instructions. It cannot change what the assistant is
            allowed to do, or switch off a safety rule.
          </p>
          {error !== '' && <Banner tone="error">{error}</Banner>}
          <div
            className="row-flex"
            style={{ gap: 'var(--s-2)', justifyContent: 'flex-end' }}
          >
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
