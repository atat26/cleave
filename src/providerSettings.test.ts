import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultProviderSettings,
  MAX_PINNED,
  MAX_SYSTEM_PROMPT,
  parseProviderSettings,
  togglePinned,
  withModel,
  withSystemPrompt,
} from './providerSettings.ts';

test('defaults: no model, nothing pinned, default system prompt', () => {
  assert.deepEqual(defaultProviderSettings(), {
    version: 1,
    provider: 'openrouter',
    model: null,
    pinned: [],
    systemPrompt: null,
  });
});

test('pinning toggles, keeps pin order, and ignores bad names', () => {
  let s = defaultProviderSettings();
  s = togglePinned(s, 'openai/gpt-4o');
  s = togglePinned(s, 'meta/llama-3:free');
  assert.deepEqual(s.pinned, ['openai/gpt-4o', 'meta/llama-3:free']);
  s = togglePinned(s, 'openai/gpt-4o'); // unpin
  assert.deepEqual(s.pinned, ['meta/llama-3:free']);
  assert.equal(togglePinned(s, 'bad name!'), s);
  assert.equal(togglePinned(s, 42), s);
});

test('there is a limit on how many models can be pinned', () => {
  let s = defaultProviderSettings();
  for (let i = 0; i < MAX_PINNED + 5; i++)
    s = togglePinned(s, `vendor/model-${i}`);
  assert.equal(s.pinned.length, MAX_PINNED);
  // At the limit, a new pin is refused but unpinning still works.
  assert.equal(togglePinned(s, 'vendor/one-more'), s);
  assert.equal(togglePinned(s, 'vendor/model-0').pinned.length, MAX_PINNED - 1);
});

test('the system prompt: set, reset to default, trim to the limit', () => {
  const s = defaultProviderSettings();
  assert.equal(
    withSystemPrompt(s, 'Answer in French.').systemPrompt,
    'Answer in French.',
  );
  // Blank or null means "use the default".
  assert.equal(
    withSystemPrompt(withSystemPrompt(s, 'x y z'), '   \n ').systemPrompt,
    null,
  );
  assert.equal(
    withSystemPrompt(withSystemPrompt(s, 'x y z'), null).systemPrompt,
    null,
  );
  // Too long is cut, not rejected.
  assert.equal(
    withSystemPrompt(s, 'a'.repeat(9000)).systemPrompt?.length,
    MAX_SYSTEM_PROMPT,
  );
  // Not text: ignored.
  assert.equal(withSystemPrompt(s, 42), s);
  assert.equal(withSystemPrompt(s, { x: 1 }), s);
});

test('everything is validated when loading a saved file', () => {
  const good = parseProviderSettings({
    model: 'openai/gpt-4o',
    pinned: ['a/b', 'c/d', 'a/b', 'bad name', 7, null],
    systemPrompt: 'Be brief.',
  });
  assert.equal(good.model, 'openai/gpt-4o');
  assert.deepEqual(good.pinned, ['a/b', 'c/d']); // duplicates and junk dropped
  assert.equal(good.systemPrompt, 'Be brief.');

  for (const junk of [
    null,
    undefined,
    5,
    'x',
    [],
    {},
    { model: 5, pinned: 'no', systemPrompt: 9 },
  ]) {
    assert.deepEqual(
      parseProviderSettings(junk),
      defaultProviderSettings(),
      JSON.stringify(junk),
    );
  }
  assert.equal(
    parseProviderSettings({ systemPrompt: '   ' }).systemPrompt,
    null,
  );
  assert.equal(
    parseProviderSettings({
      pinned: Array.from({ length: 50 }, (_, i) => `v/m${i}`),
    }).pinned.length,
    MAX_PINNED,
  );
  assert.equal(
    parseProviderSettings({ systemPrompt: 'a'.repeat(9000) }).systemPrompt
      ?.length,
    MAX_SYSTEM_PROMPT,
  );
});

test('choosing a default model still works as before', () => {
  const s = defaultProviderSettings();
  assert.equal(withModel(s, 'meta/llama-3:free').model, 'meta/llama-3:free');
  assert.equal(withModel(withModel(s, 'a/b'), null).model, null);
  const chosen = withModel(s, 'a/b');
  assert.equal(withModel(chosen, 'bad name!'), chosen);
  // Choosing a model does not disturb pins or the prompt.
  const rich = withSystemPrompt(togglePinned(s, 'x/y'), 'Hi there');
  assert.deepEqual(
    {
      pinned: withModel(rich, 'a/b').pinned,
      prompt: withModel(rich, 'a/b').systemPrompt,
    },
    { pinned: ['x/y'], prompt: 'Hi there' },
  );
});
