import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  labelPlacement,
  markerLabel,
  markerTone,
  MAX_MARKER_NAME,
  rectFromQuads,
  toOverlayRect,
} from './marker.ts';

test('the box of an element comes from the first shape with a real size', () => {
  assert.deepEqual(
    rectFromQuads({ quads: [[10, 20, 110, 20, 110, 50, 10, 50]] }),
    {
      x: 10,
      y: 20,
      width: 100,
      height: 30,
    },
  );
  // A shape with no size (hidden) is skipped for the next one.
  assert.deepEqual(
    rectFromQuads({
      quads: [
        [5, 5, 5, 5, 5, 5, 5, 5],
        [0, 0, 40, 0, 40, 10, 0, 10],
      ],
    }),
    { x: 0, y: 0, width: 40, height: 10 },
  );
  // A tilted shape becomes the box round it.
  assert.deepEqual(rectFromQuads({ quads: [[10, 0, 20, 10, 10, 20, 0, 10]] }), {
    x: 0,
    y: 0,
    width: 20,
    height: 20,
  });
  for (const bad of [
    null,
    'x',
    {},
    { quads: [] },
    { quads: [[1, 2]] },
    { quads: [[1, 2, 3, 4, 5, 6, 7, NaN]] },
  ]) {
    assert.equal(rectFromQuads(bad), null, JSON.stringify(bad));
  }
});

test('the box is scaled by the page zoom and kept inside the page', () => {
  const view = { width: 800, height: 600 };
  assert.deepEqual(
    toOverlayRect({ x: 100, y: 50, width: 200, height: 40 }, 1, view),
    {
      x: 100,
      y: 50,
      width: 200,
      height: 40,
    },
  );
  // Zoomed in to 150%: everything is bigger and further from the corner.
  assert.deepEqual(
    toOverlayRect({ x: 100, y: 50, width: 200, height: 40 }, 1.5, view),
    {
      x: 150,
      y: 75,
      width: 300,
      height: 60,
    },
  );
  // Partly off the page: the part that is on it.
  assert.deepEqual(
    toOverlayRect({ x: 700, y: -10, width: 200, height: 40 }, 1, view),
    {
      x: 700,
      y: 0,
      width: 100,
      height: 30,
    },
  );
  // Wholly off the page, or an unusable zoom: nothing.
  assert.equal(
    toOverlayRect({ x: 900, y: 0, width: 50, height: 20 }, 1, view),
    null,
  );
  assert.equal(
    toOverlayRect({ x: 0, y: 0, width: 50, height: 20 }, 0, view),
    null,
  );
  assert.equal(
    toOverlayRect({ x: 0, y: 0, width: 50, height: 20 }, NaN, view),
    null,
  );
});

test('the marker colour follows how the step is going', () => {
  assert.equal(markerTone('running'), 'acting');
  assert.equal(markerTone('waiting'), 'waiting');
  assert.equal(markerTone('done'), 'done');
  assert.equal(markerTone('failed'), 'blocked');
  assert.equal(markerTone('blocked'), 'blocked');
  // Not shown: you said no, or the reply was cut off.
  assert.equal(markerTone('declined'), null);
  assert.equal(markerTone('stopped'), null);
});

test('the label is plain words and the element name, in the right tense', () => {
  assert.equal(
    markerLabel('click', 'acting', 'Add to cart'),
    'Clicking · Add to cart',
  );
  assert.equal(markerLabel('type_text', 'acting', 'Search'), 'Typing · Search');
  assert.equal(
    markerLabel('select_option', 'waiting', 'Size'),
    'Waiting for you · Size',
  );
  assert.equal(
    markerLabel('click', 'done', 'Add to cart'),
    'Clicked · Add to cart',
  );
  assert.equal(markerLabel('type_text', 'done', 'Search'), 'Typed · Search');
  assert.equal(markerLabel('select_option', 'done', 'Size'), 'Chose · Size');
  assert.equal(markerLabel('click', 'blocked', 'Buy'), 'Not done · Buy');
  // No name: just the word. A long, messy name is tidied and cut.
  assert.equal(markerLabel('click', 'acting', ''), 'Clicking');
  assert.equal(markerLabel('click', 'acting', '  a \n b  '), 'Clicking · a b');
  assert.equal(
    markerLabel('click', 'acting', 'x'.repeat(100)).length,
    'Clicking · '.length + MAX_MARKER_NAME,
  );
  assert.equal(markerLabel('mystery', 'acting', 'x'), 'Working · x');
});

test('the label goes above the ring, or below, or inside when there is no room', () => {
  const view = { width: 800, height: 600 };
  const pill = { x: 120, width: 560, height: 34 };
  assert.equal(
    labelPlacement({ x: 50, y: 200, width: 100, height: 30 }, view, pill),
    'above',
  );
  // Near the top: below.
  assert.equal(
    labelPlacement({ x: 50, y: 10, width: 100, height: 30 }, view, pill),
    'below',
  );
  // Where the pill hangs: below rather than under the pill.
  assert.equal(
    labelPlacement({ x: 300, y: 40, width: 100, height: 30 }, view, pill),
    'below',
  );
  // But the same place away from the pill is fine.
  assert.equal(
    labelPlacement({ x: 10, y: 40, width: 60, height: 30 }, view, pill),
    'above',
  );
  // No room above or below (a tall element filling the page): inside.
  assert.equal(
    labelPlacement({ x: 0, y: 5, width: 800, height: 595 }, view, pill),
    'inside',
  );
  // No pill (the glow only): only the top edge matters.
  assert.equal(
    labelPlacement({ x: 300, y: 40, width: 100, height: 30 }, view, null),
    'above',
  );
});
