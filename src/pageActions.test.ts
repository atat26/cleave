import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chooseOption,
  clickControl,
  findSensitiveFields,
  judgeField,
  pressKey,
  readLinkAddress,
  scrollPage,
  typeIntoControl,
} from './pageActions.ts';
import type { Cdp } from './pageActions.ts';

// A fake page: answers commands from a table and records every command sent.
function fakePage(
  answers: Record<
    string,
    unknown | ((params: Record<string, unknown>) => unknown)
  > = {},
) {
  const sent: { method: string; params?: Record<string, unknown> }[] = [];
  const cdp: Cdp = {
    send: async (method, params) => {
      sent.push({ method, params });
      const answer = answers[method];
      if (answer instanceof Error) throw answer;
      return typeof answer === 'function'
        ? answer(params ?? {})
        : (answer ?? {});
    },
  };
  return { cdp, sent, methods: () => sent.map((s) => s.method) };
}

const QUAD = { quads: [[10, 10, 110, 10, 110, 50, 10, 50]] }; // 100 x 40 at (10,10)

const input = (attributes: Record<string, string>, tag = 'INPUT') => ({
  node: {
    nodeName: tag,
    attributes: Object.entries(attributes).flat(),
  },
});

test('a click scrolls to the control, aims at its middle, and presses and releases there', async () => {
  const page = fakePage({
    'DOM.getContentQuads': QUAD,
    'DOM.getNodeForLocation': { backendNodeId: 7 },
  });
  const result = await clickControl(page.cdp, 7);
  assert.deepEqual(result, { ok: true });
  const mouse = page.sent.filter(
    (s) => s.method === 'Input.dispatchMouseEvent',
  );
  assert.deepEqual(
    mouse.map((m) => [m.params?.type, m.params?.x, m.params?.y]),
    [
      ['mouseMoved', 60, 30],
      ['mousePressed', 60, 30],
      ['mouseReleased', 60, 30],
    ],
  );
  assert.ok(page.methods().includes('DOM.scrollIntoViewIfNeeded'));
});

test('a control that something else covers is not clicked', async () => {
  const page = fakePage({
    'DOM.getContentQuads': QUAD,
    'DOM.getNodeForLocation': { backendNodeId: 99 }, // something on top
    'Page.getFrameTree': { frameTree: { frame: { id: 'f' } } },
    'Page.createIsolatedWorld': { executionContextId: 5 },
    'DOM.resolveNode': { object: { objectId: 'obj' } },
    'Runtime.callFunctionOn': { result: { value: false } }, // not inside the target
  });
  const result = await clickControl(page.cdp, 7);
  assert.deepEqual(result, { ok: false, reason: 'blocked' });
  assert.ok(!page.methods().includes('Input.dispatchMouseEvent'));
});

test('something inside the control (such as its text) counts as the control', async () => {
  const page = fakePage({
    'DOM.getContentQuads': QUAD,
    'DOM.getNodeForLocation': { backendNodeId: 99 },
    'Page.getFrameTree': { frameTree: { frame: { id: 'f' } } },
    'Page.createIsolatedWorld': { executionContextId: 5 },
    'DOM.resolveNode': { object: { objectId: 'obj' } },
    'Runtime.callFunctionOn': { result: { value: true } },
  });
  assert.deepEqual(await clickControl(page.cdp, 7), { ok: true });
});

test('a control with no visible box, or that has gone, is reported and nothing is clicked', async () => {
  const hidden = fakePage({ 'DOM.getContentQuads': { quads: [] } });
  assert.deepEqual(await clickControl(hidden.cdp, 7), {
    ok: false,
    reason: 'gone',
  });
  assert.ok(!hidden.methods().includes('Input.dispatchMouseEvent'));

  const gone = fakePage({
    'DOM.scrollIntoViewIfNeeded': new Error('Node is detached from document'),
  });
  assert.deepEqual(await clickControl(gone.cdp, 7), {
    ok: false,
    reason: 'gone',
  });

  const broken = fakePage({ 'DOM.scrollIntoViewIfNeeded': new Error('boom') });
  assert.deepEqual(await clickControl(broken.cdp, 7), {
    ok: false,
    reason: 'unavailable',
  });
});

test('typing focuses the field, selects what is there and types the new text', async () => {
  const page = fakePage({
    'DOM.describeNode': input({ type: 'text', 'aria-label': 'Search' }),
  });
  assert.deepEqual(await typeIntoControl(page.cdp, 7, 'hello'), { ok: true });
  assert.deepEqual(
    page.methods().filter((m) => m !== 'DOM.enable'),
    [
      'DOM.describeNode',
      'DOM.scrollIntoViewIfNeeded',
      'DOM.focus',
      'Input.dispatchKeyEvent',
      'Input.dispatchKeyEvent',
      'Input.insertText',
    ],
  );
  const select = page.sent.find((s) => s.method === 'Input.dispatchKeyEvent');
  assert.deepEqual(select?.params?.commands, ['selectAll']);
  assert.equal(
    page.sent.find((s) => s.method === 'Input.insertText')?.params?.text,
    'hello',
  );
});

test('typing is refused from the page itself for password, card and code fields, and for non-text things', async () => {
  const refused = async (attributes: Record<string, string>, tag = 'INPUT') => {
    const page = fakePage({ 'DOM.describeNode': input(attributes, tag) });
    const result = await typeIntoControl(page.cdp, 7, 'secret');
    assert.ok(!page.methods().includes('Input.insertText'));
    return result;
  };
  assert.deepEqual(await refused({ type: 'password' }), {
    ok: false,
    reason: 'sensitive',
  });
  assert.deepEqual(await refused({ type: 'text', autocomplete: 'cc-number' }), {
    ok: false,
    reason: 'sensitive',
  });
  assert.deepEqual(
    await refused({ type: 'text', autocomplete: 'one-time-code' }),
    { ok: false, reason: 'sensitive' },
  );
  assert.deepEqual(await refused({ type: 'text', name: 'card number' }), {
    ok: false,
    reason: 'sensitive',
  });
  assert.deepEqual(await refused({ type: 'checkbox' }), {
    ok: false,
    reason: 'not-editable',
  });
  assert.deepEqual(await refused({}, 'BUTTON'), {
    ok: false,
    reason: 'not-editable',
  });
  assert.deepEqual(
    judgeField({ tag: 'DIV', attributes: { contenteditable: 'true' } }),
    {
      editable: true,
      sensitive: false,
    },
  );
});

test('keys are sent as a press and a release, Enter with its character; unknown keys are refused', async () => {
  const page = fakePage();
  assert.deepEqual(await pressKey(page.cdp, 'Enter'), { ok: true });
  assert.deepEqual(
    page.sent.map((s) => [s.params?.type, s.params?.key, s.params?.text]),
    [
      ['keyDown', 'Enter', '\r'],
      ['keyUp', 'Enter', undefined],
    ],
  );
  const other = fakePage();
  assert.deepEqual(await pressKey(other.cdp, 'F12'), {
    ok: false,
    reason: 'blocked',
  });
  assert.equal(other.sent.length, 0);
});

test('scrolling turns the mouse wheel over the middle of the page, up or down', async () => {
  const page = fakePage({
    'Page.getLayoutMetrics': {
      cssVisualViewport: { clientWidth: 1000, clientHeight: 500 },
    },
  });
  await scrollPage(page.cdp, 'down');
  await scrollPage(page.cdp, 'up');
  const wheel = page.sent.filter(
    (s) => s.method === 'Input.dispatchMouseEvent',
  );
  assert.deepEqual(
    wheel.map((w) => [w.params?.x, w.params?.y, w.params?.deltaY]),
    [
      [500, 250, 400],
      [500, 250, -400],
    ],
  );
});

test('choosing an option reports success, a missing option, or a control that is not a dropdown', async () => {
  const run = async (value: string) => {
    const page = fakePage({
      'Page.getFrameTree': { frameTree: { frame: { id: 'f' } } },
      'Page.createIsolatedWorld': { executionContextId: 5 },
      'DOM.resolveNode': { object: { objectId: 'obj' } },
      'Runtime.callFunctionOn': { result: { value } },
    });
    return chooseOption(page.cdp, 7, 'Blue');
  };
  assert.deepEqual(await run('ok'), { ok: true });
  assert.deepEqual(await run('no-option'), { ok: false, reason: 'no-option' });
  assert.deepEqual(await run('not-select'), {
    ok: false,
    reason: 'not-editable',
  });
});

test('findSensitiveFields asks the page, and leaves out anything that fails', async () => {
  const facts: Record<number, unknown> = {
    1: input({ type: 'password' }),
    2: input({ type: 'text', 'aria-label': 'Search' }),
    4: input({ type: 'text', autocomplete: 'cc-csc' }),
  };
  const page = fakePage({
    'DOM.describeNode': (params: Record<string, unknown>) => {
      const answer = facts[params.backendNodeId as number];
      if (!answer) throw new Error('No node with given id');
      return answer;
    },
  });
  const found = await findSensitiveFields(page.cdp, [1, 2, 3, 4]);
  assert.deepEqual([...found].sort(), [1, 4]);
});

test('garbage from a page never crashes an action', async () => {
  const page = fakePage({
    'DOM.describeNode': 'junk',
    'DOM.getContentQuads': 42,
    'DOM.getNodeForLocation': null,
  });
  assert.equal((await typeIntoControl(page.cdp, 1, 'x')).ok, false);
  assert.equal((await clickControl(page.cdp, 1)).ok, false);
});

test('on a page that is scrolled, the covered-or-not check uses page coordinates while the click uses the window', async () => {
  const hits: { x: unknown; y: unknown }[] = [];
  const page = fakePage({
    'DOM.getContentQuads': QUAD, // the control is at (60, 30) in the window
    'Page.getLayoutMetrics': { cssVisualViewport: { pageX: 5, pageY: 2000 } },
    'DOM.getNodeForLocation': (params: Record<string, unknown>) => {
      hits.push({ x: params.x, y: params.y });
      return { backendNodeId: 7 };
    },
  });
  assert.deepEqual(await clickControl(page.cdp, 7), { ok: true });
  // The check looked at page coordinates (window position + scroll)...
  assert.deepEqual(hits, [{ x: 65, y: 2030 }]);
  // ...but the click itself was at the position in the window.
  const press = page.sent.find(
    (s) =>
      s.method === 'Input.dispatchMouseEvent' &&
      s.params?.type === 'mousePressed',
  );
  assert.deepEqual([press?.params?.x, press?.params?.y], [60, 30]);
});

test('nothing at the spot is "blocked", not "gone"; only a vanished control is gone', async () => {
  const empty = fakePage({
    'DOM.getContentQuads': QUAD,
    'DOM.getNodeForLocation': new Error('No node found at given location'),
  });
  assert.deepEqual(await clickControl(empty.cdp, 7), {
    ok: false,
    reason: 'blocked',
  });
  assert.ok(!empty.methods().includes('Input.dispatchMouseEvent'));

  const gone = fakePage({
    'DOM.getContentQuads': new Error('Could not find node with given id'),
  });
  assert.deepEqual(await clickControl(gone.cdp, 7), {
    ok: false,
    reason: 'gone',
  });
});

test('a link address is read from the page, in full, or null when there is none', async () => {
  const run = async (value: unknown) => {
    const page = fakePage({
      'Page.getFrameTree': { frameTree: { frame: { id: 'f' } } },
      'Page.createIsolatedWorld': { executionContextId: 5 },
      'DOM.resolveNode': { object: { objectId: 'obj' } },
      'Runtime.callFunctionOn': { result: { value } },
    });
    return readLinkAddress(page.cdp, 7);
  };
  assert.equal(
    await run('https://a.example/p?id=5'),
    'https://a.example/p?id=5',
  );
  assert.equal(await run(''), null);
  assert.equal(await run(undefined), null);
  assert.equal(await run({ baseVal: 'svg' }), null);
  // A page that cannot be asked gives null, never an error.
  const broken = fakePage({ 'DOM.enable': new Error('boom') });
  assert.equal(await readLinkAddress(broken.cdp, 7), null);
});
