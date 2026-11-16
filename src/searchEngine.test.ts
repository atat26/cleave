import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeEngine,
  defaultSearchEngineSettings,
  ENGINES,
  engineHome,
  fillTemplate,
  isValidTemplate,
  parseSearchEngineSettings,
  withSearchEngine,
} from './searchEngine.ts';

test('DuckDuckGo is the default, and every built-in engine is a valid address', () => {
  assert.equal(activeEngine(defaultSearchEngineSettings()).name, 'DuckDuckGo');
  for (const engine of ENGINES) {
    assert.equal(isValidTemplate(engine.template), true, engine.id);
  }
});

test('a custom address must be https with %s, and no sign-in details', () => {
  assert.equal(isValidTemplate('https://example.com/s?q=%s'), true);
  assert.equal(isValidTemplate('https://example.com/search/%s/'), true);
  for (const bad of [
    'https://example.com/s?q=',
    'http://example.com/s?q=%s',
    'javascript:alert(%s)',
    'https://user:pw@example.com/?q=%s',
    'https:///?q=%s',
    'not a url %s',
    '',
    5,
    'https://example.com/?q=%s' + 'x'.repeat(600),
  ]) {
    assert.equal(isValidTemplate(bad), false, String(bad));
  }
});

test('the words go into the address, safely encoded', () => {
  assert.equal(
    fillTemplate('https://e.com/?q=%s', 'giant pandas & bamboo'),
    'https://e.com/?q=giant%20pandas%20%26%20bamboo',
  );
  // "$&"-style patterns in the words are just text.
  assert.equal(
    fillTemplate('https://e.com/?q=%s', '$&'),
    'https://e.com/?q=%24%26',
  );
  assert.equal(
    fillTemplate('https://e.com/%s/%s', 'a b'),
    'https://e.com/a%20b/a%20b',
  );
});

test('picking an engine, adding a custom one, and removing it', () => {
  let settings = withSearchEngine(defaultSearchEngineSettings(), {
    engine: 'google',
  });
  assert.equal(activeEngine(settings).name, 'Google');
  // Custom cannot be picked before one is set.
  assert.equal(
    withSearchEngine(settings, { engine: 'custom' }).engine,
    'google',
  );
  settings = withSearchEngine(settings, {
    custom: { name: '  My   engine ', template: 'https://e.com/?q=%s' },
    engine: 'custom',
  });
  assert.deepEqual(activeEngine(settings), {
    id: 'custom',
    name: 'My engine',
    template: 'https://e.com/?q=%s',
  });
  // A bad custom address, or an unknown engine, changes nothing.
  assert.equal(
    withSearchEngine(settings, {
      custom: { name: 'x', template: 'http://e.com/%s' },
    }),
    settings,
  );
  assert.equal(withSearchEngine(settings, { engine: 'nope' }), settings);
  // Removing the custom engine while it is in use goes back to the default.
  settings = withSearchEngine(settings, { custom: null });
  assert.equal(settings.custom, null);
  assert.equal(activeEngine(settings).name, 'DuckDuckGo');
  assert.equal(withSearchEngine(settings, 5), settings);
});

test('whatever is on disk is repaired, never trusted', () => {
  assert.equal(
    activeEngine(parseSearchEngineSettings({ engine: 'bing' })).name,
    'Bing',
  );
  // "custom" without a valid custom engine falls back to the default.
  for (const raw of [
    { engine: 'custom' },
    { engine: 'custom', custom: { name: 'x', template: 'javascript:%s' } },
    { engine: 'nope' },
    null,
    5,
    [],
  ]) {
    assert.deepEqual(
      parseSearchEngineSettings(raw),
      defaultSearchEngineSettings(),
    );
  }
  const kept = parseSearchEngineSettings({
    engine: 'custom',
    custom: { name: 'Mine', template: 'https://e.com/?q=%s' },
  });
  assert.equal(activeEngine(kept).name, 'Mine');
});

test('a new tab opens the home page of the engine in use', () => {
  assert.equal(engineHome(ENGINES[0]), 'https://duckduckgo.com/');
  assert.equal(
    engineHome(
      activeEngine(
        withSearchEngine(defaultSearchEngineSettings(), { engine: 'google' }),
      ),
    ),
    'https://www.google.com/',
  );
  assert.equal(
    engineHome({
      id: 'custom',
      name: 'Mine',
      template: 'https://e.com:8443/s/?q=%s',
    }),
    'https://e.com:8443/',
  );
});
