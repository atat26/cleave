import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentTools } from './agentTools.ts';
import type { AgentEnv } from './agentTools.ts';
import type { Plan } from './agentActions.ts';
import {
  applyPolicy,
  APPROVAL_LEVELS,
  defaultLevel,
  TOOL_CATALOG,
} from './toolPolicy.ts';

const auto: Plan = { kind: 'auto' };
const askSafe: Plan = { kind: 'ask', text: 'Click it', risky: false };
const askRisky: Plan = { kind: 'ask', text: 'Buy it', risky: true };
const refused: Plan = { kind: 'refuse', label: 'No', note: 'n', result: 'r' };

test('always: everything that is not refused goes ahead, risky or not', () => {
  assert.deepEqual(applyPolicy(auto, 'always', 'x'), auto);
  assert.deepEqual(applyPolicy(askSafe, 'always', 'x'), auto);
  assert.deepEqual(applyPolicy(askRisky, 'always', 'x'), auto);
});

test('if-safe: ordinary things go ahead, risky things still ask', () => {
  assert.deepEqual(applyPolicy(auto, 'if-safe', 'x'), auto);
  assert.deepEqual(applyPolicy(askSafe, 'if-safe', 'x'), auto);
  assert.deepEqual(applyPolicy(askRisky, 'if-safe', 'x'), askRisky);
});

test('ask: everything asks, including things that would just go ahead', () => {
  assert.deepEqual(applyPolicy(askSafe, 'ask', 'x'), askSafe);
  assert.deepEqual(applyPolicy(askRisky, 'ask', 'x'), askRisky);
  assert.deepEqual(applyPolicy(auto, 'ask', 'Reading: Page'), {
    kind: 'ask',
    text: 'Reading: Page',
    risky: false,
  });
});

test('never: refused, with a reason the assistant is told', () => {
  for (const plan of [auto, askSafe, askRisky]) {
    const result = applyPolicy(plan, 'never', 'x');
    assert.equal(result.kind, 'refuse');
    assert.match(
      result.kind === 'refuse' ? result.result : '',
      /turned this tool off/,
    );
  }
});

test('a safety refusal stands whatever the level', () => {
  for (const level of APPROVAL_LEVELS) {
    assert.deepEqual(applyPolicy(refused, level, 'x'), refused);
  }
});

test('the catalog has every tool once, and the defaults are the behaviour from before', () => {
  const names = TOOL_CATALOG.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(defaultLevel('click'), 'ask');
  assert.equal(defaultLevel('type_text'), 'ask');
  assert.equal(defaultLevel('open_tab'), 'ask');
  assert.equal(defaultLevel('read_page'), 'always');
  assert.equal(defaultLevel('look_at_page'), 'always');
  assert.equal(defaultLevel('scroll'), 'always');
  assert.equal(defaultLevel('offer_choices'), 'always');
  // Anything that changes things is asked about by default.
  for (const tool of TOOL_CATALOG) {
    if (tool.changesThings) assert.equal(tool.defaultLevel, 'ask', tool.name);
  }
});

test('the catalog matches the tools the assistant is really given, so none is missed', () => {
  const env = {} as AgentEnv;
  const offered = createAgentTools(env)
    .definitions.map((d) => d.name)
    .sort();
  assert.deepEqual(TOOL_CATALOG.map((t) => t.name).sort(), offered);
});
