import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOOL_CATALOG } from './toolPolicy.ts';
import {
  commonLevel,
  defaultToolSettings,
  describeTools,
  detectPreset,
  filterRows,
  groupLevels,
  presetLevels,
  summarizeRows,
  withLevel,
  withLevels,
} from './toolSettings.ts';

const rowsOf = (settings = defaultToolSettings()) => describeTools(settings);

test('the Balanced preset is exactly the defaults, and is what a fresh install is at', () => {
  const levels = presetLevels('balanced');
  for (const tool of TOOL_CATALOG) {
    assert.equal(levels[tool.name], tool.defaultLevel);
  }
  assert.equal(detectPreset(rowsOf()), 'balanced');
  // Applying it clears every choice (only differences from the default are kept).
  const messy = withLevel(defaultToolSettings(), 'click', 'always');
  assert.deepEqual(withLevels(messy, levels).levels, {});
});

test('Cautious asks for everything except the few tools that only touch the conversation', () => {
  const levels = presetLevels('cautious');
  for (const name of [
    'list_linked_tabs',
    'scroll',
    'offer_choices',
    'use_skill',
  ]) {
    assert.equal(levels[name], 'always', name);
  }
  for (const name of [
    'read_page',
    'click',
    'list_all_tabs',
    'search_history',
    'create_skill',
  ]) {
    assert.equal(levels[name], 'ask', name);
  }
  const set = withLevels(defaultToolSettings(), levels);
  assert.equal(detectPreset(rowsOf(set)), 'cautious');
});

test('Hands-off lets tools go ahead unless risky, keeps what already just happens, and never turns anything off', () => {
  const levels = presetLevels('hands-off');
  assert.equal(levels.read_page, 'always'); // already just happened
  assert.equal(levels.click, 'if-safe');
  assert.ok(Object.values(levels).every((l) => l !== 'never'));
  const set = withLevels(defaultToolSettings(), levels);
  assert.equal(detectPreset(rowsOf(set)), 'hands-off');
});

test('changing one tool makes the settings "custom"; changing it back matches a preset again', () => {
  const custom = withLevel(defaultToolSettings(), 'click', 'never');
  assert.equal(detectPreset(rowsOf(custom)), 'custom');
  const back = withLevel(custom, 'click', 'ask');
  assert.equal(detectPreset(rowsOf(back)), 'balanced');
});

test('the summary line counts tools by level and leaves out zeros', () => {
  const rows = rowsOf();
  const text = summarizeRows(rows);
  assert.ok(text.startsWith(`${rows.length} tools · `));
  assert.ok(!text.includes('turned off'));
  const off = summarizeRows(
    rowsOf(withLevel(defaultToolSettings(), 'click', 'never')),
  );
  assert.match(off, /1 turned off/);
  assert.equal(summarizeRows([{ level: 'ask' }]), '1 tool · 1 ask first');
});

test('searching matches every word in the name, title or description', () => {
  const rows = rowsOf();
  assert.ok(
    filterRows(rows, 'screenshot').some((r) => r.name === 'screenshot_page'),
  );
  assert.ok(filterRows(rows, 'close tab').some((r) => r.name === 'close_tab'));
  assert.equal(filterRows(rows, 'zzzz nothing like this').length, 0);
  assert.equal(filterRows(rows, '   ').length, rows.length);
  assert.ok(
    filterRows(rows, 'HISTORY').every((r) =>
      /history/i.test(`${r.title} ${r.summary} ${r.name}`),
    ),
  );
});

test('a group shows its common level, or none when mixed, and can be set all at once', () => {
  const rows = rowsOf();
  const skills = rows.filter((r) => r.group === 'skills');
  assert.equal(commonLevel(skills), null); // use_skill always; make and change ask
  assert.equal(commonLevel([]), null);
  const all = groupLevels(rows, 'skills', 'never');
  assert.deepEqual(Object.keys(all).sort(), [
    'create_skill',
    'edit_skill',
    'use_skill',
  ]);
  const set = describeTools(withLevels(defaultToolSettings(), all));
  assert.equal(commonLevel(set.filter((r) => r.group === 'skills')), 'never');
  // Other groups are untouched.
  assert.equal(set.find((r) => r.name === 'read_page')?.level, 'always');
});

test('unknown tools in a bulk change are ignored', () => {
  const settings = withLevels(defaultToolSettings(), {
    not_a_tool: 'never',
    click: 'never',
  });
  assert.deepEqual(settings.levels, { click: 'never' });
});
