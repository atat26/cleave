import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHAT_DEFAULT_HEIGHT,
  CHAT_MAX_HEIGHT,
  CHAT_MIN_HEIGHT,
  isPanelRelevant,
  PANEL_DEFAULT_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  setChatExpanded,
  setChatHeight,
  setPanelWidth,
  setRightPanel,
  setViewMode,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  setSidebarWidth,
  addSpace,
  addTab,
  closeArtifactTab,
  closeTab,
  defaultState,
  deleteSpace,
  findClosedTabByAddress,
  moveTab,
  isNewTabPage,
  navOrder,
  NEW_TAB_PAGE,
  openArtifactTab,
  parseState,
  reconcileArtifactTabs,
  reopenTab,
  removeTab,
  renameSpace,
  setActive,
  setSpaceCollapsed,
  setSpaceColor,
  ungroupSpace,
  updateTab,
} from './model.ts';
import type { SavedState } from './model.ts';

// Build a state: tab ids come back so tests can refer to them.
function build() {
  let state: SavedState = defaultState();
  const free = addTab(state, { url: 'https://free.example' });
  state = free.state;
  const space = addSpace(state, 'Work');
  state = space.state;
  const a = addTab(state, { url: 'https://a.example', spaceId: space.id });
  state = a.state;
  const b = addTab(state, { url: 'https://b.example', spaceId: space.id });
  state = b.state;
  return { state, freeId: free.id, spaceId: space.id, aId: a.id, bId: b.id };
}

test('parseState survives garbage input', () => {
  for (const junk of [
    null,
    undefined,
    42,
    'text',
    [],
    { spaces: 'no', tabs: 7 },
  ]) {
    const state = parseState(junk);
    assert.deepEqual(state.spaces, []);
    assert.deepEqual(state.tabs, []);
    assert.equal(state.active, null);
  }
});

test('parseState drops non-web addresses from a tampered file', () => {
  const state = parseState({
    tabs: [
      {
        id: 1,
        url: 'file:///C:/Windows/win.ini',
        title: 'x',
        favicon: null,
        spaceId: null,
        closed: false,
      },
      {
        id: 2,
        url: 'javascript:alert(1)',
        title: 'x',
        favicon: null,
        spaceId: null,
        closed: false,
      },
      {
        id: 3,
        url: 'https://ok.example',
        title: 'ok',
        favicon: 'file:///icon.png',
        spaceId: null,
      },
    ],
  });
  assert.deepEqual(
    state.tabs.map((t) => t.id),
    [3],
  );
  assert.equal(state.tabs[0].favicon, null);
});

test('parseState repairs orphan tabs, duplicate ids and bad active', () => {
  const state = parseState({
    spaces: [
      { id: 5, name: 'A', color: 'blue', collapsed: false },
      { id: 5, name: 'Dup', color: 'red', collapsed: false },
    ],
    tabs: [
      {
        id: 6,
        url: 'https://x.example',
        title: '',
        favicon: null,
        spaceId: 99,
      },
      {
        id: 6,
        url: 'https://dup.example',
        title: '',
        favicon: null,
        spaceId: 5,
      },
    ],
    active: { kind: 'tab', id: 12345 },
    nextId: 1,
  });
  assert.equal(state.spaces.length, 1);
  assert.equal(state.tabs.length, 1);
  assert.equal(state.tabs[0].spaceId, null); // Space 99 does not exist
  assert.deepEqual(state.active, { kind: 'tab', id: 6 }); // fell back to first item
  assert.ok(state.nextId > 6); // ids never collide with existing ones
});

test('parseState clamps unknown colours and long names', () => {
  const state = parseState({
    spaces: [
      { id: 1, name: 'x'.repeat(500), color: 'plaid', collapsed: 'yes' },
    ],
  });
  assert.equal(state.spaces[0].color, 'grey');
  assert.equal(state.spaces[0].name.length, 60);
  assert.equal(state.spaces[0].collapsed, false);
});

test('a state survives a JSON round trip unchanged', () => {
  const { state } = build();
  const round = parseState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(round, state);
});

test('navOrder lists ungrouped tabs, then each Space with its Lead tab first', () => {
  const { state, freeId, spaceId, aId, bId } = build();
  assert.deepEqual(navOrder(state), [
    { kind: 'tab', id: freeId },
    { kind: 'lead', spaceId },
    { kind: 'tab', id: aId },
    { kind: 'tab', id: bId },
  ]);
});

test('addSpace gives default names, cycles colours and trims names', () => {
  let state = defaultState();
  state = addSpace(state).state;
  state = addSpace(state, '  Research  ').state;
  assert.equal(state.spaces[0].name, 'Space 1');
  assert.equal(state.spaces[1].name, 'Research');
  assert.notEqual(state.spaces[0].color, state.spaces[1].color);
  assert.equal(
    renameSpace(state, state.spaces[0].id, '   ').spaces[0].name,
    'Space 1',
  );
});

test('addTab ignores an unknown Space and can skip activating', () => {
  const { state } = build();
  const added = addTab(state, {
    url: 'https://c.example',
    spaceId: 9999,
    activate: false,
  });
  assert.equal(added.state.tabs.at(-1)?.spaceId, null);
  assert.deepEqual(added.state.active, state.active);
});

test('removeTab selects the neighbour that takes its place', () => {
  const { state, aId, bId } = build();
  const active = setActive(state, { kind: 'tab', id: aId });
  const after = removeTab(active, aId);
  assert.deepEqual(after.active, { kind: 'tab', id: bId });
  const last = removeTab(after, bId);
  assert.ok(last.active !== null); // falls back to something still present
});

test('removeTab of the only tab leaves nothing active', () => {
  const added = addTab(defaultState(), { url: 'https://only.example' });
  assert.equal(removeTab(added.state, added.id).active, null);
});

test('moveTab moves in and out of Spaces and rejects unknown ones', () => {
  const { state, freeId, spaceId } = build();
  const moved = moveTab(state, freeId, spaceId);
  assert.equal(moved.tabs.find((t) => t.id === freeId)?.spaceId, spaceId);
  assert.equal(
    moveTab(moved, freeId, null).tabs.find((t) => t.id === freeId)?.spaceId,
    null,
  );
  assert.equal(moveTab(state, freeId, 9999), state);
});

test('ungroupSpace keeps the tabs and moves selection off the Lead tab', () => {
  const { state, spaceId } = build();
  const onLead = setActive(state, { kind: 'lead', spaceId });
  const after = ungroupSpace(onLead, spaceId);
  assert.equal(after.spaces.length, 0);
  assert.equal(after.tabs.length, 3);
  assert.ok(after.tabs.every((t) => t.spaceId === null));
  assert.equal(after.active?.kind, 'tab');
});

test('deleteSpace removes its tabs and reports which', () => {
  const { state, freeId, spaceId, aId, bId } = build();
  const onB = setActive(state, { kind: 'tab', id: bId });
  const result = deleteSpace(onB, spaceId);
  assert.deepEqual(result.removedTabIds.sort(), [aId, bId].sort());
  assert.deepEqual(
    result.state.tabs.map((t) => t.id),
    [freeId],
  );
  assert.deepEqual(result.state.active, { kind: 'tab', id: freeId });
});

test('updateTab accepts web addresses only', () => {
  const { state, freeId } = build();
  const updated = updateTab(state, freeId, {
    url: 'file:///secret',
    title: 'Hello',
    favicon: 'javascript:1',
  });
  const tab = updated.tabs.find((t) => t.id === freeId);
  assert.equal(tab?.url, 'https://free.example');
  assert.equal(tab?.title, 'Hello');
  assert.equal(tab?.favicon, null);
});

test('setSpaceColor and setSpaceCollapsed change only that Space', () => {
  const { state, spaceId } = build();
  const other = addSpace(state, 'Other');
  const recoloured = setSpaceColor(other.state, spaceId, 'red');
  assert.equal(recoloured.spaces.find((s) => s.id === spaceId)?.color, 'red');
  assert.equal(
    recoloured.spaces.find((s) => s.id === other.id)?.color,
    other.state.spaces.find((s) => s.id === other.id)?.color,
  );
  // An unknown colour (e.g. from a bad message) is refused.
  assert.equal(setSpaceColor(state, spaceId, 'plaid' as never), state);
  const collapsed = setSpaceCollapsed(state, spaceId, true);
  assert.equal(collapsed.spaces.find((s) => s.id === spaceId)?.collapsed, true);
});

test('sidebar width is clamped, remembered, and validated on load', () => {
  const state = defaultState();
  assert.equal(state.settings.sidebarWidth, SIDEBAR_DEFAULT_WIDTH);
  assert.equal(setSidebarWidth(state, 300).settings.sidebarWidth, 300);
  assert.equal(
    setSidebarWidth(state, 5).settings.sidebarWidth,
    SIDEBAR_MIN_WIDTH,
  );
  assert.equal(
    setSidebarWidth(state, 9999).settings.sidebarWidth,
    SIDEBAR_MAX_WIDTH,
  );
  assert.equal(setSidebarWidth(state, Number.NaN), state);
  // A tampered or old save file cannot set a silly width.
  assert.equal(
    parseState({ settings: { sidebarWidth: 1e9 } }).settings.sidebarWidth,
    SIDEBAR_MAX_WIDTH,
  );
  assert.equal(
    parseState({ settings: { sidebarWidth: 'wide' } }).settings.sidebarWidth,
    SIDEBAR_DEFAULT_WIDTH,
  );
  assert.equal(parseState({}).settings.sidebarWidth, SIDEBAR_DEFAULT_WIDTH);
});

test('chat and right-panel settings have defaults, clamps and validation', () => {
  const state = defaultState();
  assert.equal(state.settings.chatExpanded, false);
  assert.equal(state.settings.chatHeight, CHAT_DEFAULT_HEIGHT);
  assert.equal(state.settings.rightPanel, null);
  assert.equal(state.settings.panelWidth, PANEL_DEFAULT_WIDTH);

  assert.equal(setChatExpanded(state, true).settings.chatExpanded, true);
  assert.equal(setChatHeight(state, 400).settings.chatHeight, 400);
  assert.equal(setChatHeight(state, 1).settings.chatHeight, CHAT_MIN_HEIGHT);
  assert.equal(setChatHeight(state, 1e9).settings.chatHeight, CHAT_MAX_HEIGHT);
  assert.equal(setChatHeight(state, Number.NaN), state);

  assert.equal(setPanelWidth(state, 400).settings.panelWidth, 400);
  assert.equal(setPanelWidth(state, 1).settings.panelWidth, PANEL_MIN_WIDTH);
  assert.equal(setPanelWidth(state, 1e9).settings.panelWidth, PANEL_MAX_WIDTH);
  assert.equal(setPanelWidth(state, Number.NaN), state);

  assert.equal(
    setRightPanel(state, 'settings').settings.rightPanel,
    'settings',
  );
  assert.equal(
    setRightPanel(setRightPanel(state, 'skills'), null).settings.rightPanel,
    null,
  );
  // An unknown panel (e.g. from a bad message) is refused.
  assert.equal(setRightPanel(state, 'plaid' as never), state);
});

test('rail buttons follow the view: chat ones with the chat, web ones with the page', () => {
  // Skills belongs to the chat, Extensions to the web page, Artifacts and Settings to both.
  assert.deepEqual(
    (['skills', 'tools', 'artifacts', 'extensions', 'settings'] as const).map(
      (p) => isPanelRelevant(p, 'both'),
    ),
    [true, true, true, true, true],
  );
  assert.deepEqual(
    (['skills', 'tools', 'artifacts', 'extensions', 'settings'] as const).map(
      (p) => isPanelRelevant(p, 'chat'),
    ),
    [true, true, true, false, true],
  );
  assert.deepEqual(
    (['skills', 'tools', 'artifacts', 'extensions', 'settings'] as const).map(
      (p) => isPanelRelevant(p, 'page'),
    ),
    [false, false, true, true, true],
  );
});

test('a panel that does not belong in the view cannot open, and closes on switch', () => {
  const state = defaultState(); // view: both
  // Chat-only: Extensions is refused, Skills is allowed.
  const chatOnly = setViewMode(state, 'chat');
  assert.equal(setRightPanel(chatOnly, 'extensions'), chatOnly);
  assert.equal(setRightPanel(chatOnly, 'skills').settings.rightPanel, 'skills');
  // Open Extensions, then close the page: Extensions goes away with it...
  const withExtensions = setRightPanel(state, 'extensions');
  assert.equal(setViewMode(withExtensions, 'chat').settings.rightPanel, null);
  // ...but Settings stays in every view.
  const withSettings = setRightPanel(state, 'settings');
  assert.equal(
    setViewMode(withSettings, 'chat').settings.rightPanel,
    'settings',
  );
  assert.equal(
    setViewMode(withSettings, 'page').settings.rightPanel,
    'settings',
  );
  // A saved file that disagrees with itself is repaired on load.
  const loaded = parseState({
    settings: { viewMode: 'chat', rightPanel: 'extensions' },
  });
  assert.equal(loaded.settings.rightPanel, null);
});

test('the view mode (page, chat, or both) is validated and defaults to both', () => {
  const state = defaultState();
  assert.equal(state.settings.viewMode, 'both');
  assert.equal(setViewMode(state, 'chat').settings.viewMode, 'chat');
  assert.equal(setViewMode(state, 'page').settings.viewMode, 'page');
  assert.equal(setViewMode(state, 'plaid' as never), state);
  assert.equal(
    parseState({ settings: { viewMode: 'chat' } }).settings.viewMode,
    'chat',
  );
  assert.equal(
    parseState({ settings: { viewMode: 'hacks' } }).settings.viewMode,
    'both',
  );
  assert.equal(parseState({}).settings.viewMode, 'both');
});

test('chat and panel settings are validated when loading a saved file', () => {
  const loaded = parseState({
    settings: {
      chatExpanded: 'yes',
      chatHeight: 'tall',
      rightPanel: 'hacks',
      panelWidth: -50,
    },
  });
  assert.equal(loaded.settings.chatExpanded, false);
  assert.equal(loaded.settings.chatHeight, CHAT_DEFAULT_HEIGHT);
  assert.equal(loaded.settings.rightPanel, null);
  assert.equal(loaded.settings.panelWidth, PANEL_MIN_WIDTH);

  const good = parseState({
    settings: {
      chatExpanded: true,
      chatHeight: 500,
      rightPanel: 'settings',
      panelWidth: 420,
    },
  });
  assert.deepEqual(
    [
      good.settings.chatExpanded,
      good.settings.chatHeight,
      good.settings.rightPanel,
      good.settings.panelWidth,
    ],
    [true, 500, 'settings', 420],
  );
});

test('setActive ignores things that do not exist', () => {
  const { state } = build();
  assert.equal(setActive(state, { kind: 'tab', id: 9999 }), state);
  assert.equal(setActive(state, { kind: 'lead', spaceId: 9999 }), state);
});

// ---- Artifact tabs ----------------------------------------------------------

test('an artifact opens as a tab under its Space, and opening twice does not duplicate it', () => {
  const { state, spaceId } = build();
  const opened = openArtifactTab(state, 7, spaceId);
  assert.deepEqual(opened.artifactTabs, [{ artifactId: 7, spaceId }]);
  assert.deepEqual(opened.active, { kind: 'artifact', id: 7 });
  const again = openArtifactTab(
    setActive(opened, { kind: 'lead', spaceId }),
    7,
    spaceId,
  );
  assert.equal(again.artifactTabs.length, 1);
  assert.deepEqual(again.active, { kind: 'artifact', id: 7 });
  // A Space that does not exist means no Space.
  assert.equal(openArtifactTab(state, 8, 9999).artifactTabs[0].spaceId, null);
});

test('artifact tabs sit after the web tabs of their group in the sidebar order', () => {
  const { state, spaceId } = build();
  const s = openArtifactTab(openArtifactTab(state, 1, null), 2, spaceId);
  const order = navOrder(s);
  const free = order.findIndex((r) => r.kind === 'artifact' && r.id === 1);
  const lead = order.findIndex(
    (r) => r.kind === 'lead' && r.spaceId === spaceId,
  );
  const inSpace = order.findIndex((r) => r.kind === 'artifact' && r.id === 2);
  assert.ok(free < lead && lead < inSpace);
});

test('closing an artifact tab selects a neighbour and keeps other tabs', () => {
  const { state } = build();
  const s = openArtifactTab(openArtifactTab(state, 1, null), 2, null);
  const closed = closeArtifactTab(s, 2);
  assert.deepEqual(
    closed.artifactTabs.map((t) => t.artifactId),
    [1],
  );
  assert.notDeepEqual(closed.active, { kind: 'artifact', id: 2 });
  assert.equal(closed.active !== null, true);
  assert.equal(closeArtifactTab(closed, 99), closed);
});

test('artifact tabs follow their artifacts: gone ones close, moved ones change group', () => {
  const { state, spaceId } = build();
  const s = openArtifactTab(openArtifactTab(state, 1, null), 2, null);
  const moved = reconcileArtifactTabs(s, [
    { id: 1, spaceId },
    { id: 2, spaceId: null },
  ]);
  assert.deepEqual(moved.artifactTabs, [
    { artifactId: 1, spaceId },
    { artifactId: 2, spaceId: null },
  ]);
  const gone = reconcileArtifactTabs(s, [{ id: 1, spaceId: null }]);
  assert.deepEqual(
    gone.artifactTabs.map((t) => t.artifactId),
    [1],
  );
  assert.notDeepEqual(gone.active, { kind: 'artifact', id: 2 });
  // Nothing changed: the very same state comes back.
  assert.equal(
    reconcileArtifactTabs(s, [
      { id: 1, spaceId: null },
      { id: 2, spaceId: null },
    ]),
    s,
  );
});

test('deleting or ungrouping a Space keeps its artifact tabs, now outside it', () => {
  const { state, spaceId } = build();
  const s = openArtifactTab(state, 5, spaceId);
  assert.equal(deleteSpace(s, spaceId).state.artifactTabs[0].spaceId, null);
  assert.equal(ungroupSpace(s, spaceId).artifactTabs[0].spaceId, null);
  assert.deepEqual(deleteSpace(s, spaceId).state.active, {
    kind: 'artifact',
    id: 5,
  });
});

test('artifact tabs are saved and loaded, and bad ones are repaired', () => {
  const { state, spaceId } = build();
  const s = openArtifactTab(state, 5, spaceId);
  assert.deepEqual(
    parseState(JSON.parse(JSON.stringify(s))).artifactTabs,
    s.artifactTabs,
  );
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(s))).active, {
    kind: 'artifact',
    id: 5,
  });
  const bad = parseState({
    ...JSON.parse(JSON.stringify(s)),
    artifactTabs: [
      { artifactId: 5, spaceId: 424242 },
      { artifactId: 5 },
      { artifactId: 'x' },
      3,
    ],
    active: { kind: 'artifact', id: 77 },
  });
  assert.deepEqual(bad.artifactTabs, [{ artifactId: 5, spaceId: null }]);
  assert.notDeepEqual(bad.active, { kind: 'artifact', id: 77 });
  assert.deepEqual(parseState({}).artifactTabs, []);
});

// ---- Closed-but-kept pages ----------------------------------------------------

test('closing a tab in a Space keeps it as a closed link; outside a Space it is removed', () => {
  const { state, aId, freeId, spaceId } = build();
  const closed = closeTab(setActive(state, { kind: 'tab', id: aId }), aId);
  assert.equal(closed.tabs.find((t) => t.id === aId)?.closed, true);
  assert.equal(closed.tabs.find((t) => t.id === aId)?.spaceId, spaceId);
  // It is no longer something you can be on, and the selection moves.
  assert.ok(!navOrder(closed).some((r) => r.kind === 'tab' && r.id === aId));
  assert.notDeepEqual(closed.active, { kind: 'tab', id: aId });
  assert.equal(setActive(closed, { kind: 'tab', id: aId }), closed);
  // Closing it again changes nothing.
  assert.equal(closeTab(closed, aId), closed);
  // A page that is not in a Space is just removed.
  assert.equal(
    closeTab(state, freeId).tabs.some((t) => t.id === freeId),
    false,
  );
});

test('a closed link can be reopened, and can still be removed for good', () => {
  const { state, aId } = build();
  const closed = closeTab(state, aId);
  const reopened = reopenTab(closed, aId);
  assert.equal(reopened.tabs.find((t) => t.id === aId)?.closed, false);
  assert.deepEqual(reopened.active, { kind: 'tab', id: aId });
  const gone = removeTab(closed, aId);
  assert.equal(
    gone.tabs.some((t) => t.id === aId),
    false,
  );
});

test('a closed link stays in its Space through a save, is dropped from the list of tabs to visit, and cannot be active', () => {
  const { state, aId } = build();
  const closed = closeTab(state, aId);
  const loaded = parseState(JSON.parse(JSON.stringify(closed)));
  assert.equal(loaded.tabs.find((t) => t.id === aId)?.closed, true);
  // A tampered file cannot make a closed tab the selected one.
  const tampered = parseState({
    ...JSON.parse(JSON.stringify(closed)),
    active: { kind: 'tab', id: aId },
  });
  assert.notDeepEqual(tampered.active, { kind: 'tab', id: aId });
  // A tab outside any Space cannot be closed-but-kept.
  const odd = parseState({
    ...JSON.parse(JSON.stringify(state)),
    tabs: [
      {
        id: 50,
        url: 'https://x.example',
        title: '',
        favicon: null,
        spaceId: null,
        closed: true,
      },
    ],
  });
  assert.equal(odd.tabs[0].closed, false);
});

test('moving a closed link out of every Space opens it; ungrouping a Space opens its closed links', () => {
  const { state, aId, spaceId } = build();
  const closed = closeTab(state, aId);
  assert.equal(
    moveTab(closed, aId, null).tabs.find((t) => t.id === aId)?.closed,
    false,
  );
  const ungrouped = ungroupSpace(closed, spaceId);
  assert.equal(ungrouped.tabs.find((t) => t.id === aId)?.closed, false);
  assert.ok(navOrder(ungrouped).some((r) => r.kind === 'tab' && r.id === aId));
  // Deleting the Space deletes its closed links too.
  assert.equal(
    deleteSpace(closed, spaceId).state.tabs.some((t) => t.id === aId),
    false,
  );
});

test('a closed link is found by the address the assistant was told (no query), and only closed ones', () => {
  const { state, aId, spaceId } = build();
  const withQuery = updateTab(state, aId, {
    url: 'https://a.example/page?token=SECRET',
  });
  const closed = closeTab(withQuery, aId);
  const found = findClosedTabByAddress(closed, 'https://a.example/page');
  assert.equal(found?.id, aId);
  assert.equal(found?.spaceId, spaceId);
  assert.equal(
    findClosedTabByAddress(closed, 'https://A.example/page/')?.id,
    aId,
  );
  // An open page is not a closed link, and other addresses do not match.
  assert.equal(
    findClosedTabByAddress(withQuery, 'https://a.example/page'),
    undefined,
  );
  assert.equal(
    findClosedTabByAddress(closed, 'https://a.example/other'),
    undefined,
  );
  assert.equal(findClosedTabByAddress(closed, 'not an address'), undefined);
});

test('a new tab can be put right after another one, in the same place in the list', () => {
  const { state, freeId, aId } = build();
  const after = addTab(state, {
    url: 'https://new.example',
    spaceId: null,
    after: freeId,
  });
  assert.equal(
    after.state.tabs[state.tabs.findIndex((t) => t.id === freeId) + 1].id,
    after.id,
  );
  assert.equal(after.state.tabs.length, state.tabs.length + 1);
  // An unknown tab means the end of the list.
  const end = addTab(state, { url: 'https://end.example', after: 99999 });
  assert.equal(end.state.tabs.at(-1)?.id, end.id);
  assert.ok(aId > 0);
});

test('a new tab has no web address, survives a restart, and closing it just removes it', () => {
  let state = defaultState();
  const space = addSpace(state);
  state = space.state;
  const added = addTab(state, { url: NEW_TAB_PAGE, spaceId: space.id });
  assert.equal(isNewTabPage(NEW_TAB_PAGE), true);
  assert.equal(isNewTabPage('https://a.com/'), false);
  const restored = parseState(JSON.parse(JSON.stringify(added.state)));
  assert.equal(restored.tabs.find((t) => t.id === added.id)?.url, NEW_TAB_PAGE);
  // It becomes an ordinary web tab when you go somewhere.
  const gone = updateTab(added.state, added.id, { url: 'https://a.com/' });
  assert.equal(gone.tabs.find((t) => t.id === added.id)?.url, 'https://a.com/');
  // Closing it in a Space does not keep it as a closed link.
  const closed = closeTab(added.state, added.id);
  assert.equal(
    closed.tabs.some((t) => t.id === added.id),
    false,
  );
  // Other odd addresses are still refused.
  const junk = parseState({
    ...JSON.parse(JSON.stringify(added.state)),
    tabs: [
      {
        id: 99,
        url: 'about:blank',
        title: '',
        favicon: null,
        spaceId: null,
        closed: false,
      },
    ],
  });
  assert.equal(junk.tabs.length, 0);
});
