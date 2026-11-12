import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addMenuItems,
  artifactMenuItems,
  chatRowMenuItems,
  chatSwitchMenuItems,
  editMenuItems,
  linkMenuItems,
  messageMenuItems,
  modelMenuItems,
  parseAddChoice,
  parseArtifactChoice,
  parseChatChoice,
  parseEditChoice,
  parseLinkChoice,
  parseMessageChoice,
  parseModelChoice,
  parseSpaceChoice,
  parseTabChoice,
  spaceMenuItems,
  tabMenuItems,
} from './menuData.ts';
import {
  defaultChats,
  newConversation,
  renameConversation,
  setActiveConversation,
} from './chats.ts';
import { isChoosable, menuIds } from './menuTypes.ts';
import type { MenuEntry, MenuItem } from './menuTypes.ts';
import { createArtifact, defaultArtifacts } from './artifacts.ts';
import type { Workspace } from './chatLinks.ts';
import {
  addSpace,
  addTab,
  closeTab,
  defaultState,
  openArtifactTab,
} from './model.ts';

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

// ---- Space, chat and model menus ---------------------------------------------

test('the Space menu: a ticked colour, collapse or expand, and a delete that says what it takes', () => {
  const { state, workId, aId } = build();
  const items = spaceMenuItems(state, workId)!;
  const colour = entry(items, 'space.color').submenu!;
  const ticked = colour.filter((i) => i.type === 'item' && i.checked);
  assert.equal(ticked.length, 1);
  // Every colour shows its own colour, and so does the Colour item itself.
  assert.ok(
    colour.every(
      (i) => i.type === 'item' && /^#[0-9a-f]{6}$/i.test(i.swatch ?? ''),
    ),
  );
  assert.ok(entry(items, 'space.color').swatch);
  assert.equal(entry(items, 'space.toggle-collapse').label, 'Collapse');
  assert.match(
    entry(items, 'space.delete').label,
    /Delete Space and its 1 tab/,
  );
  assert.equal(entry(items, 'space.delete').danger, true);
  assert.notEqual(entry(items, 'space.close-all').disabled, true);
  // An empty Space has nothing to close and nothing to lose.
  const { state: s2, homeId } = build();
  const empty = spaceMenuItems(s2, homeId)!;
  assert.equal(entry(empty, 'space.close-all').disabled, true);
  assert.equal(entry(empty, 'space.delete').label, 'Delete Space');
  // Once its only tab is a closed link there is nothing open to close.
  assert.equal(
    entry(spaceMenuItems(closeTab(state, aId), workId)!, 'space.close-all')
      .disabled,
    true,
  );
  assert.equal(spaceMenuItems(state, 99999), null);
});

test('Space menu ids are unique and understood, anything else is not', () => {
  const { state, workId } = build();
  const items = spaceMenuItems(state, workId)!;
  const ids = menuIds(items);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    if (id === 'space.color') continue; // The submenu's parent.
    assert.ok(parseSpaceChoice(id), id);
  }
  assert.deepEqual(parseSpaceChoice('space.color:red'), {
    action: 'color',
    color: 'red',
  });
  for (const id of [
    '',
    'space.color',
    'space.color:chartreuse',
    'space.color:RED',
    'tab.close',
  ]) {
    assert.equal(parseSpaceChoice(id), null, id);
  }
});

test('the chat-name menu lists chats newest first, ticks the open one, and acts on it', () => {
  let chats = defaultChats(1000);
  const firstId = chats.activeId;
  chats = renameConversation(chats, firstId, 'First');
  const second = newConversation(chats);
  chats = renameConversation(second.state, second.state.activeId, 'Second');
  const items = chatSwitchMenuItems(chats);
  const titles = items
    .filter((i) => i.type === 'item')
    .map((i) => (i as MenuEntry).label);
  assert.deepEqual(titles.slice(0, 2), ['Second', 'First']);
  const activeId = chats.activeId;
  assert.equal(entry(items, `chat.select:${activeId}`).icon, 'check');
  assert.equal(entry(items, `chat.select:${firstId}`).icon, undefined);
  assert.equal(entry(items, `chat.delete:${activeId}`).danger, true);
  // Rename and delete act on the open chat, even after switching.
  const switched = chatSwitchMenuItems(setActiveConversation(chats, firstId));
  assert.ok(menuIds(switched).includes(`chat.rename:${firstId}`));
});

test('the chat row menu and chat ids', () => {
  const chats = defaultChats(1000);
  const id = chats.activeId;
  const items = chatRowMenuItems(chats, id)!;
  assert.deepEqual(menuIds(items), [
    `chat.select:${id}`,
    `chat.rename:${id}`,
    `chat.delete:${id}`,
  ]);
  assert.equal(chatRowMenuItems(chats, 99999), null);
  assert.deepEqual(parseChatChoice('chat.new'), { action: 'new' });
  assert.deepEqual(parseChatChoice('chat.rename:7'), {
    action: 'rename',
    chatId: 7,
  });
  assert.deepEqual(parseChatChoice('chat.delete:7'), {
    action: 'delete',
    chatId: 7,
  });
  for (const bad of [
    '',
    'chat.select',
    'chat.select:x',
    'chat.nope:1',
    'chat.delete:-1',
  ]) {
    assert.equal(parseChatChoice(bad), null, bad);
  }
});

test('the model menu shows pinned models with the current one ticked, even if it is not pinned', () => {
  const items = modelMenuItems(['a/one', 'b/two'], 'b/two');
  assert.equal(entry(items, 'model.pick:b/two').icon, 'check');
  assert.equal(entry(items, 'model.pick:a/one').icon, undefined);
  const unpinned = modelMenuItems(['a/one'], 'z/other');
  const first = unpinned.find((i) => i.type === 'item') as MenuEntry;
  assert.equal(first.id, 'model.pick:z/other');
  assert.equal(first.icon, 'check');
  // With nothing pinned there is just the link to Settings.
  assert.deepEqual(menuIds(modelMenuItems([], null)), ['model.settings']);
  assert.deepEqual(parseModelChoice('model.pick:openrouter/free'), {
    action: 'pick',
    model: 'openrouter/free',
  });
  assert.deepEqual(parseModelChoice('model.settings'), { action: 'settings' });
  for (const bad of ['', 'model.pick:', 'model.pick', 'model.other']) {
    assert.equal(parseModelChoice(bad), null, bad);
  }
});

// ---- Artifact, add, link, message and edit menus -----------------------------

function withArtifacts() {
  const base = build();
  let artifacts = defaultArtifacts();
  const made = (title: string, spaceId: number | null) => {
    const result = createArtifact(
      artifacts,
      { kind: 'markdown', title, spaceId },
      1,
    );
    assert.ok(result.ok);
    artifacts = result.state;
    return result.artifact.id;
  };
  const inWork = made('Notes', base.workId);
  const loose = made('Loose', null);
  const inHome = made('Plan', base.homeId);
  return { ...base, artifacts, inWork, loose, inHome };
}

test('the artifact menu: close only when open, take out only in a Space, own Space not offered', () => {
  const { state, artifacts, inWork, loose, workId, homeId } = withArtifacts();
  const closed = artifactMenuItems(state, artifacts, inWork)!;
  assert.equal(entry(closed, 'artifact.close').disabled, true);
  assert.ok(menuIds(closed).includes('artifact.take-out'));
  assert.equal(entry(closed, 'artifact.delete').danger, true);
  const ids = menuIds(closed);
  assert.ok(ids.includes(`artifact.move:${homeId}`));
  assert.ok(!ids.includes(`artifact.move:${workId}`));
  // Open: it can be closed. Outside any Space: nothing to take out.
  const open = openArtifactTab(state, inWork, workId);
  assert.notEqual(
    entry(artifactMenuItems(open, artifacts, inWork)!, 'artifact.close')
      .disabled,
    true,
  );
  assert.ok(
    !menuIds(artifactMenuItems(state, artifacts, loose)!).includes(
      'artifact.take-out',
    ),
  );
  assert.equal(artifactMenuItems(state, artifacts, 99999), null);
});

test('artifact menu ids are unique and understood', () => {
  const { state, artifacts, inWork } = withArtifacts();
  const items = artifactMenuItems(state, artifacts, inWork)!;
  const ids = menuIds(items);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    if (id === 'artifact.move') continue;
    assert.ok(parseArtifactChoice(id), id);
  }
  assert.deepEqual(parseArtifactChoice('artifact.move:4'), {
    action: 'move',
    spaceId: 4,
  });
  for (const bad of [
    '',
    'artifact.move',
    'artifact.move:x',
    'artifact.nope',
    'tab.close',
  ]) {
    assert.equal(parseArtifactChoice(bad), null, bad);
  }
});

test('the overview Add menu: a new page, artifact kinds, and artifacts from other Spaces', () => {
  const { state, artifacts, workId, inWork, loose, inHome } = withArtifacts();
  const items = addMenuItems(state, artifacts, workId)!;
  const kinds = entry(items, 'add.artifact').submenu!.map(
    (i) => (i as MenuEntry).id,
  );
  assert.deepEqual(kinds, [
    'add.artifact:markdown',
    'add.artifact:text',
    'add.artifact:html',
    'add.artifact:code',
  ]);
  const existing = entry(items, 'add.existing');
  assert.notEqual(existing.disabled, true);
  const picks = existing.submenu!.map((i) => (i as MenuEntry).id);
  // Artifacts already in this Space are not offered.
  assert.deepEqual(
    picks.sort(),
    [`add.pick:${loose}`, `add.pick:${inHome}`].sort(),
  );
  assert.ok(!picks.includes(`add.pick:${inWork}`));
  const first = existing.submenu![0] as MenuEntry;
  assert.deepEqual(
    first.submenu!.map((i) => (i as MenuEntry).id),
    [first.id.replace('pick', 'move'), first.id.replace('pick', 'copy')],
  );
  assert.equal(addMenuItems(state, artifacts, 99999), null);
  // With nothing elsewhere, the entry is greyed out.
  const alone = createArtifact(
    defaultArtifacts(),
    { kind: 'text', spaceId: workId },
    1,
  );
  assert.ok(alone.ok);
  assert.equal(
    entry(addMenuItems(state, alone.state, workId)!, 'add.existing').disabled,
    true,
  );
});

test('Add menu choices are read back, and bad ones are not understood', () => {
  assert.deepEqual(parseAddChoice('add.page'), { action: 'page' });
  assert.deepEqual(parseAddChoice('add.artifact:html'), {
    action: 'new-artifact',
    kind: 'html',
  });
  assert.deepEqual(parseAddChoice('add.move:7'), {
    action: 'move',
    artifactId: 7,
  });
  assert.deepEqual(parseAddChoice('add.copy:7'), {
    action: 'copy',
    artifactId: 7,
  });
  for (const bad of [
    '',
    'add.artifact',
    'add.artifact:pdf',
    'add.move:x',
    'add.pick:3',
    'add.copy:',
  ]) {
    assert.equal(parseAddChoice(bad), null, bad);
  }
});

const linkWorkspace: Workspace = {
  spaces: [{ id: 10, name: 'Work' }],
  tabs: [
    { id: 1, title: 'Open page', url: 'https://a.example/', spaceId: 10 },
    {
      id: 2,
      title: 'Kept page',
      url: 'https://b.example/',
      spaceId: 10,
      closed: true,
    },
  ],
  artifacts: [{ id: 5, title: 'Notes', kind: 'markdown', spaceId: null }],
};
const ref = (
  kind: 'tab' | 'space' | 'artifact',
  id: number,
  url: string | null = null,
) => ({
  kind,
  id,
  title: 'Old',
  url,
});

test('the link menu: open, reopen a page that is gone, show in Space, remove only on a chip', () => {
  const open = linkMenuItems(ref('tab', 1), linkWorkspace, true);
  assert.deepEqual(menuIds(open), [
    'link.open',
    'link.show-in-space',
    'link.remove',
  ]);
  assert.notEqual(entry(open, 'link.show-in-space').disabled, true);
  // A page gone for good, with its address remembered, can be reopened (not opened).
  const gone = linkMenuItems(
    ref('tab', 9, 'https://old.example/'),
    linkWorkspace,
    true,
  );
  assert.equal(entry(gone, 'link.open').disabled, true);
  assert.ok(menuIds(gone).includes('link.reopen'));
  assert.equal(entry(gone, 'link.show-in-space').disabled, true);
  // A kept (closed) page still counts as there: it opens, and is not "reopened".
  assert.ok(
    !menuIds(linkMenuItems(ref('tab', 2), linkWorkspace, true)).includes(
      'link.reopen',
    ),
  );
  // An artifact outside any Space has nowhere to show; a Space has no such item.
  assert.equal(
    entry(
      linkMenuItems(ref('artifact', 5), linkWorkspace, true),
      'link.show-in-space',
    ).disabled,
    true,
  );
  assert.ok(
    !menuIds(linkMenuItems(ref('space', 10), linkWorkspace, true)).includes(
      'link.show-in-space',
    ),
  );
  // A token in a sent message cannot be removed from the chat.
  assert.ok(
    !menuIds(linkMenuItems(ref('tab', 1), linkWorkspace, false)).includes(
      'link.remove',
    ),
  );
  assert.deepEqual(parseLinkChoice('link.remove'), { action: 'remove' });
  assert.equal(parseLinkChoice('link.nope'), null);
});

test('the message menu: copy for all, retry only the newest of yours, branch only older ones', () => {
  const assistant = messageMenuItems({
    role: 'assistant',
    hasSelection: false,
    isNewestUser: false,
    busy: false,
  });
  assert.deepEqual(menuIds(assistant), ['msg.copy']);
  assert.equal(entry(assistant, 'msg.copy').label, 'Copy message');
  assert.equal(
    entry(
      messageMenuItems({
        role: 'assistant',
        hasSelection: true,
        isNewestUser: false,
        busy: false,
      }),
      'msg.copy',
    ).label,
    'Copy selection',
  );
  const newest = messageMenuItems({
    role: 'user',
    hasSelection: false,
    isNewestUser: true,
    busy: false,
  });
  assert.notEqual(entry(newest, 'msg.retry').disabled, true);
  assert.equal(entry(newest, 'msg.branch').disabled, true);
  const older = messageMenuItems({
    role: 'user',
    hasSelection: false,
    isNewestUser: false,
    busy: false,
  });
  assert.equal(entry(older, 'msg.retry').disabled, true);
  assert.notEqual(entry(older, 'msg.branch').disabled, true);
  // Not while a reply is being written.
  assert.equal(
    entry(
      messageMenuItems({
        role: 'user',
        hasSelection: false,
        isNewestUser: true,
        busy: true,
      }),
      'msg.retry',
    ).disabled,
    true,
  );
  assert.deepEqual(parseMessageChoice('msg.branch'), { action: 'branch' });
  assert.equal(parseMessageChoice('msg.x'), null);
});

test('the editing menu: cut and copy need a selection, paste needs something to paste, paste and go only for the address bar', () => {
  const none = editMenuItems({
    hasSelection: false,
    canPaste: false,
    pasteAndGo: false,
  });
  assert.equal(entry(none, 'edit.cut').disabled, true);
  assert.equal(entry(none, 'edit.copy').disabled, true);
  assert.equal(entry(none, 'edit.paste').disabled, true);
  assert.ok(!menuIds(none).includes('edit.paste-and-go'));
  assert.notEqual(entry(none, 'edit.select-all').disabled, true);
  const all = editMenuItems({
    hasSelection: true,
    canPaste: true,
    pasteAndGo: true,
  });
  assert.notEqual(entry(all, 'edit.cut').disabled, true);
  assert.notEqual(entry(all, 'edit.paste-and-go').disabled, true);
  for (const id of menuIds(all)) assert.ok(parseEditChoice(id), id);
  assert.equal(parseEditChoice('edit.nope'), null);
});
