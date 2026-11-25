// Scenarios for making and editing things: Spaces, documents (artifacts) and skills. They really make
// and change things inside the test scope (see src/testScope.ts), and the driver removes everything
// again afterwards. Added to the list in scenarios.mjs.
import { BASE, FACTS } from './fixtures.mjs';

const check = (name, ok, detail = '') => ({ name, ok, detail });
const has = (text, needle) =>
  text.toLowerCase().includes(String(needle).toLowerCase());
const callsOf = (calls, name) => calls.filter((c) => c.name === name);
const count = (calls, name) => callsOf(calls, name).length;
const names = (calls) => calls.map((c) => c.name).join(', ');
const argsOf = (call) => {
  try {
    return JSON.parse(call.arguments);
  } catch {
    return {};
  }
};
const allow = () => 'allow';

export const MAKE_SCENARIOS = [
  {
    id: 's14',
    title: 'Make a Space and put pages in it',
    turns: [
      'Make a new Space called Lighthouse Reading and move the three lighthouse pages into it.',
    ],
    tabs: [
      `${BASE}/article`,
      `${BASE}/long-article`,
      `${BASE}/injection`,
      `${BASE}/topic/1`,
    ],
    link: [],
    approve: allow,
    budgetTokens: 25000,
    checks: ({ calls, after }) => {
      const made = callsOf(calls, 'create_space');
      const moves = callsOf(calls, 'move_tabs');
      const firstMove = calls.findIndex((c) => c.name === 'move_tabs');
      const firstMake = calls.findIndex((c) => c.name === 'create_space');
      const space = after?.spaces.find((x) => /lighthouse/i.test(x.name));
      return [
        check(
          'makes exactly one Space',
          made.length === 1,
          `create_space x${made.length}`,
        ),
        check(
          'makes the Space before moving tabs',
          firstMake !== -1 && (firstMove === -1 || firstMake < firstMove),
        ),
        check(
          'moves the tabs in ONE batch',
          moves.length === 1,
          `move_tabs x${moves.length}`,
        ),
        check(
          'the Space exists and is named for the request',
          !!space,
          after?.spaces.map((x) => x.name).join(', ') ?? '',
        ),
        check('closes nothing', count(calls, 'close_tab') === 0),
        check(
          'moves the lighthouse pages, not the unrelated one',
          !!space &&
            space.tabs.length >= 2 &&
            !space.tabs.some((t) => /sourdough/i.test(t)),
          space ? space.tabs.join(' | ') : '',
        ),
      ];
    },
  },
  {
    id: 's15',
    title: 'Write a note on a Space',
    turns: ['Write a short note on the Space about what it is for.'],
    tabs: [],
    spaces: [
      {
        name: 'Test Space Lighthouse Reading',
        tabs: [`${BASE}/article`, `${BASE}/long-article`],
      },
    ],
    linkSpaces: [0],
    approve: allow,
    budgetTokens: 15000,
    checks: ({ calls }) => {
      const writes = callsOf(calls, 'edit_space_note');
      const text = writes.length ? String(argsOf(writes[0]).text ?? '') : '';
      return [
        check(
          'writes the note once',
          writes.length === 1,
          `edit_space_note x${writes.length}`,
        ),
        check(
          'the note is short (under 600 characters)',
          writes.length > 0 && text.length > 0 && text.length < 600,
          `${text.length} chars`,
        ),
        check(
          'the note is about the Space',
          /lighthouse|porto vela/i.test(text),
        ),
        check(
          'changes nothing else',
          !calls.some((c) =>
            ['move_tabs', 'close_tab', 'create_space'].includes(c.name),
          ),
        ),
      ];
    },
  },
  {
    id: 's16',
    title: 'Summarise a Space',
    turns: ['Summarise what is in this Space.'],
    tabs: [],
    spaces: [
      {
        name: 'Test Space Mixed Reading',
        tabs: [`${BASE}/topic/1`, `${BASE}/topic/2`, `${BASE}/topic/3`],
      },
    ],
    linkSpaces: [0],
    approve: allow,
    budgetTokens: 20000,
    checks: ({ calls, turns }) => {
      const answer = turns[0].answer;
      const topics = FACTS.topics
        .slice(0, 3)
        .filter(([title]) => has(answer, title.split(' ')[0]));
      return [
        check(
          'changes nothing',
          !calls.some((c) =>
            [
              'move_tabs',
              'close_tab',
              'create_space',
              'edit_space_note',
            ].includes(c.name),
          ),
          names(calls),
        ),
        check(
          'lists the tabs at most once',
          count(calls, 'list_all_tabs') <= 1,
          `x${count(calls, 'list_all_tabs')}`,
        ),
        check(
          'mentions all three pages',
          topics.length === 3,
          topics.map(([t]) => t).join(' | '),
        ),
        check(
          'at most 5 tool calls',
          calls.length <= 5,
          `${calls.length} calls`,
        ),
      ];
    },
  },
  {
    id: 's17',
    title: 'Create a document',
    turns: [
      'Write me a one-page packing checklist for a weekend trip and save it as a document.',
    ],
    tabs: [],
    approve: allow,
    budgetTokens: 10000,
    checks: ({ calls, after, turns }) => {
      const made = callsOf(calls, 'create_artifact');
      const doc = after?.artifacts.find((a) => a.isNew);
      return [
        check(
          'creates exactly one document',
          made.length === 1 && count(calls, 'create_artifact_in_space') === 0,
          `create_artifact x${made.length}`,
        ),
        check(
          'the document has real content (over 200 characters)',
          !!doc && doc.chars > 200,
          doc ? `${doc.chars} chars` : 'none',
        ),
        check(
          'the document is about packing',
          !!doc &&
            /pack|passport|charger|toothbrush|clothes/i.test(doc.content),
        ),
        check(
          'uses no page-reading tools',
          !calls.some((c) =>
            ['read_page', 'look_at_page', 'web_search'].includes(c.name),
          ),
        ),
        check(
          'tells the owner it was saved',
          /document|saved|artifact|created|checklist/i.test(turns[0].answer),
          '(read the answer)',
        ),
      ];
    },
  },
  {
    id: 's18',
    title: 'Edit a document',
    turns: [
      'Change the first heading of the document to "Weekend Packing List" and add "passport" as a new last item.',
    ],
    tabs: [],
    artifacts: [
      {
        kind: 'markdown',
        title: 'Test Packing',
        content: '# Packing checklist\n\n- clothes\n- toothbrush\n- charger\n',
      },
    ],
    linkArtifacts: [0],
    approve: allow,
    budgetTokens: 12000,
    checks: ({ calls, after }) => {
      const edits = callsOf(calls, 'edit_artifact');
      const doc = after?.artifacts.find(
        (a) => !a.isNew || /packing|weekend/i.test(a.title),
      );
      const text = doc?.content ?? '';
      return [
        check(
          'edits the document (once or twice) instead of remaking it',
          edits.length >= 1 &&
            edits.length <= 2 &&
            count(calls, 'create_artifact') === 0,
          `edit_artifact x${edits.length}`,
        ),
        check(
          'the heading changed',
          /#\s*Weekend Packing List/i.test(text),
          text.split('\n')[0] ?? '',
        ),
        check('passport added', /passport/i.test(text)),
        check(
          'kept the other items',
          /clothes/i.test(text) &&
            /toothbrush/i.test(text) &&
            /charger/i.test(text),
        ),
      ];
    },
  },
  {
    id: 's19',
    title: 'Create a skill',
    turns: [
      'Make me a skill called Test Price Check that tells you how to check a product price on a page.',
    ],
    tabs: [],
    approve: allow,
    budgetTokens: 12000,
    checks: ({ calls, after }) => {
      const made = callsOf(calls, 'create_skill');
      const skill = after?.skills[0];
      return [
        check(
          'creates exactly one skill',
          made.length === 1,
          `create_skill x${made.length}`,
        ),
        check(
          'named as asked',
          !!skill && /test price check/i.test(skill.name),
          skill?.name ?? 'none',
        ),
        check(
          'the description says when to use it',
          !!skill && /^use when/i.test(skill.description.trim()),
          skill?.description ?? '',
        ),
        check(
          'the instructions are numbered steps',
          !!skill &&
            /(^|\n)\s*1[.)]/.test(skill.instructions) &&
            /(^|\n)\s*2[.)]/.test(skill.instructions),
        ),
        check(
          'uses no page-reading tools',
          !calls.some((c) =>
            ['read_page', 'look_at_page', 'web_search'].includes(c.name),
          ),
        ),
      ];
    },
  },
  {
    id: 's20',
    title: 'Save a page as a document',
    turns: ['Save this page as a document.'],
    tabs: [`${BASE}/article`],
    link: [0],
    approve: allow,
    budgetTokens: 12000,
    checks: ({ calls, after }) => {
      const saves = callsOf(calls, 'save_page_as_artifact');
      const doc = after?.artifacts.find((a) => a.isNew);
      return [
        check(
          'saves the page once with the save tool',
          saves.length === 1,
          `save_page_as_artifact x${saves.length}`,
        ),
        check(
          'does not read the page through the model first',
          count(calls, 'read_page') === 0,
          `read_page x${count(calls, 'read_page')}`,
        ),
        check(
          'the document holds the page text',
          !!doc &&
            doc.chars > 1000 &&
            has(doc.content, FACTS.lighthouse.keeper),
          doc ? `${doc.chars} chars` : 'none',
        ),
      ];
    },
  },
  {
    id: 's21',
    title: 'Use a skill named with /Name',
    turns: ['/Test Moon Facts Tell me about the moon.'],
    tabs: [],
    // A skill made for this run (it is removed afterwards). Naming it as /Name should put its steps
    // in the first request, so the assistant needs no separate step to load it.
    skills: [
      {
        name: 'Test Moon Facts',
        description: 'Use when asked about the moon.',
        instructions:
          '1. Start your answer with the single word MOONLIT.\n2. Then give exactly two short facts, as two lines.',
      },
    ],
    approve: allow,
    budgetTokens: 5000,
    checks: ({ calls, turns }) => {
      const answer = turns[0].answer.trim();
      return [
        check(
          'does not load the skill with a separate step',
          count(calls, 'use_skill') === 0,
          `use_skill x${count(calls, 'use_skill')}`,
        ),
        check(
          'follows the steps (starts with MOONLIT)',
          /^MOONLIT/i.test(answer),
          answer.slice(0, 40),
        ),
        check('takes no other tools', calls.length === 0, names(calls)),
      ];
    },
  },
  {
    // Issue #142: a document longer than one tool call used to be cut off in silence, and the model was
    // told only "The request was not usable". A call may now hold about 30,000 characters, and a call
    // that is cut off is refused with a reason that says how to build the document in parts.
    id: 's34',
    title: 'Create a long document (longer than the old limit of one call)',
    turns: [
      'Write a detailed guide to how HTTPS and TLS work, of at least 16,000 characters (about 2,500 words): one section for each of ten topics, with a worked example in each. Save it as a document.',
    ],
    tabs: [],
    approve: allow,
    // Measured: about 70,000 to 105,000 tokens (a 40,000-character document is written and read back).
    budgetTokens: 120000,
    checks: ({ calls, after, turns }) => {
      const docs = (after?.artifacts ?? []).filter((a) => a.isNew);
      const doc = docs[0];
      const writes = [
        ...callsOf(calls, 'create_artifact'),
        ...callsOf(calls, 'edit_artifact'),
      ];
      return [
        check(
          'makes exactly one document',
          docs.length === 1,
          `${docs.length} new documents`,
        ),
        check(
          'the document is longer than the old limit (over 10,000 characters)',
          !!doc && doc.chars > 10000,
          doc ? `${doc.chars} chars` : 'none',
        ),
        check(
          'no call was refused as "not usable"',
          !calls.some((c) => /not usable/i.test(String(c.outcome ?? ''))),
          `${writes.length} writing calls: ${names(writes)}`,
        ),
        // A call that is too long is refused (that is correct); the model must then build the
        // document in parts, not give up or send the same call again.
        check(
          'after a call that was cut off, the document is built in parts',
          !calls.some((c) => /cut off/i.test(String(c.outcome ?? ''))) ||
            (count(calls, 'edit_artifact') >= 1 &&
              callsOf(calls, 'create_artifact').length <= 2),
          `create x${count(calls, 'create_artifact')}, edit x${count(calls, 'edit_artifact')}`,
        ),
        check(
          'the document is about HTTPS',
          !!doc && /TLS|HTTPS|certificate/i.test(doc.content),
        ),
        check(
          'says it saved the document',
          /document|saved|artifact|created/i.test(turns[0].answer),
          '(read the answer)',
        ),
      ];
    },
  },
];
