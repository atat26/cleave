import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addMenuItems,
  artifactMenuItems,
  chatRowMenuItems,
  chatSwitchMenuItems,
  emojiPickerItems,
  editMenuItems,
  linkMenuItems,
  messageMenuItems,
  modelMenuItems,
  pageImageMenuItems,
  pageLinkMenuItems,
  pageMenuItems,
  pageSelectionMenuItems,
  parseAddChoice,
  parsePageChoice,
  parseArtifactChoice,
  parseChatChoice,
  parseEditChoice,
  parseEmojiChoice,
  parseToolsChoice,
  toolsMenuItems,
  downloadMenuItems,
  addExtensionMenuItems,
  extensionMenuItems,
  libraryMenuItems,
  parseDownloadChoice,
  parsePermissionChoice,
  parsePopupChoice,
  blockedPopupItems,
  parsePrivacyChoice,
  privacyDataMenuItems,
  privacySiteMenuItems,
  parseSiteChoice,
  siteMenuItems,
  permissionPromptItems,
  parseStarChoice,
  starMenuItems,
  parseAddExtensionChoice,
  parseExtensionChoice,
  parsePuzzleChoice,
  puzzleMenuItems,
  parseLibraryChoice,
  zoomChipMenuItems,
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
  moveTab,
  defaultState,
  openArtifactTab,
  setSpaceEmoji,
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
  // New chat, Rename, Change icon and Delete chat come first, then the chats,
  // newest first.
  const labels = items
    .filter((i) => i.type === 'item')
    .map((i) => (i as MenuEntry).label);
  assert.deepEqual(labels.slice(0, 7), [
    'New chat',
    'Rename',
    'Change icon…',
    'Name with AI',
    'Export as Markdown…',
    'Search chats…',
    'Delete chat',
  ]);
  assert.deepEqual(labels.slice(7), ['Second', 'First']);
  const activeId = chats.activeId;
  assert.equal(entry(items, `chat.select:${activeId}`).checked, true);
  assert.equal(entry(items, `chat.select:${firstId}`).checked, false);
  // Each chat shows its picture (the default until it is given one).
  assert.equal(entry(items, `chat.select:${activeId}`).emoji, '💬');
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
    `chat.icon:${id}`,
    `chat.name-ai:${id}`,
    `chat.export:${id}`,
    `chat.delete:${id}`,
  ]);
  assert.deepEqual(parseChatChoice('chat.export:7'), {
    action: 'export',
    chatId: 7,
  });
  assert.deepEqual(parseChatChoice('chat.search'), { action: 'search' });
  assert.equal(chatRowMenuItems(chats, 99999), null);
  assert.deepEqual(parseChatChoice('chat.new'), { action: 'new' });
  assert.deepEqual(parseChatChoice('chat.rename:7'), {
    action: 'rename',
    chatId: 7,
  });
  assert.deepEqual(parseChatChoice('chat.icon:7'), {
    action: 'icon',
    chatId: 7,
  });
  assert.deepEqual(parseChatChoice('chat.name-ai:7'), {
    action: 'name-ai',
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

test('the message menu: copy for all, retry only the newest of yours, branch for any of yours', () => {
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
  assert.notEqual(entry(newest, 'msg.branch').disabled, true);
  assert.notEqual(entry(newest, 'msg.edit').disabled, true);
  const older = messageMenuItems({
    role: 'user',
    hasSelection: false,
    isNewestUser: false,
    busy: false,
  });
  assert.equal(entry(older, 'msg.retry').disabled, true);
  assert.notEqual(entry(older, 'msg.branch').disabled, true);
  // An older message can be edited (in a new chat) even while a reply is written.
  assert.notEqual(
    entry(
      messageMenuItems({
        role: 'user',
        hasSelection: false,
        isNewestUser: false,
        busy: true,
      }),
      'msg.edit',
    ).disabled,
    true,
  );
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
  assert.equal(
    entry(
      messageMenuItems({
        role: 'user',
        hasSelection: false,
        isNewestUser: true,
        busy: true,
      }),
      'msg.edit',
    ).disabled,
    true,
  );
  assert.deepEqual(parseMessageChoice('msg.edit'), { action: 'edit' });
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

// ---- Menus inside a web page ---------------------------------------------------

test('the page menu: Back and Forward grey out when there is nowhere to go', () => {
  const none = pageMenuItems({ canGoBack: false, canGoForward: false });
  assert.equal(entry(none, 'page.back').disabled, true);
  assert.equal(entry(none, 'page.forward').disabled, true);
  assert.notEqual(entry(none, 'page.reload').disabled, true);
  const both = pageMenuItems({ canGoBack: true, canGoForward: true });
  assert.notEqual(entry(both, 'page.back').disabled, true);
  assert.deepEqual(menuIds(both), [
    'page.back',
    'page.forward',
    'page.reload',
    'page.find',
    'page.zoom',
    'page.zoom-in',
    'page.zoom-out',
    'page.zoom-reset',
    'page.add-to-chat',
    'page.bookmark',
    'page.save-to-space',
    'page.save-new-space',
    'page.save-as',
    'page.print',
    'page.inspect',
  ]);
});

test('the link menu lists your Spaces to open it in', () => {
  const { state, workId, homeId } = build();
  const items = pageLinkMenuItems(state);
  const spaces = entry(items, 'page.open-link-in').submenu!;
  assert.deepEqual(
    spaces.filter((i) => i.type === 'item').map((i) => (i as MenuEntry).id),
    [
      `page.open-link-in:${workId}`,
      `page.open-link-in:${homeId}`,
      'page.open-link-in-new-space',
    ],
  );
  // With no Spaces, only "New Space…" is there.
  const lone = pageLinkMenuItems(defaultState());
  assert.deepEqual(
    entry(lone, 'page.open-link-in')
      .submenu!.filter((i) => i.type === 'item')
      .map((i) => (i as MenuEntry).id),
    ['page.open-link-in-new-space'],
  );
  // The only entries that save a file are the three "Save … as…" ones; each opens
  // the system's save window, so you always choose where it goes. Nothing saves or
  // downloads on its own (Print opens the system's own print window).
  const all = [
    ...menuIds(items),
    ...menuIds(pageImageMenuItems()),
    ...menuIds(pageSelectionMenuItems('x')),
    ...menuIds(pageMenuItems({ canGoBack: true, canGoForward: true })),
  ];
  assert.ok(
    all.every(
      (id) =>
        !/save|download/.test(
          id
            .replace(/save-(?:to-|new-)?space/g, '')
            .replace(/^page\.save-(?:page|link|image)?-?as$/, ''),
        ),
    ),
  );
  assert.deepEqual(
    all.filter((id) => /^page\.save-(?:link-|image-)?as$/.test(id)),
    ['page.save-link-as', 'page.save-image-as', 'page.save-as'],
  );
});

test('the selection menu names what will be searched, on one short line', () => {
  const items = pageSelectionMenuItems(
    '  a very long\nselected sentence that goes on and on  ',
  );
  const label = entry(items, 'page.search-selection').label;
  assert.ok(label.startsWith('Search the web for “a very long selected'));
  assert.ok(label.endsWith('…”'));
  assert.ok(!label.includes('\n'));
  assert.equal(
    entry(pageSelectionMenuItems('short'), 'page.search-selection').label,
    'Search the web for “short”',
  );
});

test('page menu choices are read back; unknown ones are not understood', () => {
  const { state } = build();
  for (const id of [
    ...menuIds(pageMenuItems({ canGoBack: true, canGoForward: true })),
    ...menuIds(pageLinkMenuItems(state)),
    ...menuIds(pageImageMenuItems()),
    ...menuIds(pageSelectionMenuItems('x')),
  ]) {
    // ("Zoom" only opens its submenu: its choices are the three below it.)
    if (id !== 'page.zoom' && id !== 'page.save-to-space') {
      assert.ok(parsePageChoice(id), id);
    }
  }
  assert.deepEqual(parsePageChoice('page.save-as'), { action: 'save-page-as' });
  assert.deepEqual(parsePageChoice('page.save-link-as'), {
    action: 'save-link-as',
  });
  assert.deepEqual(parsePageChoice('page.save-image-as'), {
    action: 'save-image-as',
  });
  assert.deepEqual(parsePageChoice('page.open-link-in:9'), {
    action: 'open-link-in',
    spaceId: 9,
  });
  for (const bad of ['', 'page.open-link-in:x', 'page.save-all', 'tab.close']) {
    assert.equal(parsePageChoice(bad), null, bad);
  }
});

test('"Open in new tab in this Space" can be clicked, and offers the other Spaces', () => {
  const { state, workId, homeId } = build();
  const items = pageLinkMenuItems(state, workId);
  const parent = entry(items, 'page.open-link-in');
  assert.equal(parent.label, 'Open in new tab in this Space');
  assert.equal(parent.choosable, true);
  // The submenu has the other Spaces, not this one.
  const others = parent
    .submenu!.filter((i) => i.type === 'item')
    .map((i) => (i as MenuEntry).id);
  assert.deepEqual(others, [
    `page.open-link-in:${homeId}`,
    'page.open-link-in-new-space',
  ]);
  // Choosing the item itself is allowed, and means "open it in this Space".
  assert.equal(isChoosable(items, 'page.open-link-in'), true);
  assert.deepEqual(parsePageChoice('page.open-link-in'), {
    action: 'open-link',
  });
  // A page in no Space: the item only opens its list of Spaces.
  const none = entry(pageLinkMenuItems(state, null), 'page.open-link-in');
  assert.equal(none.label, 'Open in new tab in Space');
  assert.notEqual(none.choosable, true);
  assert.equal(
    isChoosable(pageLinkMenuItems(state, null), 'page.open-link-in'),
    false,
  );
});

test('the artifact editor menu can send the selection to the chat, only when something is selected', () => {
  const none = editMenuItems({
    hasSelection: false,
    canPaste: true,
    pasteAndGo: false,
    addToChat: true,
  });
  assert.equal(entry(none, 'edit.add-to-chat').disabled, true);
  const some = editMenuItems({
    hasSelection: true,
    canPaste: true,
    pasteAndGo: false,
    addToChat: true,
  });
  assert.notEqual(entry(some, 'edit.add-to-chat').disabled, true);
  assert.deepEqual(parseEditChoice('edit.add-to-chat'), {
    action: 'add-to-chat',
  });
  // The other text boxes do not have it.
  assert.ok(
    !menuIds(
      editMenuItems({ hasSelection: true, canPaste: true, pasteAndGo: false }),
    ).includes('edit.add-to-chat'),
  );
});

test('"Change icon…" is in the Space, chat and artifact menus and is read back', () => {
  assert.deepEqual(parseSpaceChoice('space.icon'), { action: 'icon' });
  assert.deepEqual(parseArtifactChoice('artifact.icon'), { action: 'icon' });
  const spaces = addSpace(defaultState(), 'Trip');
  assert.ok(
    menuIds(spaceMenuItems(spaces.state, spaces.id)!).includes('space.icon'),
  );
  const made = createArtifact(defaultArtifacts(), { kind: 'text' }, 1);
  assert.ok(made.ok);
  assert.ok(
    menuIds(
      artifactMenuItems(defaultState(), made.state, made.artifact.id)!,
    ).includes('artifact.icon'),
  );
});

test('the emoji picker menu lists the choices, ticks the current one, and only real emoji parse', () => {
  const items = emojiPickerItems('🚀');
  assert.equal(entry(items, 'emoji:default').label, 'Use the default');
  assert.equal(entry(items, 'emoji:🚀').checked, true);
  assert.equal(entry(items, 'emoji:📁').checked, false);
  assert.deepEqual(parseEmojiChoice('emoji:default'), { reset: true });
  assert.deepEqual(parseEmojiChoice('emoji:🚀'), { emoji: '🚀' });
  for (const bad of [
    '',
    'emoji:',
    'emoji:a',
    'emoji:abc',
    'icon:🚀',
    'emoji:🚀🚀',
  ]) {
    assert.equal(parseEmojiChoice(bad), null);
  }
});

test('Spaces and artifacts show their emoji in the menus that list them', () => {
  let { state, id } = addSpace(defaultState(), 'Trip');
  state = setSpaceEmoji(state, id, '🗺️');
  const made = createArtifact(defaultArtifacts(), { kind: 'html' }, 1);
  assert.ok(made.ok);
  const items = artifactMenuItems(state, made.state, made.artifact.id)!;
  const move = items.find(
    (i) => i.type === 'item' && i.id === 'artifact.move',
  ) as MenuEntry;
  assert.equal(entry(move.submenu!, `artifact.move:${id}`).emoji, '🗺️');
  // A Space with no emoji of its own shows the default.
  const plain = addSpace(defaultState(), 'Plain');
  const tab = addTab(plain.state, { url: 'https://a.example' });
  const other = addSpace(tab.state, 'Other');
  const tabItems = tabMenuItems(other.state, tab.id)!;
  const tabMove = tabItems.find(
    (i) => i.type === 'item' && i.id === 'tab.move',
  ) as MenuEntry;
  assert.equal(entry(tabMove.submenu!, `tab.move:${plain.id}`).emoji, '📁');
});

test('"Name with AI" is in the Space and artifact menus, and a closed page can be opened from its menu', () => {
  assert.deepEqual(parseSpaceChoice('space.name-ai'), { action: 'name-ai' });
  assert.deepEqual(parseArtifactChoice('artifact.name-ai'), {
    action: 'name-ai',
  });
  assert.deepEqual(parseTabChoice('tab.open'), { action: 'open' });
  const spaces = addSpace(defaultState(), 'Trip');
  assert.ok(
    menuIds(spaceMenuItems(spaces.state, spaces.id)!).includes('space.name-ai'),
  );
  // A page kept in a Space with no tab open offers "Open" first.
  const tab = addTab(spaces.state, { url: 'https://a.example' });
  const moved = moveTab(tab.state, tab.id, spaces.id);
  const kept = closeTab(moved, tab.id);
  assert.equal(kept.tabs.find((t) => t.id === tab.id)!.closed, true);
  assert.equal(menuIds(tabMenuItems(kept, tab.id)!)[0], 'tab.open');
  // An open page does not.
  assert.ok(!menuIds(tabMenuItems(moved, tab.id)!).includes('tab.open'));
});

test('the toolbar "…" menu has Find, Zoom, Print and Developer tools, all greyed with no page', () => {
  const items = toolsMenuItems({ hasPage: true, zoomText: '125%' });
  assert.deepEqual(menuIds(items), [
    'tools.tab-search',
    'tools.find',
    'tools.zoom',
    'tools.zoom-in',
    'tools.zoom-out',
    'tools.zoom-reset',
    'tools.print',
    'tools.fullscreen',
    'tools.devtools',
  ]);
  assert.equal(entry(items, 'tools.tab-search').shortcut, 'Ctrl+Shift+A');
  assert.deepEqual(parseToolsChoice('tools.tab-search'), {
    action: 'tab-search',
  });
  // Full screen works with or without a page.
  assert.equal(entry(items, 'tools.fullscreen').shortcut, 'F11');
  assert.notEqual(
    entry(toolsMenuItems({ hasPage: false }), 'tools.fullscreen').disabled,
    true,
  );
  assert.deepEqual(parseToolsChoice('tools.fullscreen'), {
    action: 'fullscreen',
  });
  assert.equal(entry(items, 'tools.find').shortcut, 'Ctrl+F');
  assert.equal(entry(items, 'tools.zoom').label, 'Zoom (125%)');
  assert.equal(entry(items, 'tools.print').shortcut, 'Ctrl+P');
  assert.equal(entry(items, 'tools.devtools').shortcut, 'F12');
  for (const id of [
    'tools.find',
    'tools.zoom',
    'tools.print',
    'tools.devtools',
  ]) {
    assert.notEqual(entry(items, id).disabled, true, id);
    assert.equal(
      entry(toolsMenuItems({ hasPage: false }), id).disabled,
      true,
      id,
    );
  }
  // An uploaded image or PDF can be zoomed too, though it has no page to find in.
  const onFile = toolsMenuItems({ hasPage: false, zoomable: true });
  assert.notEqual(entry(onFile, 'tools.zoom').disabled, true);
  assert.equal(entry(onFile, 'tools.find').disabled, true);
  assert.deepEqual(parseToolsChoice('tools.find'), { action: 'find' });
  assert.deepEqual(parseToolsChoice('tools.zoom-in'), { action: 'zoom-in' });
  assert.deepEqual(parseToolsChoice('tools.zoom-out'), { action: 'zoom-out' });
  assert.deepEqual(parseToolsChoice('tools.zoom-reset'), {
    action: 'zoom-reset',
  });
  assert.deepEqual(parseToolsChoice('tools.print'), { action: 'print' });
  assert.deepEqual(parseToolsChoice('tools.devtools'), { action: 'devtools' });
  // "Zoom" itself only opens its submenu.
  assert.equal(parseToolsChoice('tools.zoom'), null);
  // The zoom chip's menu is the three zoom choices.
  assert.deepEqual(menuIds(zoomChipMenuItems()), [
    'tools.zoom-in',
    'tools.zoom-out',
    'tools.zoom-reset',
  ]);
});

test("the page's right-click menu reads its zoom, print and inspect choices back", () => {
  assert.deepEqual(parsePageChoice('page.find'), { action: 'find' });
  assert.deepEqual(parsePageChoice('page.zoom-in'), { action: 'zoom-in' });
  assert.deepEqual(parsePageChoice('page.zoom-out'), { action: 'zoom-out' });
  assert.deepEqual(parsePageChoice('page.zoom-reset'), {
    action: 'zoom-reset',
  });
  assert.deepEqual(parsePageChoice('page.print'), { action: 'print' });
  assert.deepEqual(parsePageChoice('page.inspect'), { action: 'inspect' });
});

test('the Library "…" menu clears the history by range or the closed list, and reads it back', () => {
  assert.deepEqual(menuIds(libraryMenuItems('history')), [
    'library.clear-hour',
    'library.clear-day',
    'library.clear-all',
  ]);
  assert.equal(
    entry(libraryMenuItems('history'), 'library.clear-all').danger,
    true,
  );
  assert.deepEqual(menuIds(libraryMenuItems('closed')), [
    'library.clear-closed',
  ]);
  assert.deepEqual(parseLibraryChoice('library.clear-hour'), {
    action: 'clear-history',
    range: 'hour',
  });
  assert.deepEqual(parseLibraryChoice('library.clear-day'), {
    action: 'clear-history',
    range: 'day',
  });
  assert.deepEqual(parseLibraryChoice('library.clear-all'), {
    action: 'clear-history',
    range: 'all',
  });
  assert.deepEqual(parseLibraryChoice('library.clear-closed'), {
    action: 'clear-closed',
  });
  assert.equal(parseLibraryChoice('library.clear-week'), null);
});

test('the star menu bookmarks the page and lists the Spaces to save it into', () => {
  const spaces = [
    { id: 4, name: 'Work', emoji: '💼', saved: false },
    { id: 9, name: 'Trip', emoji: '🗺️', saved: true },
  ];
  const items = starMenuItems({ bookmarked: false, spaces });
  assert.equal(entry(items, 'star.bookmark').label, 'Bookmark this page');
  assert.equal(entry(items, 'star.bookmark').shortcut, 'Ctrl+D');
  assert.equal(
    entry(starMenuItems({ bookmarked: true, spaces }), 'star.bookmark').label,
    'Remove bookmark',
  );
  assert.equal(entry(items, 'star.space:4').emoji, '💼');
  assert.notEqual(entry(items, 'star.space:4').disabled, true);
  // A Space that already has the page is ticked and greyed.
  assert.equal(entry(items, 'star.space:9').checked, true);
  assert.equal(entry(items, 'star.space:9').disabled, true);
  assert.ok(menuIds(items).includes('star.new-space'));
  // With no Spaces only "New Space…" is offered.
  assert.deepEqual(menuIds(starMenuItems({ bookmarked: false, spaces: [] })), [
    'star.bookmark',
    'star.new-space',
  ]);
});

test('star and page-menu choices to bookmark or save are read back', () => {
  assert.deepEqual(parseStarChoice('star.bookmark'), { action: 'bookmark' });
  assert.deepEqual(parseStarChoice('star.space:4'), {
    action: 'space',
    spaceId: 4,
  });
  assert.deepEqual(parseStarChoice('star.new-space'), { action: 'new-space' });
  for (const bad of ['', 'star.space', 'star.space:x', 'tools.find']) {
    assert.equal(parseStarChoice(bad), null, bad);
  }
  assert.deepEqual(parsePageChoice('page.bookmark'), { action: 'bookmark' });
  assert.deepEqual(parsePageChoice('page.save-space:7'), {
    action: 'save-to-space',
    spaceId: 7,
  });
  assert.deepEqual(parsePageChoice('page.save-new-space'), {
    action: 'save-to-new-space',
  });
  // The page menu offers the same Spaces.
  const page = pageMenuItems({
    canGoBack: false,
    canGoForward: false,
    bookmarked: true,
    spaces: [{ id: 4, name: 'Work', emoji: '💼', saved: false }],
  });
  assert.equal(entry(page, 'page.bookmark').label, 'Remove bookmark');
  assert.ok(menuIds(page).includes('page.save-space:4'));
});

test("a download's menu offers only what fits how it stands, and reads back", () => {
  assert.deepEqual(menuIds(downloadMenuItems({ state: 'done' })), [
    'download.open',
    'download.show',
    'download.remove',
  ]);
  assert.deepEqual(menuIds(downloadMenuItems({ state: 'downloading' })), [
    'download.pause',
    'download.cancel',
    'download.remove',
  ]);
  assert.deepEqual(menuIds(downloadMenuItems({ state: 'paused' })), [
    'download.resume',
    'download.cancel',
    'download.remove',
  ]);
  for (const state of ['failed', 'cancelled', 'blocked'] as const) {
    assert.deepEqual(menuIds(downloadMenuItems({ state })), [
      'download.remove',
    ]);
  }
  assert.deepEqual(parseDownloadChoice('download.open'), { action: 'open' });
  assert.deepEqual(parseDownloadChoice('download.show'), { action: 'show' });
  assert.deepEqual(parseDownloadChoice('download.pause'), { action: 'pause' });
  assert.deepEqual(parseDownloadChoice('download.resume'), {
    action: 'resume',
  });
  assert.deepEqual(parseDownloadChoice('download.cancel'), {
    action: 'cancel',
  });
  assert.deepEqual(parseDownloadChoice('download.remove'), {
    action: 'remove',
  });
  assert.equal(parseDownloadChoice('download.delete-file'), null);
  // The Library's "…" for downloads clears the finished ones.
  assert.deepEqual(menuIds(libraryMenuItems('downloads')), [
    'library.clear-downloads',
  ]);
  assert.deepEqual(parseLibraryChoice('library.clear-downloads'), {
    action: 'clear-downloads',
  });
});

test("a site's question names it, offers three answers, and reads back", () => {
  const items = permissionPromptItems('a.com', ['camera']);
  assert.equal(items[0].type, 'header');
  assert.deepEqual(menuIds(items), [
    'permission.allow',
    'permission.once',
    'permission.block',
  ]);
  assert.equal(parsePermissionChoice('permission.allow'), 'allow');
  assert.equal(parsePermissionChoice('permission.once'), 'once');
  assert.equal(parsePermissionChoice('permission.block'), 'block');
  assert.equal(parsePermissionChoice('permission.always'), null);
});

test("the site chip's menu shows each permission's state and reads choices back", () => {
  const items = siteMenuItems({
    host: 'a.com',
    secure: true,
    canAsk: true,
    answers: { camera: 'allow', location: 'block' },
  });
  assert.equal(items[0].type, 'header');
  const camera = entry(items, 'site.kind:camera');
  assert.equal(camera.label, 'Camera');
  assert.equal(entry(items, 'site.kind:location').label, 'Location');
  const subs = camera.submenu!.filter((i) => i.type === 'item') as MenuEntry[];
  assert.deepEqual(
    subs.map((i) => [i.id, i.checked === true]),
    [
      ['site.set:camera:ask', false],
      ['site.set:camera:allow', true],
      ['site.set:camera:block', false],
    ],
  );
  // Only what was changed is listed; the rest is just "ask".
  assert.equal(
    menuIds(items).some((id) => id.startsWith('site.kind:microphone')),
    false,
  );
  const fresh = siteMenuItems({
    host: 'a.com',
    secure: true,
    canAsk: true,
    answers: {},
  });
  assert.deepEqual(menuIds(fresh), ['site.none', 'site.settings']);
  // A site that is not secure can ask for nothing, so there is nothing to set.
  assert.deepEqual(
    menuIds(
      siteMenuItems({
        host: 'a.com',
        secure: false,
        canAsk: false,
        answers: {},
      }),
    ),
    ['site.insecure', 'site.settings'],
  );
  assert.deepEqual(parseSiteChoice('site.set:camera:allow'), {
    action: 'set',
    kind: 'camera',
    answer: 'allow',
  });
  assert.deepEqual(parseSiteChoice('site.set:location:ask'), {
    action: 'set',
    kind: 'location',
    answer: null,
  });
  assert.deepEqual(parseSiteChoice('site.settings'), { action: 'settings' });
  assert.equal(parseSiteChoice('site.reset'), null);
  for (const bad of [
    '',
    'site.set:usb:allow',
    'site.set:camera:maybe',
    'site.kind:camera',
  ]) {
    assert.equal(parseSiteChoice(bad), null, bad);
  }
});

test('a site you went on to despite its certificate is never called secure', () => {
  const items = siteMenuItems({
    host: 'nas.local',
    secure: false,
    problem: true,
    canAsk: false,
    answers: {},
  });
  const header = items[0];
  assert.equal(header.type, 'header');
  assert.equal(
    header.type === 'header' ? header.detail : '',
    'Certificate is not valid',
  );
  assert.equal(header.type === 'header' ? header.icon : '', 'warn');
  assert.ok(menuIds(items).includes('site.rewarn'));
  // One button to the settings; no reset or clearing in the card itself.
  assert.ok(menuIds(items).includes('site.settings'));
  assert.ok(!menuIds(items).includes('site.clear-data'));
  assert.ok(!menuIds(items).includes('site.reset'));
  assert.deepEqual(menuIds(privacySiteMenuItems()), ['privacy.reset']);
  assert.equal(parsePrivacyChoice('privacy.reset'), 'reset');
  assert.deepEqual(menuIds(privacyDataMenuItems()), ['privacy.clear-data']);
  assert.equal(parsePrivacyChoice('privacy.clear-data'), 'clear');
  assert.equal(parsePrivacyChoice('privacy.delete'), null);
  assert.deepEqual(parseSiteChoice('site.rewarn'), { action: 'rewarn' });
  // An ordinary site has no such row.
  assert.ok(
    !menuIds(
      siteMenuItems({ host: 'a.com', secure: true, canAsk: true, answers: {} }),
    ).includes('site.rewarn'),
  );
});

test('the pop-up chip lists what was blocked, with a button each and one to always allow', () => {
  const items = blockedPopupItems('a.com', [
    'https://ad.example.com/win',
    'https://b.example/x',
  ]);
  const header = items[0];
  assert.equal(header.type, 'header');
  assert.equal(
    header.type === 'header' ? header.label : '',
    '2 pop-ups blocked',
  );
  assert.deepEqual(menuIds(items), [
    'popup.open:0',
    'popup.open:1',
    'popup.allow',
  ]);
  assert.equal((items[1] as MenuEntry).label, 'Open ad.example.com/win');
  assert.equal(
    blockedPopupItems('a.com', ['https://x.com/'])[0].type === 'header' &&
      (blockedPopupItems('a.com', ['https://x.com/'])[0] as { label: string })
        .label,
    '1 pop-up blocked',
  );
  assert.deepEqual(parsePopupChoice('popup.allow'), { action: 'allow' });
  assert.deepEqual(parsePopupChoice('popup.open:1'), {
    action: 'open',
    index: 1,
  });
  for (const bad of ['', 'popup.open:x', 'popup.open:100', 'popup.deny']) {
    assert.equal(parsePopupChoice(bad), null, bad);
  }
});

test("a tab's menu can mute or unmute its page, and reads the choice back", () => {
  const { state } = build();
  const id = state.tabs[0].id;
  const none = menuIds(tabMenuItems(state, id) ?? []);
  assert.ok(!none.includes('tab.mute') && !none.includes('tab.unmute'));
  const sound = tabMenuItems(state, id, false) ?? [];
  assert.ok(menuIds(sound).includes('tab.mute'));
  assert.equal(entry(sound, 'tab.mute').label, 'Mute tab');
  const muted = tabMenuItems(state, id, true) ?? [];
  assert.ok(menuIds(muted).includes('tab.unmute'));
  assert.equal(entry(muted, 'tab.unmute').label, 'Unmute tab');
  assert.deepEqual(parseTabChoice('tab.mute'), { action: 'mute' });
  assert.deepEqual(parseTabChoice('tab.unmute'), { action: 'unmute' });
});

test('an extension menu: pin, turn off or on, and remove (marked dangerous)', () => {
  const on = { enabled: true, pinned: true, hasAction: true };
  assert.deepEqual(menuIds(extensionMenuItems(on)), [
    'extension.pin',
    'extension.toggle',
    'extension.remove',
  ]);
  // No button, nothing to pin.
  assert.deepEqual(menuIds(extensionMenuItems({ ...on, hasAction: false })), [
    'extension.toggle',
    'extension.remove',
  ]);
  assert.equal(
    entry(extensionMenuItems(on), 'extension.pin').label,
    'Unpin from toolbar',
  );
  assert.equal(
    entry(extensionMenuItems({ ...on, pinned: false }), 'extension.pin').label,
    'Pin to toolbar',
  );
  assert.equal(
    entry(extensionMenuItems(on), 'extension.toggle').label,
    'Turn off',
  );
  assert.equal(
    entry(extensionMenuItems({ ...on, enabled: false }), 'extension.toggle')
      .label,
    'Turn on',
  );
  assert.equal(entry(extensionMenuItems(on), 'extension.remove').danger, true);
  assert.deepEqual(parseExtensionChoice('extension.toggle'), {
    action: 'toggle',
  });
  assert.deepEqual(parseExtensionChoice('extension.remove'), {
    action: 'remove',
  });
  assert.deepEqual(parseExtensionChoice('extension.pin'), { action: 'pin' });
  assert.equal(parseExtensionChoice('extension.other'), null);
});

test('the puzzle menu lists the extensions with a button; each opens or is pinned', () => {
  const items = puzzleMenuItems([
    {
      key: 'ext-1',
      name: 'Bitwarden',
      pinned: true,
      icon: 'data:image/png;base64,AA==',
    },
    { key: 'ext-2', name: 'Dark mode', pinned: false, icon: null },
  ]);
  assert.deepEqual(menuIds(items), [
    'puzzle.open:ext-1',
    'puzzle.pin:ext-1',
    'puzzle.open:ext-2',
    'puzzle.pin:ext-2',
    'puzzle.manage',
  ]);
  assert.equal(
    entry(entry(items, 'puzzle.open:ext-1').submenu ?? [], 'puzzle.pin:ext-1')
      .label,
    'Unpin from toolbar',
  );
  assert.equal(
    entry(entry(items, 'puzzle.open:ext-2').submenu ?? [], 'puzzle.pin:ext-2')
      .label,
    'Pin to toolbar',
  );
  assert.equal(entry(items, 'puzzle.open:ext-1').choosable, true);
  assert.deepEqual(menuIds(puzzleMenuItems([])), [
    'puzzle.none',
    'puzzle.manage',
  ]);
  assert.deepEqual(parsePuzzleChoice('puzzle.open:ext-1'), {
    action: 'open',
    key: 'ext-1',
  });
  assert.deepEqual(parsePuzzleChoice('puzzle.pin:ext-2'), {
    action: 'pin',
    key: 'ext-2',
  });
  assert.deepEqual(parsePuzzleChoice('puzzle.manage'), { action: 'manage' });
  for (const bad of ['puzzle.open:../x', 'puzzle.open:', 'puzzle.none', 'x']) {
    assert.equal(parsePuzzleChoice(bad), null, bad);
  }
});

test('an extension with a settings page gets an Options row, greyed while it is off', () => {
  const base = {
    enabled: true,
    pinned: true,
    hasAction: true,
    optionsPage: 'options.html',
  };
  assert.deepEqual(menuIds(extensionMenuItems(base)), [
    'extension.pin',
    'extension.options',
    'extension.toggle',
    'extension.remove',
  ]);
  assert.equal(
    entry(extensionMenuItems({ ...base, enabled: false }), 'extension.options')
      .disabled,
    true,
  );
  assert.deepEqual(
    menuIds(
      extensionMenuItems({ ...base, hasAction: false, optionsPage: null }),
    ),
    ['extension.toggle', 'extension.remove'],
  );
  assert.deepEqual(parseExtensionChoice('extension.options'), {
    action: 'options',
  });
});

test('the Add extension menu offers the Chrome Web Store and a folder', () => {
  assert.deepEqual(menuIds(addExtensionMenuItems()), [
    'add-extension.store',
    'add-extension.folder',
  ]);
  assert.deepEqual(parseAddExtensionChoice('add-extension.store'), {
    action: 'store',
  });
  assert.deepEqual(parseAddExtensionChoice('add-extension.folder'), {
    action: 'folder',
  });
  assert.equal(parseAddExtensionChoice('add-extension.zip'), null);
});

test('the New artifact menu offers each kind, and only a real kind is read back', async () => {
  const { newArtifactMenuItems, parseNewArtifactChoice } =
    await import('./menuData.ts');
  assert.deepEqual(menuIds(newArtifactMenuItems()), [
    'new-artifact.markdown',
    'new-artifact.text',
    'new-artifact.html',
    'new-artifact.code',
    'new-artifact.upload',
  ]);
  assert.deepEqual(parseNewArtifactChoice('new-artifact.upload'), {
    upload: true,
  });
  // "file" is not something you can make empty.
  assert.equal(parseNewArtifactChoice('new-artifact.file'), null);
  assert.deepEqual(parseNewArtifactChoice('new-artifact.html'), {
    kind: 'html',
  });
  for (const bad of [
    'new-artifact.pdf',
    'new-artifact.',
    'artifact.html',
    'new-artifact.html.x',
  ]) {
    assert.equal(parseNewArtifactChoice(bad), null, bad);
  }
});

test('the Space switcher lists every Space in order, ticks the current one and shows the keys', async () => {
  const { spaceSwitcherItems, parseSwitchSpaceChoice } =
    await import('./menuData.ts');
  const { addSpace, defaultState } = await import('./model.ts');
  let state = defaultState();
  const ids: number[] = [];
  for (let i = 0; i < 10; i++) {
    const added = addSpace(state, `S${i + 1}`);
    state = added.state;
    ids.push(added.id);
  }
  const items = spaceSwitcherItems(state, ids[1]);
  assert.deepEqual(menuIds(items), [
    ...ids.map((id) => `switch-space:${id}`),
    'switch-space.new',
  ]);
  const second = entry(items, `switch-space:${ids[1]}`);
  assert.equal(second.checked, true);
  assert.equal(second.shortcut, 'Alt+2');
  assert.equal(entry(items, `switch-space:${ids[0]}`).checked, false);
  // Only the first nine have a key.
  assert.equal(entry(items, `switch-space:${ids[8]}`).shortcut, 'Alt+9');
  assert.equal(entry(items, `switch-space:${ids[9]}`).shortcut, undefined);
  assert.deepEqual(menuIds(spaceSwitcherItems(defaultState(), null)), [
    'switch-space.new',
  ]);
  assert.deepEqual(parseSwitchSpaceChoice('switch-space:12'), { spaceId: 12 });
  assert.deepEqual(parseSwitchSpaceChoice('switch-space.new'), {
    action: 'new-space',
  });
  for (const bad of [
    'switch-space:',
    'switch-space:x',
    'switch-space:1;2',
    'x',
  ]) {
    assert.equal(parseSwitchSpaceChoice(bad), null, bad);
  }
});

test('the Space menu can put its pages to sleep, greyed when none can', async () => {
  const { spaceMenuItems, parseSpaceChoice } = await import('./menuData.ts');
  const { addSpace, defaultState } = await import('./model.ts');
  const made = addSpace(defaultState(), 'Work');
  assert.equal(
    entry(spaceMenuItems(made.state, made.id)!, 'space.sleep').disabled,
    true,
  );
  assert.equal(
    entry(spaceMenuItems(made.state, made.id, 3)!, 'space.sleep').disabled,
    false,
  );
  assert.deepEqual(parseSpaceChoice('space.sleep'), { action: 'sleep' });
});
