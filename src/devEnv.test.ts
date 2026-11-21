import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refusesDebugging } from './debugSwitch.ts';
import { devEnv, isInstalledApp } from './devEnv.ts';

const env = { AIB_TEST_SCOPE: '1', AIB_TRACE: '1' };

test('the installed app is Electron that was not handed a project folder', () => {
  assert.equal(isInstalledApp({ versions: { electron: '45.4.1' } }), true);
  assert.equal(
    isInstalledApp({ versions: { electron: '45.4.1' }, defaultApp: true }),
    false,
  );
  // Plain Node (the tests, scripts) is not the installed app.
  assert.equal(isInstalledApp({ versions: {} }), false);
  assert.equal(isInstalledApp({}), false);
});

test('the test and development settings count in a development copy and never in the installed app', () => {
  const development = {
    versions: { electron: '45.4.1' },
    defaultApp: true,
    env,
  };
  const installed = { versions: { electron: '45.4.1' }, env };
  const node = { versions: {}, env };
  assert.equal(devEnv('AIB_TEST_SCOPE', development), '1');
  assert.equal(devEnv('AIB_TEST_SCOPE', node), '1');
  assert.equal(devEnv('AIB_TEST_SCOPE', installed), undefined);
  assert.equal(devEnv('AIB_TRACE', installed), undefined);
  assert.equal(devEnv('AIB_NOT_SET', development), undefined);
});

test('the installed app refuses remote debugging for your own data, and only that', () => {
  const start = {
    installed: true,
    debugPort: false,
    debugPipe: false,
    ownFolder: false,
  };
  assert.equal(refusesDebugging(start), false);
  assert.equal(refusesDebugging({ ...start, debugPort: true }), true);
  assert.equal(refusesDebugging({ ...start, debugPipe: true }), true);
  // A test of an installed build on a folder of its own is allowed.
  assert.equal(
    refusesDebugging({ ...start, debugPort: true, ownFolder: true }),
    false,
  );
  // A development copy may always debug.
  assert.equal(
    refusesDebugging({ ...start, installed: false, debugPort: true }),
    false,
  );
});
