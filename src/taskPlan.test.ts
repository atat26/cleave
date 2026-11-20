import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ToolCall } from './openrouter.ts';
import {
  createTaskPlanTools,
  MAX_PLAN_CALLS,
  PLAN_DEFINITION,
  planLines,
  progressLines,
  SET_PLAN,
} from './taskPlan.ts';
import { TOOL_CATALOG } from './toolPolicy.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

const call = (args: unknown): ToolCall => ({
  id: 'c1',
  name: SET_PLAN,
  arguments: typeof args === 'string' ? args : JSON.stringify(args),
});
const STEPS = [
  'Find the shops',
  'Compare prices',
  'Pick the best',
  'Write it up',
];
const tools = (level: ApprovalLevel = 'ask') =>
  createTaskPlanTools(() => level);

test('the tool is in the catalog, asks by default, and defines what a step is', () => {
  const entry = TOOL_CATALOG.find((t) => t.name === SET_PLAN);
  assert.equal(entry?.defaultLevel, 'ask');
  assert.equal(entry?.changesThings, false);
  assert.match(PLAN_DEFINITION.description, /never a tool call/);
  assert.match(PLAN_DEFINITION.description, /never for a question/);
});

test('a new plan asks first, with the numbered steps, and even after "allow the rest"', () => {
  const plan = tools().plan(call({ steps: STEPS, done: 0 }));
  assert.equal(plan.kind, 'ask');
  if (plan.kind !== 'ask') return;
  assert.equal(plan.always, true);
  assert.equal(plan.risky, false);
  assert.deepEqual(plan.card?.list, [
    '1. Find the shops',
    '2. Compare prices',
    '3. Pick the best',
    '4. Write it up',
  ]);
  assert.match(plan.text, /4 steps/);
});

test('an approved plan is kept, and the model is told to start on step 1', async () => {
  const t = tools();
  const outcome = await t.run(call({ steps: STEPS }));
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.plan, { steps: STEPS, done: 0 });
  assert.match(outcome.result, /Start with step 1: "Find the shops"/);
  assert.match(outcome.details ?? '', /→ 1\. Find the shops/);
  assert.deepEqual(t.current(), { steps: STEPS, done: 0 });
});

test('moving the progress forward does not ask, and never goes backwards or past the end', async () => {
  const t = tools();
  await t.run(call({ steps: STEPS }));
  assert.equal(t.plan(call({ steps: STEPS, done: 1 })).kind, 'auto');
  assert.equal((await t.run(call({ steps: STEPS, done: 2 }))).plan?.done, 2);
  // Going back is ignored: the progress only moves forward.
  assert.equal((await t.run(call({ steps: STEPS, done: 1 }))).plan?.done, 2);
  // Past the end stops at the end.
  const last = await t.run(call({ steps: STEPS, done: 99 }));
  assert.equal(last.plan?.done, 4);
  assert.match(last.result, /all steps are done/);
});

test('a change to the steps asks again, marks what is new, moved and removed, and gives the reason', async () => {
  const t = tools();
  await t.run(call({ steps: STEPS, done: 1 }));
  const changed = [
    'Find the shops',
    'Check delivery times',
    'Pick the best',
    'Compare prices',
  ];
  const plan = t.plan(call({ steps: changed, reason: 'Delivery matters' }));
  assert.equal(plan.kind, 'ask');
  if (plan.kind !== 'ask') return;
  assert.equal(plan.always, true);
  assert.deepEqual(plan.card?.list, [
    '1. Find the shops',
    '2. Check delivery times (new)',
    '3. Pick the best',
    '4. Compare prices (moved)',
    'Removed: Write it up',
  ]);
  assert.deepEqual(plan.card?.text, {
    label: 'Why',
    value: 'Delivery matters',
  });
  assert.match(plan.text, /Change the plan/);
  const outcome = await t.run(call({ steps: changed }));
  assert.match(outcome.label, /Plan changed/);
  // The progress made so far is kept.
  assert.equal(outcome.plan?.done, 1);
});

test('in the Tools panel: off refuses, and "always" lets plans go ahead without a card', () => {
  const off = tools('never').plan(call({ steps: STEPS }));
  assert.equal(off.kind, 'refuse');
  const always = tools('always').plan(call({ steps: STEPS }));
  assert.equal(always.kind, 'auto');
});

test('a plan of tool calls, or the wrong size, is refused with the reason', () => {
  const t = tools();
  const named = t.plan(call({ steps: ['read_page the shop', 'b', 'c'] }));
  assert.equal(named.kind, 'refuse');
  if (named.kind === 'refuse') assert.match(named.result, /not a tool call/);
  assert.equal(t.plan(call({ steps: ['a', 'b'] })).kind, 'refuse');
  assert.equal(
    t.plan(call({ steps: Array.from({ length: 9 }, (_, i) => `Step ${i}`) }))
      .kind,
    'refuse',
  );
  assert.equal(t.plan(call({ steps: 'one' })).kind, 'refuse');
  assert.equal(t.plan(call('{not json')).kind, 'refuse');
  assert.equal(t.plan(call({ steps: STEPS, done: 1.5 })).kind, 'refuse');
});

test('steps are cleaned and cut, and empty ones dropped', async () => {
  const long = 'x'.repeat(200);
  const outcome = await tools().run(
    call({ steps: ['  Find   the shops  ', '', long, 'Compare', 'Pick'] }),
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.plan?.steps.length, 4);
  assert.equal(outcome.plan?.steps[0], 'Find the shops');
  assert.ok((outcome.plan?.steps[1] ?? '').length <= 70);
});

test('a refused call when run says why and keeps no plan', async () => {
  const t = tools();
  const outcome = await t.run(call({ steps: ['a'] }));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.plan, undefined);
  assert.equal(t.current(), null);
});

test('there is a limit on how often the plan is updated in one reply', async () => {
  const t = tools('always');
  for (let i = 0; i < MAX_PLAN_CALLS; i++) {
    await t.run(call({ steps: STEPS, done: 0 }));
  }
  assert.equal(t.plan(call({ steps: STEPS })).kind, 'refuse');
});

test('planLines and progressLines', () => {
  assert.deepEqual(planLines(['a', 'b', 'c'], null), ['1. a', '2. b', '3. c']);
  assert.deepEqual(progressLines({ steps: ['a', 'b', 'c'], done: 1 }), [
    '✓ 1. a',
    '→ 2. b',
    '· 3. c',
  ]);
});

test('a declined plan tells the model not to start, instead of the usual "try another way"', () => {
  const plan = tools().plan(call({ steps: STEPS }));
  assert.equal(plan.kind, 'ask');
  if (plan.kind !== 'ask') return;
  assert.match(plan.declinedResult ?? '', /Do not start the task/);
});
