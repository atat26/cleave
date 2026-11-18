import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSkillTools,
  MAX_AGENT_INSTRUCTION_CHARS,
  MAX_LISTED_SKILLS,
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
