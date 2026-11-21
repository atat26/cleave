import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeError,
  isDestroyedError,
  MAX_LOG_CHARS,
  trimLog,
} from './errorLog.ts';

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);

test('an entry says when, what kind, and the top of the stack', () => {
  const error = new TypeError('Object has been destroyed');
  const entry = describeError('uncaught error', error, NOW);
  assert.match(entry, /^\[2026-11-21T12:00:00\.000Z\] uncaught error\n/);
  assert.match(entry, /TypeError: Object has been destroyed/);
  assert.ok(entry.endsWith('\n\n'));
  assert.ok(entry.split('\n').length <= 14);
});

test('anything can be described, and an entry is never huge', () => {
  assert.match(describeError('x', 'just a string', NOW), /just a string/);
  assert.match(describeError('x', undefined, NOW), /undefined/);
  assert.match(describeError('x', { odd: true }, NOW), /object/);
  const evil = {
    toString() {
      throw new Error('no');
    },
  };
  assert.match(describeError('x', evil, NOW), /could not be described/);
  assert.ok(
    describeError('x', new Error('y'.repeat(50_000)), NOW).length < 2200,
  );
});

test('a log that grows too long keeps its newest whole entries', () => {
  const entries = Array.from({ length: 200 }, (_, i) =>
    describeError(
      'k',
      new Error(`error number ${i} ${'z'.repeat(900)}`),
      NOW + i,
    ),
  );
  const log = entries.join('');
  assert.ok(log.length > MAX_LOG_CHARS);
  const kept = trimLog(log);
  assert.ok(kept.length <= MAX_LOG_CHARS);
  assert.ok(kept.startsWith('['), 'it starts at the beginning of an entry');
  assert.ok(kept.includes('error number 199'));
  assert.ok(!kept.includes('error number 0 '));
  // A short log is left alone.
  assert.equal(trimLog('short'), 'short');
});

test('the harmless "already gone" error is recognised', () => {
  assert.equal(
    isDestroyedError(new TypeError('Object has been destroyed')),
    true,
  );
  assert.equal(isDestroyedError(new Error('something else')), false);
  assert.equal(isDestroyedError('Object has been destroyed'), false);
});
