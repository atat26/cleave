import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

// A setting is saved half a second after it changes. If the window closes in that half second, the
// change is only kept when the close handler writes it at once. So every saver made in tabs.ts must
// be flushed there. (A theme or a skill changed just before quitting used to be lost.)
test('every saver made in tabs.ts is written when the window closes', () => {
  const source = fs.readFileSync(new URL('./tabs.ts', import.meta.url), 'utf8');
  const made = [...source.matchAll(/const (\w*[sS]aver) = createSaver\(/g)].map(
    (m) => m[1],
  );
  assert.ok(made.length > 20, 'the savers were not found');
  assert.ok(source.includes('saveEverythingNow();'));
  assert.ok(source.includes("win.on('session-end', saveEverythingNow)"));
  const fromClose = source.slice(
    source.indexOf('const saveEverythingNow = () => {'),
  );
  const handler = fromClose.slice(0, fromClose.indexOf('});'));
  for (const name of made) {
    assert.ok(
      handler.includes(`${name}.flushSync()`),
      `${name} is not written when the window closes`,
    );
  }
});
