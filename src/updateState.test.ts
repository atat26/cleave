import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UPDATE_FEED,
  describeUpdate,
  nextUpdateState,
  plainError,
  versionFrom,
} from './updateState.ts';
import type { UpdateEvent, UpdateState } from './updateState.ts';

const run = (start: UpdateState, ...events: UpdateEvent[]): UpdateState =>
  events.reduce(nextUpdateState, start);

test('the update files come from the latest release of this repository, over https', () => {
  assert.equal(
    UPDATE_FEED,
    'https://github.com/atat26/cleave/releases/latest/download',
  );
  assert.ok(!UPDATE_FEED.endsWith('/'));
});

test('a check with nothing new ends at "current"', () => {
  assert.deepEqual(
    run({ kind: 'idle' }, { type: 'check-started' }, { type: 'none' }),
    { kind: 'current' },
  );
});

test('a newer version goes checking, downloading, ready', () => {
  const start: UpdateState = { kind: 'idle' };
  assert.deepEqual(run(start, { type: 'check-started' }), { kind: 'checking' });
  assert.deepEqual(run(start, { type: 'check-started' }, { type: 'found' }), {
    kind: 'downloading',
  });
  assert.deepEqual(
    run(
      start,
      { type: 'check-started' },
      { type: 'found' },
      { type: 'downloaded', version: '0.2.0' },
    ),
    { kind: 'ready', version: '0.2.0' },
  );
});

test('pressing check while one is running does not start another', () => {
  assert.deepEqual(run({ kind: 'checking' }, { type: 'check-started' }), {
    kind: 'checking',
  });
  assert.deepEqual(run({ kind: 'downloading' }, { type: 'check-started' }), {
    kind: 'downloading',
  });
});

test('a ready update stays ready, and a copy that cannot update stays that way', () => {
  const ready: UpdateState = { kind: 'ready', version: '0.2.0' };
  assert.deepEqual(run(ready, { type: 'check-started' }), ready);
  assert.deepEqual(run(ready, { type: 'failed', message: 'x' }), ready);
  const dev: UpdateState = { kind: 'unavailable', why: 'development' };
  assert.deepEqual(run(dev, { type: 'check-started' }), dev);
  assert.deepEqual(run(dev, { type: 'downloaded', version: '1.0.0' }), dev);
});

test('a failure shows its message and a new check can follow', () => {
  const failed = run(
    { kind: 'checking' },
    { type: 'failed', message: 'no network' },
  );
  assert.deepEqual(failed, { kind: 'error', message: 'no network' });
  assert.deepEqual(run(failed, { type: 'check-started' }), {
    kind: 'checking',
  });
});

test('events that do not fit the state change nothing', () => {
  assert.deepEqual(run({ kind: 'idle' }, { type: 'none' }), { kind: 'idle' });
  assert.deepEqual(run({ kind: 'current' }, { type: 'found' }), {
    kind: 'current',
  });
});

test('a version is found in a release name, or null', () => {
  assert.equal(versionFrom('0.2.0'), '0.2.0');
  assert.equal(versionFrom('Cleave 0.2.1'), '0.2.1');
  assert.equal(versionFrom('v1.4.10-beta.1'), '1.4.10-beta.1');
  assert.equal(versionFrom('latest'), null);
  assert.equal(versionFrom(undefined), null);
  assert.equal(versionFrom(42), null);
});

test('an error is one short line, without file paths', () => {
  assert.equal(plainError(new Error('boom')), 'boom');
  assert.equal(
    plainError(
      new Error(
        'Cannot find C:\\Users\\me\\AppData\\Local\\Cleave\\Update.exe\nat stack',
      ),
    ),
    'Cannot find …',
  );
  assert.equal(plainError(''), 'something went wrong');
  assert.equal(plainError(undefined), 'something went wrong');
  assert.ok(plainError(new Error('x'.repeat(500))).length <= 160);
});

test('each state says what is going on and offers at most one button', () => {
  const idle = describeUpdate({ kind: 'idle' });
  assert.equal(idle.button?.action, 'check');
  assert.equal(idle.busy, false);

  for (const kind of ['checking', 'downloading'] as const) {
    const view = describeUpdate({ kind });
    assert.equal(view.busy, true, kind);
  }

  const ready = describeUpdate({ kind: 'ready', version: '0.2.0' });
  assert.match(ready.text, /Version 0\.2\.0 is ready/);
  assert.equal(ready.button?.action, 'install');
  assert.equal(ready.busy, false);
  assert.match(
    describeUpdate({ kind: 'ready', version: null }).text,
    /A newer version is ready/,
  );

  assert.match(describeUpdate({ kind: 'current' }).text, /latest version/);
  const error = describeUpdate({ kind: 'error', message: 'no network' });
  assert.match(error.text, /no network/);
  assert.equal(error.button?.action, 'check');
});

test('a copy that cannot update says why and has no button', () => {
  const dev = describeUpdate({ kind: 'unavailable', why: 'development' });
  assert.match(dev.text, /development copy/);
  assert.equal(dev.button, null);
  const other = describeUpdate({ kind: 'unavailable', why: 'not-installed' });
  assert.match(other.text, /Releases page/);
  assert.equal(other.button, null);
});
