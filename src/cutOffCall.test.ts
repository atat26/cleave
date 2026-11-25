import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cutOffPlan } from './cutOffCall.ts';

test('a cut-off artifact call is refused and the model is told how to build the document in parts', () => {
  const plan = cutOffPlan({
    id: 'a',
    name: 'create_artifact',
    arguments: '{"title":"T","content":"abc',
    cutOff: true,
  });
  assert.equal(plan.kind, 'refuse');
  if (plan.kind !== 'refuse') return;
  assert.match(plan.label, /create_artifact/);
  assert.match(plan.result, /cut off before it ended/);
  assert.match(plan.result, /edit_artifact/);
  assert.match(plan.result, /30,000 characters/);
});

test('a cut-off call of another tool is refused without advice about documents', () => {
  const plan = cutOffPlan({
    id: 'a',
    name: 'go_to',
    arguments: '{"tab":',
    cutOff: true,
  });
  assert.equal(plan.kind, 'refuse');
  if (plan.kind !== 'refuse') return;
  assert.match(plan.result, /cut off before it ended/);
  assert.doesNotMatch(plan.result, /edit_artifact/);
});
