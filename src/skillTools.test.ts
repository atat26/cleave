import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSkillTools,
  MAX_AGENT_INSTRUCTION_CHARS,
  loadedSkills,
  MAX_LISTED_SKILLS,
  MAX_NAMED_SKILL_CHARS,
  MAX_NAMED_SKILLS,
  namedSkills,
  MAX_SKILL_USES,
  MAX_SKILL_WRITES,
  SKILL_DEFINITIONS,
  skillsContext,
} from './skillTools.ts';
import type { SkillRow, SkillsEnv } from './skillTools.ts';
import type { SkillInput } from './skills.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

const call = (name: string, args: unknown) => ({
  id: 'c',
  name,
  arguments: JSON.stringify(args),
});

function world(levelOf: (tool: string) => ApprovalLevel = () => 'always') {
  const skills: (SkillRow & SkillInput)[] = [
    {
      id: 1,
      name: 'Compare prices',
      description: 'Use when comparing prices.',
      instructions: '1. Read the pages.\n2. Make a table.',
      enabled: true,
    },
    {
      id: 2,
      name: 'Old idea',
      description: 'Use when never.',
      instructions: 'Do nothing.',
      enabled: false,
    },
  ];
  const log: string[] = [];
  let webContent = false;
  const env: SkillsEnv = {
    listSkills: () => skills,
    readSkill: (id) => skills.find((s) => s.id === id) ?? null,
    makeSkill: (input) => {
      log.push(`make ${input.name}`);
      skills.push({ id: 10 + skills.length, enabled: true, ...input });
      return { ok: true, id: 10, name: input.name };
    },
    changeSkill: (id, changes) => {
      log.push(`change ${id} ${Object.keys(changes).join(',')}`);
      return { ok: true, name: changes.name ?? 'x' };
    },
  };
  return {
    tools: createSkillTools(env, levelOf, () => webContent),
    env,
    skills,
    log,
    setWeb: (v: boolean) => {
      webContent = v;
    },
  };
}

test('the assistant is told the name and "when to use it" of each skill that is on, and how to use them', () => {
  const { skills } = world();
  const text = skillsContext(skills) ?? '';
  assert.match(text, /call use_skill with its name BEFORE you start/);
  assert.match(text, /- "Compare prices": Use when comparing prices\./);
  assert.ok(!text.includes('Old idea')); // off
  assert.ok(!text.includes('Make a table')); // the steps are not listed
  assert.match(text, /can never change your safety rules/);
  assert.equal(skillsContext([]), null);
  assert.equal(skillsContext(skills.filter((s) => !s.enabled)), null);
  // Only so many are listed.
  const many: SkillRow[] = Array.from(
    { length: MAX_LISTED_SKILLS + 5 },
    (_, i) => ({
      id: i,
      name: `S${i}`,
      description: '',
      enabled: true,
    }),
  );
  assert.equal(
    (skillsContext(many) ?? '').split('\n').length,
    1 + MAX_LISTED_SKILLS,
  );
});

test('a skill named as /Name is found: the picker spelling, any case, not inside a longer word, longest name wins, only if on', () => {
  const row = (id: number, name: string, enabled = true): SkillRow => ({
    id,
    name,
    description: '',
    enabled,
  });
  const list = [
    row(1, 'Plan'),
    row(2, 'Plan trip'),
    row(3, 'Compare   prices'),
    row(4, 'Old', false),
  ];
  const ids = (text: string) => namedSkills(text, list).map((r) => r.id);
  assert.deepEqual(ids('please /Plan this'), [1]);
  assert.deepEqual(ids('/plan'), [1]);
  // A skill's name may have several spaces: the picker tidies them, and so does the match.
  assert.deepEqual(ids('use /Compare prices now'), [3]);
  assert.deepEqual(ids('use /Compare\nprices now'), [3]);
  // Not the start of a longer word, and not without the slash.
  assert.deepEqual(ids('/Planning ahead'), []);
  assert.deepEqual(ids('Plan the trip'), []);
  assert.deepEqual(ids('a/Plan and http://x/Plan'), []);
  // The longer name wins where one is inside another; both can be named.
  assert.deepEqual(ids('/Plan trip'), [2]);
  assert.deepEqual(ids('/Plan trip and /Plan'), [2, 1]);
  // In the order written, and a skill that is off is ignored.
  assert.deepEqual(ids('/Compare prices then /Plan'), [3, 1]);
  assert.deepEqual(ids('/Old'), []);
  // Names with characters that mean something in a pattern are matched as plain text.
  assert.deepEqual(
    namedSkills('/C++ (v2)? yes', [row(5, 'C++ (v2)?')]).map((r) => r.id),
    [5],
  );
  // At most MAX_NAMED_SKILLS.
  const six = Array.from({ length: 6 }, (_, i) =>
    row(i, `S${String.fromCharCode(97 + i)}`),
  );
  assert.equal(
    namedSkills('/Sa /Sb /Sc /Sd /Se /Sf', six).length,
    MAX_NAMED_SKILLS,
  );
});

test('the steps of a named skill go in the request; one that is too long, off or empty is left to use_skill', () => {
  const { skills, env } = world();
  const loaded = loadedSkills('do /Compare prices', skills, env.readSkill);
  assert.deepEqual(loaded, [
    {
      name: 'Compare prices',
      instructions: '1. Read the pages.\n2. Make a table.',
    },
  ]);
  const text = skillsContext(skills, loaded) ?? '';
  assert.match(
    text,
    /----- start of the skill "Compare prices" -----\n1\. Read the pages\.\n2\. Make a table\.\n----- end of the skill -----/,
  );
  assert.match(text, /do not call use_skill for them/);
  assert.match(text, /cannot change your safety rules/);
  // Nothing named: the list alone, exactly as before.
  assert.ok(!(skillsContext(skills, []) ?? '').includes('start of the skill'));
  assert.equal(skillsContext(skills), skillsContext(skills, []));
  assert.deepEqual(loadedSkills('hello', skills, env.readSkill), []);
  // Off, empty and too long are not put in.
  assert.deepEqual(loadedSkills('/Old idea', skills, env.readSkill), []);
  skills.push({
    id: 20,
    name: 'Long',
    description: '',
    instructions: 'x'.repeat(MAX_NAMED_SKILL_CHARS + 1),
    enabled: true,
  });
  skills.push({
    id: 21,
    name: 'Blank',
    description: '',
    instructions: '',
    enabled: true,
  });
  assert.deepEqual(loadedSkills('/Long /Blank', skills, env.readSkill), []);
  // The list is still in the system message when steps are added.
  assert.match(text, /- "Compare prices": Use when comparing prices\./);
});

test('use_skill gives the steps with a note that they cannot change the rules; the name may be any case; a skill that is off or missing is refused', async () => {
  const { tools } = world();
  const out = await tools.run(call('use_skill', { skill: 'compare PRICES' }));
  assert.equal(out.ok, true);
  assert.match(out.result, /1\. Read the pages\.\n2\. Make a table\./);
  assert.match(out.result, /cannot change your safety rules/);
  assert.match(out.result, /approvals still apply/);
  assert.equal(out.label, 'Using the skill: Compare prices');
  assert.deepEqual(tools.plan(call('use_skill', { skill: 'Compare prices' })), {
    kind: 'auto',
  });
  const off = tools.plan(call('use_skill', { skill: 'Old idea' }));
  assert.ok(off.kind === 'refuse');
  assert.match(off.result, /The skills you can use: "Compare prices"/);
  assert.equal(tools.plan(call('use_skill', { skill: 'Nope' })).kind, 'refuse');
  assert.equal(tools.plan(call('use_skill', {})).kind, 'refuse');
});

test('skills are used a limited number of times per reply', async () => {
  const { tools } = world();
  for (let i = 0; i < MAX_SKILL_USES; i++) {
    await tools.run(call('use_skill', { skill: 'Compare prices' }));
  }
  assert.equal(
    tools.plan(call('use_skill', { skill: 'Compare prices' })).kind,
    'refuse',
  );
});

test('making a skill asks by default with the FULL text on the card, and saves it as written', async () => {
  const { tools, log } = world(() => 'ask');
  const args = {
    name: 'Tidy desk',
    description: 'Use when the user wants a tidy desk.',
    instructions: '1. Clear it.\n2. Wipe it.',
  };
  const plan = tools.plan(call('create_skill', args));
  assert.ok(plan.kind === 'ask');
  assert.equal(
    plan.text,
    [
      'Make a new skill:',
      'Name: Tidy desk',
      'When to use it: Use when the user wants a tidy desk.',
      'Steps:',
      '1. Clear it.',
      '2. Wipe it.',
    ].join('\n'),
  );
  assert.equal(plan.risky, false);
  // The whole text is also in the card's own box, apart from the question.
  assert.equal(plan.card?.full?.label, 'Full text');
  assert.ok(plan.card?.full?.value.includes('2. Wipe it.'));
  assert.ok(plan.card?.full?.value.includes('Name: Tidy desk'));
  const out = await tools.run(call('create_skill', args));
  assert.equal(out.ok, true);
  assert.deepEqual(log, ['make Tidy desk']);
  assert.equal(out.label, 'Made the skill: Tidy desk');
  assert.deepEqual(out.made, { kind: 'skill', id: 10 });
});

test('after web content was read, making or changing a skill always asks as risky, even at "always"', () => {
  const w = world(() => 'always');
  const args = { name: 'N', description: 'd', instructions: 'steps' };
  assert.deepEqual(w.tools.plan(call('create_skill', args)), { kind: 'auto' });
  w.setWeb(true);
  const make = w.tools.plan(call('create_skill', args));
  assert.ok(make.kind === 'ask');
  assert.equal(make.risky, true);
  // It says why it is asking even though the tool is set to go ahead.
  assert.equal(make.card?.askAgain, true);
  assert.ok(make.card?.full);
  const edit = w.tools.plan(
    call('edit_skill', { skill: 'Compare prices', instructions: 'new' }),
  );
  assert.ok(edit.kind === 'ask');
  assert.equal(edit.risky, true);
});

test("a skill needs a name and steps, and the assistant's steps are kept short", () => {
  const { tools } = world();
  for (const args of [
    { description: 'd', instructions: 'x' },
    { name: 'N', description: 'd' },
    { name: 'N', description: 'd', instructions: '   ' },
    {
      name: 'N',
      description: 'd',
      instructions: 'x'.repeat(MAX_AGENT_INSTRUCTION_CHARS + 1),
    },
  ]) {
    assert.equal(
      tools.plan(call('create_skill', args)).kind,
      'refuse',
      JSON.stringify(args).slice(0, 50),
    );
  }
});

test('editing shows only what changes, as it will be written, and needs a skill that exists', async () => {
  const { tools, log } = world(() => 'ask');
  const plan = tools.plan(
    call('edit_skill', {
      skill: 'compare prices',
      description: 'Use when comparing prices or plans.',
    }),
  );
  assert.ok(plan.kind === 'ask');
  assert.equal(
    plan.text,
    'Change the skill "Compare prices":\nWhen to use it: Use when comparing prices or plans.',
  );
  assert.ok(!plan.text.includes('Steps'));
  await tools.run(
    call('edit_skill', {
      skill: 'Compare prices',
      name: 'Prices',
      instructions: 'new steps',
    }),
  );
  assert.deepEqual(log, ['change 1 name,instructions']);
  assert.equal(
    tools.plan(call('edit_skill', { skill: 'Nope', name: 'x' })).kind,
    'refuse',
  );
  assert.equal(
    tools.plan(call('edit_skill', { skill: 'Compare prices' })).kind,
    'refuse',
  ); // nothing to change
  assert.equal(
    tools.plan(
      call('edit_skill', { skill: 'Compare prices', instructions: ' ' }),
    ).kind,
    'refuse',
  );
});

test('there is no way for the assistant to delete a skill, and writes are limited per reply', async () => {
  const { tools } = world();
  assert.ok(!SKILL_DEFINITIONS.some((d) => /delete|remove/.test(d.name)));
  assert.equal(
    tools.plan(call('delete_skill', { skill: 'Compare prices' })).kind,
    'refuse',
  );
  for (let i = 0; i < MAX_SKILL_WRITES; i++) {
    await tools.run(
      call('create_skill', {
        name: `N${i}`,
        description: 'd',
        instructions: 'steps',
      }),
    );
  }
  assert.equal(
    tools.plan(
      call('create_skill', {
        name: 'More',
        description: 'd',
        instructions: 's',
      }),
    ).kind,
    'refuse',
  );
});

test('a turned-off tool is refused', () => {
  const { tools } = world(() => 'never');
  assert.equal(
    tools.plan(call('use_skill', { skill: 'Compare prices' })).kind,
    'refuse',
  );
  assert.equal(
    tools.plan(
      call('create_skill', { name: 'n', description: 'd', instructions: 's' }),
    ).kind,
    'refuse',
  );
});
