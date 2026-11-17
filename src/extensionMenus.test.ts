import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertExtensionMenu, tidy } from './extensionMenus.ts';
import type { ExtensionMenuNode } from './extensionMenus.ts';
import { menuIds } from './menuTypes.ts';

const run = (nodes: ExtensionMenuNode[]) => {
  const clickable: ExtensionMenuNode[] = [];
  const items = convertExtensionMenu(nodes, (node) => {
    clickable.push(node);
    return `ext:${clickable.length - 1}`;
  });
  return { items, clickable };
};

test('plain rows become rows with an id each, and the id leads back to the node', () => {
  const a: ExtensionMenuNode = { type: 'normal', label: 'Auto-fill' };
  const b: ExtensionMenuNode = {
    type: 'checkbox',
    label: ' Copy   username ',
    checked: true,
  };
  const { items, clickable } = run([a, { type: 'separator' }, b]);
  assert.deepEqual(menuIds(items), ['ext:0', 'ext:1']);
  assert.equal(clickable[0], a);
  assert.equal(clickable[1], b);
  const second = items.find((i) => i.type === 'item' && i.id === 'ext:1');
  assert.equal(second?.type === 'item' && second.label, 'Copy username');
  assert.equal(second?.type === 'item' && second.checked, true);
});

test('hidden, unnamed and empty-group items are left out; disabled ones are greyed', () => {
  const { items } = run([
    { label: 'Hidden', visible: false },
    { label: '   ' },
    { label: 'Group', submenu: { items: [] } },
    { label: 'Off', enabled: false },
  ]);
  assert.deepEqual(menuIds(items), ['ext:0']);
  const row = items[0];
  assert.equal(row.type === 'item' && row.disabled, true);
});

test('a group becomes a submenu; its rows still lead back to their nodes', () => {
  const inner: ExtensionMenuNode = { label: 'Copy password' };
  const { items, clickable } = run([
    { label: 'Bitwarden', submenu: { items: [inner, { type: 'separator' }] } },
  ]);
  const group = items[0];
  assert.equal(group.type === 'item' && group.submenu?.length, 1);
  assert.deepEqual(
    menuIds(items).filter((id) => id.startsWith('ext:')),
    ['ext:0'],
  );
  assert.equal(clickable[0], inner);
});

test('separators are tidied: none first, last, or doubled', () => {
  const sep = { type: 'separator' } as const;
  const row = (id: string) => ({ type: 'item', id, label: id }) as const;
  assert.deepEqual(tidy([sep, row('a'), sep, sep, row('b'), sep]), [
    row('a'),
    sep,
    row('b'),
  ]);
  assert.deepEqual(tidy([sep, sep]), []);
});

test('a huge or deeply nested menu is cut short', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ label: `Item ${i}` }));
  assert.ok(menuIds(run(many).items).length <= 60);
  let deep: ExtensionMenuNode = { label: 'leaf' };
  for (let i = 0; i < 10; i++)
    deep = { label: `level ${i}`, submenu: { items: [deep] } };
  assert.doesNotThrow(() => run([deep]));
});
