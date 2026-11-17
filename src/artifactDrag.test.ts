import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARTIFACT_DRAG,
  artifactDragData,
  hasArtifactDrag,
  readArtifactDrag,
} from './artifactDrag.ts';

test('an artifact drag carries just its number, and reads back the same', () => {
  assert.equal(artifactDragData(42), '42');
  assert.equal(readArtifactDrag(artifactDragData(42)), 42);
  assert.equal(readArtifactDrag('1'), 1);
  assert.equal(readArtifactDrag('999999999'), 999999999);
});

test('anything that is not a plain positive number is refused', () => {
  for (const bad of [
    '',
    '0',
    '-1',
    '1.5',
    '1e3',
    ' 3',
    '3 ',
    '0x10',
    'abc',
    '1; drop',
    '1234567890',
    '٣',
    null,
    undefined,
    7,
    {},
    [],
  ]) {
    assert.equal(readArtifactDrag(bad), null, String(bad));
  }
});

test('a drag is recognised by its type', () => {
  assert.equal(hasArtifactDrag([ARTIFACT_DRAG]), true);
  assert.equal(hasArtifactDrag(['text/plain', ARTIFACT_DRAG]), true);
  assert.equal(hasArtifactDrag(['text/plain', 'Files']), false);
  assert.equal(hasArtifactDrag([]), false);
  assert.equal(hasArtifactDrag(null), false);
  assert.equal(hasArtifactDrag(undefined), false);
  // The browser hands over a list-like object, not always a real array.
  assert.equal(
    hasArtifactDrag({
      0: ARTIFACT_DRAG,
      length: 1,
      [Symbol.iterator]: Array.prototype[Symbol.iterator],
    } as unknown as string[]),
    true,
  );
});
