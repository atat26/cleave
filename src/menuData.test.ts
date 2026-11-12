import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTabChoice, tabMenuItems } from './menuData.ts';
import { isChoosable, menuIds } from './menuTypes.ts';
import type { MenuEntry, MenuItem } from './menuTypes.ts';
import { addSpace, addTab, closeTab, defaultState } from './model.ts';

const entry = (items: MenuItem[], id: string): MenuEntry => {
  const found = items.find(
    (item): item is MenuEntry => item.type === 'item' && item.id === id,
  );
  assert.ok(found, `no item ${id}`);
  return found;
};

function build() {
  let state = defaultState();
  const free = addTab(state, { url: 'https://free.example' });
  state = free.state;
  const other = addTab(state, { url: 'https://other.example' });
  state = other.state;
  const work = addSpace(state, 'Work');
  state = work.state;
  const home = addSpace(state, 'Home');
  state = home.state;
  const a = addTab(state, { url: 'https://a.example', spaceId: work.id });
  state = a.state;
  return {
    state,
    freeId: free.id,
    otherId: other.id,
    workId: work.id,
    homeId: home.id,
    aId: a.id,
  };
}

test('there is no menu for a tab that does not exist', () => {
  assert.equal(tabMenuItems(defaultState(), 5), null);
});

test('the menu of a tab outside any Space: other Spaces to move to, no delete', () => {
  const { state, freeId, workId, homeId } = build();
  const items = tabMenuItems(state, freeId)!;
  assert.equal(entry(items, 'tab.close').label, 'Close tab');
  assert.ok(!items.some((i) => i.type === 'item' && i.id === 'tab.delete'));
  const move = entry(items, 'tab.move').submenu!;
  assert.deepEqual(
    move.filter((i) => i.type === 'item').map((i) => (i as MenuEntry).id),
    [`tab.move:${workId}`, `tab.move:${homeId}`, 'tab.move-new-space'],
  );
  // It is not in a Space, so there is no "No Space" to move to.
  assert.ok(!menuIds(items).includes('tab.move:none'));
});

test('the menu of a tab in a Space: keeps it on close, can delete, can leave the Space', () => {
  const { state, aId, workId, homeId } = build();
  const items = tabMenuItems(state, aId)!;
  assert.equal(entry(items, 'tab.close').label, 'Close tab (keep in Space)');
  assert.equal(entry(items, 'tab.close').shortcut, 'Ctrl+W');
  assert.equal(entry(items, 'tab.delete').danger, true);
  const ids = menuIds(items);
  assert.ok(ids.includes('tab.move:none'));
  assert.ok(ids.includes(`tab.move:${homeId}`));
  // Its own Space is not offered as a place to move to.
  assert.ok(!ids.includes(`tab.move:${workId}`));
});

test('some items are greyed out when they cannot do anything', () => {
  const { state, aId, freeId } = build();
  // The only open tab in its Space: nothing else to close.
  assert.equal(
    entry(tabMenuItems(state, aId)!, 'tab.close-others').disabled,
    true,
  );
  // Two tabs outside Spaces: there is another to close.
  assert.notEqual(
    entry(tabMenuItems(state, freeId)!, 'tab.close-others').disabled,
    true,
  );
  // A closed link: nothing to reload or close.
  const closed = closeTab(state, aId);
  const items = tabMenuItems(closed, aId)!;
  assert.equal(entry(items, 'tab.reload').disabled, true);
  assert.equal(entry(items, 'tab.close').disabled, true);
});

test('every id in the tab menu is unique, and every choosable one is understood', () => {
  const { state, aId, freeId } = build();
  for (const tabId of [aId, freeId]) {
    const items = tabMenuItems(state, tabId)!;
    const ids = menuIds(items);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      if (id === 'tab.move') continue; // The submenu's parent is not choosable.
      assert.ok(parseTabChoice(id), id);
      assert.equal(isChoosable(items, id), !entry2(items, id)?.disabled, id);
    }
  }
});

const entry2 = (items: MenuItem[], id: string): MenuEntry | undefined => {
  for (const item of items) {
    if (item.type !== 'item') continue;
    if (item.id === id) return item;
    const inside = item.submenu ? entry2(item.submenu, id) : undefined;
    if (inside) return inside;
  }
  return undefined;
};

test('a chosen id is read back into what to do, and anything else is not understood', () => {
  assert.deepEqual(parseTabChoice('tab.move:12'), {
    action: 'move',
    spaceId: 12,
  });
  assert.deepEqual(parseTabChoice('tab.move:none'), {
    action: 'move',
    spaceId: null,
  });
  assert.deepEqual(parseTabChoice('tab.delete'), { action: 'delete' });
  for (const id of [
    '',
    'tab.move',
    'tab.move:x',
    'tab.move:-1',
    'space.rename',
    'tab.nope',
  ]) {
    assert.equal(parseTabChoice(id), null, id);
  }
});

test('only an enabled item of the open menu can be chosen', () => {
  const items: MenuItem[] = [
    { type: 'header', label: 'Group' },
    { type: 'item', id: 'a', label: 'A' },
    { type: 'item', id: 'b', label: 'B', disabled: true },
    {
      type: 'item',
      id: 'c',
      label: 'C',
      submenu: [{ type: 'item', id: 'c1', label: 'C1' }],
    },
    { type: 'separator' },
  ];
  assert.equal(isChoosable(items, 'a'), true);
  assert.equal(isChoosable(items, 'c1'), true); // inside a submenu
  assert.equal(isChoosable(items, 'b'), false); // disabled
  assert.equal(isChoosable(items, 'c'), false); // opens a submenu, not chosen itself
  assert.equal(isChoosable(items, 'zzz'), false);
  assert.equal(isChoosable(items, 7), false);
  assert.equal(isChoosable(items, undefined), false);
  assert.deepEqual(menuIds(items), ['a', 'b', 'c', 'c1']);
});
