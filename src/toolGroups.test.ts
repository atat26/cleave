import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  definitionsFor,
  groupOf,
  GROUPS,
  groupsForMessage,
  groupsUsed,
  isGroup,
  MORE_TOOLS,
  moreToolsDefinition,
} from './toolGroups.ts';
import type { ToolGroup } from './toolGroups.ts';
import type { ToolDefinition } from './openrouter.ts';

const def = (name: string): ToolDefinition => ({
  name,
  description: name,
  parameters: { type: 'object', properties: {} },
});
const ALL = [
  'list_linked_tabs',
  'read_page',
  'look_at_page',
  'find_in_page',
  'read_tables',
  'offer_choices',
  'use_skill',
  'web_search',
  'click',
  'type_text',
  'list_all_tabs',
  'move_tabs',
  'create_space',
  'create_artifact',
  'edit_artifact',
  'create_skill',
  'search_history',
  'screenshot_page',
].map(def);

const groups = (text: string): string[] => [...groupsForMessage(text)].sort();

test('the scenario requests point to the groups they need', () => {
  const cases: [string, ToolGroup[]][] = [
    // A plain question needs nothing beyond the core.
    [
      'What is the difference between a cookie and a token? Answer in a few sentences.',
      [],
    ],
    ['Summarise this page for me.', []],
    ['What does the Pro plan cost per month?', []],
    [
      'Fill in the contact form with my name (Alex Doe) and my email (alex@example.com).',
      ['act'],
    ],
    ['Organise my open tabs into Spaces by topic.', ['tabs']],
    ['Close the old ones.', ['tabs']],
    [
      'Make a new Space called Lighthouse Reading and move the three lighthouse pages into it.',
      ['tabs'],
    ],
    ['Summarise what is in this Space.', ['tabs']],
    [
      'Write me a one-page packing checklist for a weekend trip and save it as a document.',
      ['docs'],
    ],
    [
      'Make me a skill called Test Price Check that tells you how to check a product price on a page.',
      ['docs', 'skills'],
    ],
    ['Save this page as a document.', ['docs']],
    ['What did I read about graphics cards last week?', ['memory']],
    ['Take a screenshot of this page and describe it.', ['pictures']],
    [
      'Look at the chart on this page and tell me which month is highest.',
      ['pictures'],
    ],
    ['What does the diagram on this page show?', ['pictures']],
    ['Search the web for the best trail shoes', ['web']],
    [
      'Read my four pages, then make a Space and move the tabs into it.',
      ['plan'],
    ],
    ['1. Read the pages\n2. Write a summary\n3. Save it', ['plan']],
  ];
  for (const [text, expected] of cases) {
    for (const group of expected) {
      assert.ok(
        groups(text).includes(group),
        `${text} should include ${group}, got ${groups(text)}`,
      );
    }
  }
  // And a plain question really gets none.
  assert.deepEqual(
    groups(
      'What is the difference between a cookie and a token? Answer in a few sentences.',
    ),
    [],
  );
  assert.deepEqual(groups('What does the Pro plan cost per month?'), []);
  // A short task with no sequence does not open planning.
  assert.ok(
    !groups(
      'Read my two open pages and tell me which is about cooking.',
    ).includes('plan'),
  );
});

test('tools are in groups, and the core is everything else', () => {
  assert.equal(groupOf('read_page'), null);
  assert.equal(groupOf('offer_choices'), null);
  assert.equal(groupOf('type_text'), 'act');
  assert.equal(groupOf('create_space'), 'tabs');
  assert.equal(groupOf('create_skill'), 'skills');
  assert.equal(groupOf('set_plan'), 'plan');
  assert.equal(groupOf('nonsense'), null);
  assert.equal(isGroup('docs'), true);
  assert.equal(isGroup('everything'), false);
  assert.equal(isGroup(3), false);
});

test('tools used earlier in the chat keep their groups', () => {
  assert.deepEqual(
    [
      ...groupsUsed(['read_page', 'type_text', 'move_tabs', 'type_text']),
    ].sort(),
    ['act', 'tabs'],
  );
  assert.deepEqual([...groupsUsed([])], []);
});

test('only the core and the open groups are sent, with a way to ask for more', () => {
  const names = (open: ToolGroup[], everything = false) =>
    definitionsFor(ALL, new Set(open), everything).map((d) => d.name);
  const core = names([]);
  assert.ok(core.includes('read_page'));
  assert.ok(core.includes('use_skill'));
  assert.ok(core.includes(MORE_TOOLS));
  assert.equal(core.includes('type_text'), false);
  assert.equal(core.includes('create_artifact'), false);
  // An open group adds its tools and leaves the others out.
  const act = names(['act']);
  assert.ok(act.includes('click') && act.includes('type_text'));
  assert.equal(act.includes('move_tabs'), false);
  // With every group open there is nothing left to ask for.
  const full = names([...GROUPS]);
  assert.equal(full.includes(MORE_TOOLS), false);
  assert.equal(full.length, ALL.length);
  // "Everything" is the old behaviour, for comparing.
  assert.equal(names([], true).length, ALL.length);
});

test('the more-tools tool lists only the groups that are closed', () => {
  const tool = moreToolsDefinition(new Set<ToolGroup>(['act', 'tabs']));
  assert.equal(tool.name, MORE_TOOLS);
  assert.ok(!tool.description.includes('act ('));
  assert.ok(tool.description.includes('docs ('));
  const enumValues = (
    tool.parameters as { properties: { group: { enum: string[] } } }
  ).properties.group.enum;
  assert.deepEqual(enumValues, [
    'web',
    'docs',
    'skills',
    'memory',
    'pictures',
    'plan',
  ]);
});
