import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARTIFACT_DRAG,
  artifactDragData,
  hasArtifactDrag,
  hasFileDrag,
  hasItemDrag,
  ITEM_DRAG,
  itemDragData,
  readArtifactDrag,
  readItemDrag,
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

test('files dragged in from the computer are told apart from drags inside the app', () => {
  assert.equal(hasFileDrag(['Files']), true);
  assert.equal(hasFileDrag(['text/plain', 'Files']), true);
  assert.equal(hasFileDrag([ARTIFACT_DRAG]), false);
  assert.equal(hasFileDrag(['text/plain']), false);
  assert.equal(hasFileDrag(null), false);
  assert.equal(hasFileDrag(undefined), false);
});

test('a sidebar row drag carries what it is and its number, and reads back the same', () => {
  assert.equal(itemDragData('tab', 12), 'tab:12');
  assert.deepEqual(readItemDrag(itemDragData('tab', 12)), {
    kind: 'tab',
    id: 12,
  });
  assert.deepEqual(readItemDrag(itemDragData('space', 3)), {
    kind: 'space',
    id: 3,
  });
  assert.deepEqual(readItemDrag(itemDragData('artifact', 999999999)), {
    kind: 'artifact',
    id: 999999999,
  });
});

test('anything that is not exactly "tab", "space" or "artifact" and a number is refused', () => {
  for (const bad of [
    '',
    'tab',
    'tab:',
    'tab:0',
    'tab:-1',
    'tab:1.5',
    'tab: 1',
    'tab:1 ',
    'tab:1234567890',
    'window:1',
    'Tab:1',
    'tab:1;space:2',
    'tab:1\nspace:2',
    'https://example.com',
    null,
    undefined,
    7,
    {},
  ]) {
    assert.equal(readItemDrag(bad), null, String(bad));
  }
});

test('only a drag with the app’s own row type counts as a row drag', () => {
  assert.equal(hasItemDrag([ITEM_DRAG]), true);
  assert.equal(hasItemDrag(['text/plain', ITEM_DRAG]), true);
  // Plain text (even "tab:12" dragged from a web page) is not trusted.
  assert.equal(hasItemDrag(['text/plain']), false);
  assert.equal(hasItemDrag(['Files']), false);
  assert.equal(hasItemDrag([]), false);
  assert.equal(hasItemDrag(null), false);
});
