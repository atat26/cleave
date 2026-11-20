// Scenarios about planning a task up front (docs/pipeline/changes-13.md): a task with several separate
// pieces gets a plan the owner reviews first; a short task gets none; a plan the owner declines stops
// the work. Run each with and without planning (AIB_NO_PLAN=1) to see what planning costs and gives.
// Added to the list in scenarios.mjs. They really make a document and a Space inside the test scope
// (see src/testScope.ts); the driver removes them again afterwards.
import { BASE } from './fixtures.mjs';

const check = (name, ok, detail = '') => ({ name, ok, detail });
const has = (text, needle) =>
  text.toLowerCase().includes(String(needle).toLowerCase());
const callsOf = (calls, name) => calls.filter((c) => c.name === name);
const argsOf = (call) => {
  try {
    return JSON.parse(call.arguments);
  } catch {
    return {};
  }
};
// With AIB_NO_PLAN=1 the assistant has no planning tool, so the plan checks cannot apply.
const planningOn = () => process.env.AIB_NO_PLAN !== '1';
const TOOL_NAME =
  /\b(read_page|read_pages|look_at_page|move_tabs|create_space|create_artifact|web_search|list_all_tabs|set_plan)\b/i;

const FOUR_PAGES = [1, 2, 3, 4].map((n) => `${BASE}/topic/${n}`);
const BIG_TASK =
  'Read each of my four open pages, write a one-line summary of each, save the four summaries together in a new document called Reading Notes, then make a Space called Reading Notes and move the four tabs into it.';
const WORK_TOOLS = [
  'read_page',
  'read_pages',
  'look_at_page',
  'create_artifact',
  'create_artifact_in_space',
  'create_space',
  'move_tabs',
];

export const PLAN_SCENARIOS = [
  {
    id: 's30',
    title: 'A task with several pieces gets a sensible plan, then is done',
    turns: [BIG_TASK],
    tabs: FOUR_PAGES,
    link: [0, 1, 2, 3],
    approve: () => 'allow',
    budgetTokens: 45000,
    checks: ({ calls, asks, after, turns }) => {
      const plans = callsOf(calls, 'set_plan');
      const first = plans.length > 0 ? argsOf(plans[0]) : {};
      const steps = Array.isArray(first.steps) ? first.steps : [];
      const lastDone = plans.reduce(
        (n, c) =>
          c.status === 'ok' && typeof argsOf(c).done === 'number'
            ? Math.max(n, argsOf(c).done)
            : n,
        0,
      );
      const others = calls.filter((c) => c.name !== 'set_plan').length;
      const space = after?.spaces.find((s) => /reading notes/i.test(s.name));
      const doc = after?.artifacts.find((a) => a.isNew);
      const on = planningOn();
      return [
        check(
          'states a plan before the work starts',
          on
            ? plans.length > 0 &&
                calls.findIndex((c) => WORK_TOOLS.includes(c.name)) >
                  calls.indexOf(plans[0])
            : null,
          `set_plan x${plans.length}`,
        ),
        check(
          'the owner is asked about the plan',
          on ? asks.some((a) => a.name === 'set_plan') : null,
          '',
        ),
        check(
          'the plan has 3 to 6 steps',
          on ? steps.length >= 3 && steps.length <= 6 : null,
          `${steps.length} steps: ${steps.join(' | ')}`,
        ),
        check(
          'no step is a tool call',
          on ? !steps.some((s) => TOOL_NAME.test(String(s))) : null,
          steps.join(' | '),
        ),
        check(
          'no more steps than tool calls (a step is not a call)',
          on ? steps.length > 0 && steps.length <= others : null,
          `${steps.length} steps, ${others} other calls`,
        ),
        check(
          'updates the plan a few times, not at every call',
          on ? plans.length >= 2 && plans.length <= 8 : null,
          `set_plan x${plans.length}`,
        ),
        check(
          'reports the progress through to (nearly) the end',
          on ? steps.length > 0 && lastDone >= steps.length - 1 : null,
          `${lastDone} of ${steps.length}`,
        ),
        check(
          'makes the document with all four summaries',
          !!doc &&
            ['sourdough', 'lisbon', 'gpu', 'python'].filter((w) =>
              has(doc.content, w),
            ).length >= 3,
          doc ? `${doc.chars} chars` : 'no new document',
        ),
        check(
          'makes the Space with the four tabs',
          !!space && space.tabs.length >= 4,
          space ? `${space.tabs.length} tabs` : 'no Space',
        ),
        check(
          'says what was done',
          /document|space|notes|summar/i.test(turns[0].answer),
          '(read the answer)',
        ),
      ];
    },
  },
  {
    id: 's31',
    title: 'A short task with two reads gets no plan',
    turns: [
      'Read my two open pages and tell me which one is about cooking, in one sentence.',
    ],
    tabs: [`${BASE}/topic/1`, `${BASE}/topic/2`],
    link: [0, 1],
    approve: () => 'allow',
    budgetTokens: 14000,
    checks: ({ calls, turns }) => [
      check(
        'makes no plan',
        callsOf(calls, 'set_plan').length === 0,
        `set_plan x${callsOf(calls, 'set_plan').length}`,
      ),
      check(
        'answers right (the sourdough page)',
        has(turns[0].answer, 'sourdough') || has(turns[0].answer, 'first'),
        '(read the answer)',
      ),
    ],
  },
  {
    id: 's32',
    title: 'A plan the owner declines: no work is started',
    turns: [BIG_TASK],
    tabs: FOUR_PAGES,
    link: [0, 1, 2, 3],
    // Everything is allowed except the plan itself.
    approve: ({ name }) => (name === 'set_plan' ? 'deny' : 'allow'),
    budgetTokens: 15000,
    checks: ({ calls, turns, after }) => {
      const worked = calls.filter((c) => WORK_TOOLS.includes(c.name));
      const plans = callsOf(calls, 'set_plan');
      const on = planningOn();
      return [
        check(
          'asked for a plan, and was declined',
          on
            ? plans.length >= 1 && plans.every((c) => c.status === 'declined')
            : null,
          plans.map((c) => c.status).join(', '),
        ),
        check(
          'then starts no work, and does not plan again by itself',
          on ? worked.length === 0 && plans.length <= 2 : null,
          worked.map((c) => c.name).join(', ') || 'no work',
        ),
        check(
          'makes nothing',
          on ? !(after?.artifacts.some((a) => a.isNew) ?? false) : null,
          '',
        ),
        check(
          'tells the owner, or asks how to go on',
          on ? turns[0].answer.trim() !== '' : null,
          '(read the answer)',
        ),
      ];
    },
  },
];
