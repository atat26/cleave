// Doing things in a page through the browser's debugging protocol: click, type,
// press a key, scroll, choose from a dropdown. These are the "hands". The rules
// about WHEN they may be used are in agentActions.ts; this file only does them,
// and adds the last safety checks that need the real page:
//
//   - a control that is covered by something else (so a click would land on the
//     wrong thing) is not clicked
//   - password, card and code fields are re-checked here from the page itself,
//     not only from the earlier list, and are never typed into
//   - only plain text fields can be typed in
//
// It takes a tiny `Cdp` object (send a command, get the answer), not Electron, so
// it can be tested with a fake page. Everything the page sends back is untrusted
// and is only ever checked for shape.
import { looksSensitive } from './pageOutline.ts';

export interface Cdp {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export type DoneResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'gone'
        | 'sensitive'
        | 'not-editable'
        | 'no-option'
        | 'blocked'
        | 'unavailable';
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// The browser says an element is no longer there in a few ways.
const isGone = (error: unknown) =>
  error instanceof Error &&
  /no node|could not find node|node with given id|not found|detached/i.test(
    error.message,
  );

// Run an action, turning the browser's complaints into plain reasons.
async function guarded(work: () => Promise<DoneResult>): Promise<DoneResult> {
  try {
    return await work();
  } catch (error) {
    return { ok: false, reason: isGone(error) ? 'gone' : 'unavailable' };
  }
}

// ---- Looking at an element -------------------------------------------------------------------

interface ElementFacts {
  tag: string;
  attributes: Record<string, string>;
}

async function factsAbout(
  cdp: Cdp,
  backendNodeId: number,
): Promise<ElementFacts> {
  const described = await cdp.send('DOM.describeNode', { backendNodeId });
  const node =
    isRecord(described) && isRecord(described.node) ? described.node : {};
  const attributes: Record<string, string> = {};
  if (Array.isArray(node.attributes)) {
    for (let i = 0; i + 1 < node.attributes.length; i += 2) {
      const key = node.attributes[i];
      const value = node.attributes[i + 1];
      if (typeof key === 'string' && typeof value === 'string') {
        attributes[key.toLowerCase()] = value;
      }
    }
  }
  return {
    tag: typeof node.nodeName === 'string' ? node.nodeName.toUpperCase() : '',
    attributes,
  };
}

// Input types that are not text boxes.
const NOT_TEXT_INPUT = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

// Can text be typed into this, and would it be a sensitive field?
export function judgeField(facts: ElementFacts): {
  editable: boolean;
  sensitive: boolean;
} {
  const type = (facts.attributes.type ?? 'text').toLowerCase();
  const editable =
    (facts.tag === 'INPUT' && !NOT_TEXT_INPUT.has(type)) ||
    facts.tag === 'TEXTAREA' ||
    (facts.attributes.contenteditable !== undefined &&
      facts.attributes.contenteditable.toLowerCase() !== 'false');
  const sensitive = looksSensitive({
    inputType: facts.tag === 'INPUT' ? type : '',
    autocomplete: facts.attributes.autocomplete,
    name: [
      facts.attributes['aria-label'],
      facts.attributes.name,
      facts.attributes.id,
      facts.attributes.placeholder,
    ]
      .filter(Boolean)
      .join(' '),
  });
  return { editable, sensitive };
}

// Which of these elements are password, card or code fields? The accessibility
// tree does not say (it hides the input type), so ask the page itself. Anything
// that fails to answer is simply not in the result.
export async function findSensitiveFields(
  cdp: Cdp,
  backendNodeIds: number[],
): Promise<Set<number>> {
  const found = new Set<number>();
  try {
    await cdp.send('DOM.enable');
  } catch {
    return found;
  }
  for (const id of backendNodeIds.slice(0, 150)) {
    try {
      if (judgeField(await factsAbout(cdp, id)).sensitive) found.add(id);
    } catch {
      // Gone or unreadable: leave it out.
    }
  }
  return found;
}

// ---- Finding where an element is ---------------------------------------------------------------

// The middle of the first visible box of an element, or null.
async function centerOf(
  cdp: Cdp,
  backendNodeId: number,
): Promise<{ x: number; y: number } | null> {
  const answer = await cdp.send('DOM.getContentQuads', { backendNodeId });
  const quads =
    isRecord(answer) && Array.isArray(answer.quads) ? answer.quads : [];
  for (const quad of quads) {
    if (!Array.isArray(quad) || quad.length < 8) continue;
    const nums = quad.slice(0, 8);
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n)))
      continue;
    const xs = [nums[0], nums[2], nums[4], nums[6]] as number[];
    const ys = [nums[1], nums[3], nums[5], nums[7]] as number[];
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    if (width < 1 || height < 1) continue;
    return {
      x: xs.reduce((a, b) => a + b, 0) / 4,
      y: ys.reduce((a, b) => a + b, 0) / 4,
    };
  }
  return null;
}

// A separate JavaScript space in the page (the page's own scripts cannot reach or
// change it), used for the few checks that need to run a little code.
async function isolatedWorld(cdp: Cdp): Promise<number> {
  const tree = await cdp.send('Page.getFrameTree');
  const frameId =
    isRecord(tree) && isRecord(tree.frameTree) && isRecord(tree.frameTree.frame)
      ? tree.frameTree.frame.id
      : undefined;
  if (typeof frameId !== 'string') throw new Error('no frame');
  const world = await cdp.send('Page.createIsolatedWorld', {
    frameId,
    worldName: 'ai-browser-actions',
  });
  const id = isRecord(world) ? world.executionContextId : undefined;
  if (typeof id !== 'number') throw new Error('no world');
  return id;
}

async function objectFor(
  cdp: Cdp,
  backendNodeId: number,
  executionContextId: number,
): Promise<string> {
  const resolved = await cdp.send('DOM.resolveNode', {
    backendNodeId,
    executionContextId,
  });
  const object =
    isRecord(resolved) && isRecord(resolved.object) ? resolved.object : {};
  if (typeof object.objectId !== 'string') throw new Error('no node');
  return object.objectId;
}

// Is the thing at this spot the control itself (or inside it)? If something else
// covers it, a click would land on that instead of what you approved.
async function reachable(
  cdp: Cdp,
  backendNodeId: number,
  point: { x: number; y: number },
): Promise<boolean> {
  const hit = await cdp.send('DOM.getNodeForLocation', {
    x: Math.round(point.x),
    y: Math.round(point.y),
    includeUserAgentShadowDOM: false,
  });
  const hitId =
    isRecord(hit) && typeof hit.backendNodeId === 'number'
      ? hit.backendNodeId
      : null;
  if (hitId === null) return false;
  if (hitId === backendNodeId) return true;
  const context = await isolatedWorld(cdp);
  const target = await objectFor(cdp, backendNodeId, context);
  const other = await objectFor(cdp, hitId, context);
  const answer = await cdp.send('Runtime.callFunctionOn', {
    objectId: target,
    functionDeclaration:
      'function (other) { return this === other || this.contains(other); }',
    arguments: [{ objectId: other }],
    returnByValue: true,
  });
  return (
    isRecord(answer) && isRecord(answer.result) && answer.result.value === true
  );
}

// ---- The actions ---------------------------------------------------------------------------------

export function clickControl(
  cdp: Cdp,
  backendNodeId: number,
): Promise<DoneResult> {
  return guarded(async () => {
    await cdp.send('DOM.enable');
    await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId });
    const point = await centerOf(cdp, backendNodeId);
    if (!point) return { ok: false, reason: 'gone' };
    if (!(await reachable(cdp, backendNodeId, point))) {
      return { ok: false, reason: 'blocked' };
    }
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    return { ok: true };
  });
}

export function typeIntoControl(
  cdp: Cdp,
  backendNodeId: number,
  text: string,
): Promise<DoneResult> {
  return guarded(async () => {
    await cdp.send('DOM.enable');
    const field = judgeField(await factsAbout(cdp, backendNodeId));
    // Checked again from the page itself, whatever the earlier list said.
    if (field.sensitive) return { ok: false, reason: 'sensitive' };
    if (!field.editable) return { ok: false, reason: 'not-editable' };
    await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId });
    await cdp.send('DOM.focus', { backendNodeId });
    // Select what is there (so it is replaced), then type.
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      modifiers: 2,
      commands: ['selectAll'],
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      modifiers: 2,
    });
    if (text === '') {
      await pressKey(cdp, 'Backspace');
    } else {
      await cdp.send('Input.insertText', { text });
    }
    return { ok: true };
  });
}

const KEYS: Record<
  string,
  { code: string; windowsVirtualKeyCode: number; text?: string }
> = {
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Backspace: { code: 'Backspace', windowsVirtualKeyCode: 8 },
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
  PageUp: { code: 'PageUp', windowsVirtualKeyCode: 33 },
  PageDown: { code: 'PageDown', windowsVirtualKeyCode: 34 },
  End: { code: 'End', windowsVirtualKeyCode: 35 },
  Home: { code: 'Home', windowsVirtualKeyCode: 36 },
  ArrowLeft: { code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowUp: { code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowRight: { code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40 },
};

export function pressKey(cdp: Cdp, key: string): Promise<DoneResult> {
  return guarded(async () => {
    const info = KEYS[key];
    if (!info) return { ok: false, reason: 'blocked' };
    await cdp.send('Input.dispatchKeyEvent', {
      type: info.text ? 'keyDown' : 'rawKeyDown',
      key,
      code: info.code,
      windowsVirtualKeyCode: info.windowsVirtualKeyCode,
      ...(info.text ? { text: info.text } : {}),
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: info.code,
      windowsVirtualKeyCode: info.windowsVirtualKeyCode,
    });
    return { ok: true };
  });
}

export function scrollPage(
  cdp: Cdp,
  direction: 'up' | 'down',
): Promise<DoneResult> {
  return guarded(async () => {
    const metrics = await cdp.send('Page.getLayoutMetrics');
    const viewport =
      isRecord(metrics) && isRecord(metrics.cssVisualViewport)
        ? metrics.cssVisualViewport
        : {};
    const width =
      typeof viewport.clientWidth === 'number' ? viewport.clientWidth : 800;
    const height =
      typeof viewport.clientHeight === 'number' ? viewport.clientHeight : 600;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      deltaX: 0,
      deltaY: Math.round(height * 0.8) * (direction === 'up' ? -1 : 1),
    });
    return { ok: true };
  });
}

export function chooseOption(
  cdp: Cdp,
  backendNodeId: number,
  option: string,
): Promise<DoneResult> {
  return guarded(async () => {
    await cdp.send('DOM.enable');
    const context = await isolatedWorld(cdp);
    const objectId = await objectFor(cdp, backendNodeId, context);
    const answer = await cdp.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function (wanted) {
        if (!this || this.tagName !== 'SELECT') return 'not-select';
        const options = Array.from(this.options);
        const lower = wanted.trim().toLowerCase();
        const index = options.findIndex(
          (o) => !o.disabled && o.text.trim().toLowerCase() === lower,
        );
        if (index < 0) return 'no-option';
        this.selectedIndex = index;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
      }`,
      arguments: [{ value: option }],
      returnByValue: true,
    });
    const value =
      isRecord(answer) && isRecord(answer.result)
        ? answer.result.value
        : undefined;
    if (value === 'ok') return { ok: true };
    return {
      ok: false,
      reason: value === 'no-option' ? 'no-option' : 'not-editable',
    };
  });
}
