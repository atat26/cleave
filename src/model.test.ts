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
  defaultState,
  deleteSpace,
  moveTab,
  navOrder,
  parseState,
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
      },
      {
        id: 2,
        url: 'javascript:alert(1)',
        title: 'x',
        favicon: null,
        spaceId: null,
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
