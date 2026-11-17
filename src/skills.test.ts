import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkInput,
  cleanBody,
  cleanLine,
  createSkill,
  defaultSkills,
  deleteSkill,
  duplicateSkill,
  emptySkills,
  enabledSkills,
  MAKE_SKILL_REQUEST,
  MAX_DESCRIPTION_CHARS,
  MAX_INSTRUCTION_CHARS,
  MAX_NAME_CHARS,
  MAX_SKILLS,
  parseSkillMarkdown,
  parseSkills,
  purgeOldSkills,
  purgeSkill,
  restoreSkill,
  setSkillEnabled,
  skillFileName,
  skillMarkdown,
  STARTER_SKILLS,
  uniqueName,
  updateSkill,
} from './skills.ts';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const input = (name: string) => ({
  name,
  description: `When to use ${name}.`,
  instructions: `1. Do ${name}.`,
});

function two() {
  let state = emptySkills();
  const a = createSkill(state, input('Alpha'), NOW);
  assert.ok(a.ok);
  state = a.state;
  const b = createSkill(state, input('Beta'), NOW + 1);
  assert.ok(b.ok);
  return { state: b.state, a: a.skill, b: b.skill };
}

test('a fresh state has the starter skills, on, and says they were added once', () => {
  const state = defaultSkills(NOW);
  assert.equal(state.skills.length, STARTER_SKILLS.length);
  assert.ok(state.skills.every((s) => s.enabled && s.origin === 'starter'));
  assert.equal(state.seeded, true);
  assert.ok(STARTER_SKILLS.every((s) => s.description.startsWith('Use when')));
  // A missing or broken file gives the starters; deleting them all keeps them gone.
  assert.equal(parseSkills(null, NOW).skills.length, STARTER_SKILLS.length);
  assert.equal(parseSkills('x', NOW).skills.length, STARTER_SKILLS.length);
  const emptied = { ...state, skills: [] };
  assert.equal(
    parseSkills(JSON.parse(JSON.stringify(emptied)), NOW).skills.length,
    0,
  );
});

test('creating a skill cleans it, names it uniquely, and starts it on', () => {
  const { state } = two();
  const made = createSkill(
    state,
    {
      name: '  Alpha  ',
      description: 'x\u0000y',
      instructions: ' step\r\n\r\n\r\n\r\nmore ',
    },
    NOW,
    'assistant',
  );
  assert.ok(made.ok);
  assert.equal(made.skill.name, 'Alpha 2');
  assert.equal(made.skill.description, 'x y');
  assert.equal(made.skill.instructions, 'step\n\nmore');
  assert.equal(made.skill.enabled, true);
  assert.equal(made.skill.origin, 'assistant');
  assert.equal(made.state.nextId, state.nextId + 1);
});

test('a skill needs a name and steps, and there is a limit on how many', () => {
  const state = emptySkills();
  assert.deepEqual(createSkill(state, { name: ' ', instructions: 'x' }, NOW), {
    ok: false,
    problem: 'no-name',
  });
  assert.deepEqual(createSkill(state, { name: 'N', instructions: ' ' }, NOW), {
    ok: false,
    problem: 'no-instructions',
  });
  let full = state;
  for (let i = 0; i < MAX_SKILLS; i++) {
    const made = createSkill(full, input(`S${i}`), NOW);
    assert.ok(made.ok);
    full = made.state;
  }
  assert.deepEqual(createSkill(full, input('One more'), NOW), {
    ok: false,
    problem: 'too-many',
  });
});

test('text is cut to the limits', () => {
  const made = createSkill(
    emptySkills(),
    {
      name: 'n'.repeat(MAX_NAME_CHARS + 20),
      description: 'd'.repeat(MAX_DESCRIPTION_CHARS + 20),
      instructions: 'i'.repeat(MAX_INSTRUCTION_CHARS + 20),
    },
    NOW,
  );
  assert.ok(made.ok);
  assert.equal(made.skill.name.length, MAX_NAME_CHARS);
  assert.equal(made.skill.description.length, MAX_DESCRIPTION_CHARS);
  assert.equal(made.skill.instructions.length, MAX_INSTRUCTION_CHARS);
  assert.equal(cleanLine('a‮b\n c', 10), 'a b c');
  assert.equal(cleanBody('a​\n\n\n\nb  \n', 10), 'a\n\nb');
});

test('uniqueName numbers a repeated name, ignoring case and the skill being renamed', () => {
  const { state, a } = two();
  assert.equal(uniqueName(state, 'alpha'), 'alpha 2');
  assert.equal(uniqueName(state, 'Gamma'), 'Gamma');
  assert.equal(uniqueName(state, 'Alpha', a.id), 'Alpha');
});

test('updating changes only what is given, keeps the name unique, and refuses an empty result', () => {
  const { state, a, b } = two();
  const renamed = updateSkill(
    state,
    b.id,
    { name: 'Alpha', description: 'new' },
    NOW + 9,
  );
  assert.ok(renamed.ok);
  assert.equal(renamed.skill.name, 'Alpha 2');
  assert.equal(renamed.skill.description, 'new');
  assert.equal(renamed.skill.instructions, b.instructions);
  assert.equal(renamed.skill.updatedAt, NOW + 9);
  // Keeping its own name is fine.
  const same = updateSkill(state, a.id, { name: 'Alpha' }, NOW);
  assert.ok(same.ok && same.skill.name === 'Alpha');
  assert.deepEqual(updateSkill(state, a.id, { instructions: '  ' }, NOW), {
    ok: false,
    problem: 'no-instructions',
  });
  assert.deepEqual(updateSkill(state, 99, { name: 'x' }, NOW), {
    ok: false,
    problem: 'not-found',
  });
});

test('turning a skill off keeps it but takes it out of the working list', () => {
  const { state, a } = two();
  const off = setSkillEnabled(state, a.id, false);
  assert.deepEqual(
    enabledSkills(off).map((s) => s.name),
    ['Beta'],
  );
  assert.equal(setSkillEnabled(off, a.id, false), off); // nothing changed
  assert.equal(setSkillEnabled(off, 99, true), off);
});

test('a copy has its own name and starts off', () => {
  const { state, a } = two();
  const copy = duplicateSkill(state, a.id, NOW + 5);
  assert.ok(copy.ok);
  assert.equal(copy.skill.name, 'Alpha 2');
  assert.equal(copy.skill.enabled, false);
  assert.equal(
    copy.state.skills.find((s) => s.id === copy.skill.id)?.enabled,
    false,
  );
  assert.deepEqual(duplicateSkill(state, 99, NOW), { ok: false });
});

test('deleting moves a skill to the trash; restoring brings it back off, under a free name', () => {
  const { state, a } = two();
  const gone = deleteSkill(state, a.id, NOW + 100);
  assert.deepEqual(
    gone.skills.map((s) => s.name),
    ['Beta'],
  );
  assert.equal(gone.trash.length, 1);
  assert.equal(gone.trash[0].deletedAt, NOW + 100);
  // A new skill takes the name meanwhile.
  const retaken = createSkill(gone, input('Alpha'), NOW + 200);
  assert.ok(retaken.ok);
  const back = restoreSkill(retaken.state, a.id, NOW + 300);
  assert.equal(back.trash.length, 0);
  const restored = back.skills.find((s) => s.id === a.id);
  assert.equal(restored?.name, 'Alpha 2');
  assert.equal(restored?.enabled, false);
  assert.equal(restoreSkill(back, 12345, NOW), back);
});

test('purging removes one trashed skill, and old ones go after the chosen days', () => {
  const { state, a, b } = two();
  let trashed = deleteSkill(state, a.id, NOW);
  trashed = deleteSkill(trashed, b.id, NOW + 40 * DAY);
  assert.equal(purgeSkill(trashed, a.id).trash.length, 1);
  assert.equal(purgeSkill(trashed, 99), trashed);
  const later = purgeOldSkills(trashed, NOW + 45 * DAY, 30);
  assert.deepEqual(
    later.trash.map((s) => s.id),
    [b.id],
  );
  assert.equal(purgeOldSkills(trashed, NOW + DAY, 30), trashed);
});

test('a state survives a round trip through the file, and bad entries are dropped', () => {
  const { state } = two();
  const gone = deleteSkill(state, 1, NOW + 5);
  assert.deepEqual(parseSkills(JSON.parse(JSON.stringify(gone)), NOW), gone);
  const damaged = parseSkills(
    {
      version: 1,
      nextId: 'x',
      seeded: true,
      skills: [
        {
          id: 3,
          name: 'Good',
          instructions: 'Do it',
          description: 5,
          enabled: false,
          origin: 'weird',
        },
        { id: 3, name: 'Duplicate id', instructions: 'x' },
        { id: 4, name: '', instructions: 'x' },
        { id: 5, name: 'No steps', instructions: '  ' },
        'nope',
      ],
      trash: [{ id: 3, name: 'Clash', instructions: 'x' }],
    },
    NOW,
  );
  assert.deepEqual(
    damaged.skills.map((s) => s.name),
    ['Good'],
  );
  assert.equal(damaged.skills[0].enabled, false);
  assert.equal(damaged.skills[0].origin, 'you');
  assert.equal(damaged.skills[0].description, '');
  assert.equal(damaged.trash.length, 0);
  assert.ok(damaged.nextId > 3);
});

test('a skill file has a header with its name and description, then the steps, and reads back the same', () => {
  const text = skillMarkdown({
    name: 'Compare prices',
    description: 'Use when comparing.',
    instructions: '1. Read.\n2. Compare.',
  });
  assert.equal(
    text,
    '---\nname: Compare prices\ndescription: Use when comparing.\n---\n\n1. Read.\n2. Compare.\n',
  );
  assert.deepEqual(parseSkillMarkdown(text), {
    ok: true,
    value: {
      name: 'Compare prices',
      description: 'Use when comparing.',
      instructions: '1. Read.\n2. Compare.',
    },
  });
});

test('files from elsewhere: quotes, extra header lines, a heading instead of a header, and bad files', () => {
  const quoted = parseSkillMarkdown(
    '---\nname: "Quoted"\nallowed-tools: read_page\ndescription: \'Use it.\'\n---\nDo it.',
  );
  assert.ok(quoted.ok);
  assert.equal(quoted.value.name, 'Quoted');
  assert.equal(quoted.value.description, 'Use it.');
  assert.equal(quoted.value.instructions, 'Do it.');
  const heading = parseSkillMarkdown('# My skill\n\nStep one.\nStep two.');
  assert.ok(heading.ok);
  assert.equal(heading.value.name, 'My skill');
  assert.equal(heading.value.instructions, 'Step one.\nStep two.');
  assert.deepEqual(parseSkillMarkdown('just some words'), {
    ok: false,
    problem: 'no-name',
  });
  assert.deepEqual(parseSkillMarkdown('---\nname: X\n---\n'), {
    ok: false,
    problem: 'no-instructions',
  });
  assert.deepEqual(parseSkillMarkdown(42), { ok: false, problem: 'no-name' });
  // A file's header cannot add anything but a name and description.
  const sneaky = parseSkillMarkdown(
    '---\nname: S\nenabled: false\norigin: starter\n---\nDo.',
  );
  assert.ok(sneaky.ok);
  assert.deepEqual(Object.keys(sneaky.value).sort(), [
    'description',
    'instructions',
    'name',
  ]);
});

test('file names come from the skill name and never contain a path', () => {
  assert.equal(skillFileName('Compare: prices/2'), 'Compare prices 2.md');
  assert.equal(skillFileName('  '), 'Skill.md');
  assert.equal(skillFileName('..\\evil'), 'evil.md');
  assert.deepEqual(checkInput({ name: 'x', instructions: 'y' }), {
    ok: true,
    value: { name: 'x', description: '', instructions: 'y' },
  });
});

test('the "make a skill from this chat" request asks for ONE create_skill call, in general terms, with nothing private', () => {
  assert.match(MAKE_SKILL_REQUEST, /create_skill/);
  assert.match(MAKE_SKILL_REQUEST, /starts with "Use when"/);
  assert.match(MAKE_SKILL_REQUEST, /general terms/);
  assert.match(MAKE_SKILL_REQUEST, /no private details/);
  assert.match(MAKE_SKILL_REQUEST, /Do not use any other tool first/);
});
