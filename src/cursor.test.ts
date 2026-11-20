import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURSOR_DONE_MS, cursorFor, scrollDirection } from './cursor.ts';
import type { CursorInput } from './cursor.ts';

const page = { width: 800, height: 600 };
const rect = { x: 100, y: 200, width: 120, height: 30 };
const input = (over: Partial<CursorInput> = {}): CursorInput => ({
  toolName: 'click',
  state: 'running',
  rect,
  page,
  direction: null,
  sinceDoneMs: null,
  ...over,
});

test('clicking shows an arrow in the middle of the element, blue, with its verb', () => {
  assert.deepEqual(cursorFor(input()), {
    x: 160,
    y: 215,
    kind: 'arrow',
    tone: 'acting',
    tag: 'Clicking',
    burst: false,
  });
  assert.equal(
    cursorFor(input({ toolName: 'select_option' }))?.tag,
    'Choosing',
  );
});

test('typing shows a text cursor at the start of the field', () => {
  const view = cursorFor(input({ toolName: 'type_text' }));
  assert.equal(view?.kind, 'beam');
  assert.equal(view?.tag, 'Typing');
  assert.equal(view?.x, 116);
  assert.equal(view?.y, 215);
  // A very narrow field: no further in than its middle.
  const narrow = cursorFor(
    input({
      toolName: 'type_text',
      rect: { x: 10, y: 10, width: 10, height: 20 },
    }),
  );
  assert.equal(narrow?.x, 15);
});

test('filling several fields shows the same text cursor, on the first field', () => {
  const typing = cursorFor(input({ toolName: 'type_text' }));
  const filling = cursorFor(input({ toolName: 'fill_fields' }));
  assert.equal(filling?.kind, 'beam');
  assert.equal(filling?.tag, 'Typing');
  assert.equal(filling?.x, typing?.x);
  assert.equal(filling?.y, typing?.y);
});

test('while it waits for you it rests above the element, amber, with no click', () => {
  const view = cursorFor(input({ state: 'waiting' }));
  assert.equal(view?.tone, 'waiting');
  assert.equal(view?.tag, 'Waiting for you');
  assert.equal(view?.x, 160);
  assert.equal(view?.y, 196);
  assert.equal(view?.burst, false);
  // An element at the very top: kept on the page.
  const top = cursorFor(
    input({ state: 'waiting', rect: { x: 0, y: 0, width: 50, height: 20 } }),
  );
  assert.equal(top?.y, 4);
});

test('a click that has landed shows a glow for a moment, then the cursor goes', () => {
  const landed = cursorFor(input({ state: 'done', sinceDoneMs: 0 }));
  assert.equal(landed?.burst, true);
  assert.equal(landed?.tone, 'acting');
  assert.equal(
    cursorFor(input({ state: 'done', sinceDoneMs: CURSOR_DONE_MS + 1 })),
    null,
  );
  // Finished without ever being timed: nothing.
  assert.equal(cursorFor(input({ state: 'done', sinceDoneMs: null })), null);
  // Typing does not click.
  assert.equal(
    cursorFor(input({ toolName: 'type_text', state: 'done', sinceDoneMs: 0 }))
      ?.burst,
    false,
  );
});

test('scrolling shows its direction, in the middle of the page', () => {
  const down = cursorFor(
    input({ toolName: 'scroll', rect: null, direction: 'down' }),
  );
  assert.equal(down?.tag, 'Scrolling ↓');
  assert.equal(down?.x, 400);
  assert.equal(down?.y, 300);
  assert.equal(
    cursorFor(input({ toolName: 'scroll', rect: null, direction: 'up' }))?.tag,
    'Scrolling ↑',
  );
  // No direction given (or an odd one): nothing.
  assert.equal(
    cursorFor(input({ toolName: 'scroll', rect: null, direction: null })),
    null,
  );
});

test('no cursor for steps that are blocked, declined, stopped or failed, or have nothing to point at', () => {
  for (const state of ['blocked', 'declined', 'stopped', 'failed'] as const) {
    assert.equal(cursorFor(input({ state })), null, state);
  }
  // An element step whose element was not found.
  assert.equal(cursorFor(input({ rect: null })), null);
  // Reading, looking, keys and addresses show none.
  for (const toolName of ['look_at_page', 'press_key', 'go_to', 'list_tabs']) {
    assert.equal(cursorFor(input({ toolName })), null, toolName);
  }
});

test('the tip is kept on the page', () => {
  const edge = cursorFor(
    input({ rect: { x: 700, y: 560, width: 400, height: 200 } }),
  );
  assert.equal(edge?.x, 796);
  assert.equal(edge?.y, 596);
});

test("a scroll step's direction is read from its arguments, never trusted", () => {
  assert.equal(scrollDirection('{"tab":3,"direction":"down"}'), 'down');
  assert.equal(scrollDirection('{"tab":3,"direction":"up"}'), 'up');
  assert.equal(scrollDirection('{"direction":"sideways"}'), null);
  assert.equal(scrollDirection('not json'), null);
  assert.equal(scrollDirection('null'), null);
  assert.equal(scrollDirection('{}'), null);
});
