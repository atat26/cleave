// The plan of a task. For a request with several separate pieces of work, the assistant first states
// the pieces as a plan; the user reviews it before any work starts (and every time the steps change);
// then the chat shows "Step 2 of 5" and fills in the ticks as the assistant reports its progress.
//
// What a STEP is: one piece of the task that gets the user closer to what they asked for ("Find the
// three cheapest items", "Add them to the list"). It is not a tool call: reading a page, clicking or
// searching is not a step on its own, and one step often takes several tool calls. A plan is only for a
// task with several such pieces, never for a question, a single action or a short task.
//
// Rules this file keeps:
//   - 3 to 8 steps, each a short line (70 characters). A step that names a tool (read_page, look_at_page...)
//     is refused: that is how a model would write tool calls as steps.
//   - A new plan, and any change to the steps, waits for the user's answer, even after "Allow the rest of
//     this reply". Only moving the progress forward (same steps, more done) goes ahead by itself.
//   - A plan never gives permission for anything: every action still asks as it always did.
//   - The steps are the model's words, so they are shown as plain text, cleaned and cut.
// Pure code with no Electron, so every rule can be tested.
import { cleanLabel } from './chatLinks.ts';
import type { Plan } from './agentActions.ts';
import type { TaskPlan } from './chats.ts';
import { MAX_PLAN_STEP_CHARS, MAX_PLAN_STEPS } from './chats.ts';
import type { ToolOutcome } from './agentTools.ts';
import type { ToolCall, ToolDefinition } from './openrouter.ts';
import { TOOL_CATALOG } from './toolPolicy.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

export const SET_PLAN = 'set_plan';
export const MIN_PLAN_STEPS = 3;
export { MAX_PLAN_STEPS, MAX_PLAN_STEP_CHARS };
export const MAX_REASON_CHARS = 140;
// Calls to set_plan in one reply (a plan, its changes and its progress updates).
export const MAX_PLAN_CALLS = 12;

// AIB_NO_PLAN=1 turns planning off (no tool, no rule), to compare results with and without it
// (docs/pipeline). Anything else leaves it on.
export const planningEnabled = (): boolean =>
  typeof process === 'undefined' || process.env?.AIB_NO_PLAN !== '1';

export const PLAN_DEFINITION: ToolDefinition = {
  name: SET_PLAN,
  description: `Plan a task that has several separate pieces of work before you start it, and keep the plan up to date; the user reviews the plan and every change to it. A STEP is one piece of the task that gets the user closer to what they asked for (for example "Find the three cheapest items"), never a tool call: one step often takes several tool calls. Only for a task with about four or more such pieces; never for a question, a single action or a short task. When you finish a step, call this again with the same steps and "done" set to how many are finished, in the same step as your next tool call (not on its own). The first time, and whenever you change the steps (give the new steps and a short reason), call it ALONE and wait for the answer before any other work.`,
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: `${MIN_PLAN_STEPS} to ${MAX_PLAN_STEPS} short steps (at most ${MAX_PLAN_STEP_CHARS} characters each), in plain words for the user.`,
      },
      done: {
        type: 'integer',
        description: 'How many steps are finished (0 when you start).',
      },
      reason: {
        type: 'string',
        description:
          'When you change the steps of an existing plan: why, in one short sentence.',
      },
    },
    required: ['steps'],
    additionalProperties: false,
  },
};

// The names of tools written with an underscore (read_page, look_at_page...): a step must not contain one.
const TOOL_NAMES: readonly string[] = TOOL_CATALOG.map(
  (tool) => tool.name,
).filter((name) => name.includes('_'));

const MISTAKE = `A step is a piece of the task, not a tool call: write each step in plain words for the user (for example "Find the three cheapest items"), and use ${MIN_PLAN_STEPS} to ${MAX_PLAN_STEPS} of them. If the task is only a question, a single action or a short task, do not make a plan: just do it.`;

type Parsed =
  | { ok: true; steps: string[]; done: number | null; reason: string }
  | { ok: false; message: string };

function parse(call: ToolCall): Parsed {
  let args: unknown;
  try {
    args = JSON.parse(call.arguments || '{}');
  } catch {
    return { ok: false, message: 'The request could not be understood.' };
  }
  if (typeof args !== 'object' || args === null) {
    return { ok: false, message: 'The request could not be understood.' };
  }
  const { steps: raw, done, reason } = args as Record<string, unknown>;
  if (!Array.isArray(raw) || !raw.every((s) => typeof s === 'string')) {
    return {
      ok: false,
      message: `steps must be a list of short pieces of text. ${MISTAKE}`,
    };
  }
  const steps = (raw as string[])
    // (cleanLabel adds an ellipsis after the limit, so one less keeps a step within the stored limit.)
    .map((s) => cleanLabel(s, MAX_PLAN_STEP_CHARS - 1))
    .filter((s) => s !== '');
  if (steps.length < MIN_PLAN_STEPS || steps.length > MAX_PLAN_STEPS) {
    return {
      ok: false,
      message: `A plan needs ${MIN_PLAN_STEPS} to ${MAX_PLAN_STEPS} steps (you gave ${steps.length}). ${MISTAKE}`,
    };
  }
  const lowered = steps.map((s) => s.toLowerCase());
  const named = TOOL_NAMES.find((name) =>
    lowered.some((s) => s.includes(name)),
  );
  if (named !== undefined) {
    return {
      ok: false,
      message: `A step mentions the tool "${named}". ${MISTAKE}`,
    };
  }
  if (
    done !== undefined &&
    (typeof done !== 'number' || !Number.isInteger(done))
  ) {
    return { ok: false, message: 'done must be a whole number.' };
  }
  return {
    ok: true,
    steps,
    done: typeof done === 'number' ? done : null,
    reason:
      typeof reason === 'string' ? cleanLabel(reason, MAX_REASON_CHARS) : '',
  };
}

const sameSteps = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((step, i) => step === b[i]);

// The lines of the plan for the card: numbered, and (for a change) marked new or moved, then the removed ones.
export function planLines(
  steps: readonly string[],
  before: readonly string[] | null,
): string[] {
  const lines = steps.map((step, i) => {
    const same = before?.[i] === step;
    const moved = before !== null && !same && before.includes(step);
    const added = before !== null && !same && !moved;
    return `${i + 1}. ${step}${added ? ' (new)' : moved ? ' (moved)' : ''}`;
  });
  if (before !== null) {
    for (const old of before) {
      if (!steps.includes(old)) lines.push(`Removed: ${old}`);
    }
  }
  return lines;
}

// The lines kept with the step (and shown when it is opened): what is done, what is next.
export function progressLines(plan: TaskPlan): string[] {
  return plan.steps.map((step, i) => {
    const mark = i < plan.done ? '✓' : i === plan.done ? '→' : '·';
    return `${mark} ${i + 1}. ${step}`;
  });
}

export interface TaskPlanTools {
  plan(call: ToolCall): Plan;
  describe(call: ToolCall): string;
  run(call: ToolCall): Promise<ToolOutcome>;
  // The plan the user has approved so far in this reply, or null.
  current(): TaskPlan | null;
}

export function createTaskPlanTools(
  levelOf: (tool: string) => ApprovalLevel,
): TaskPlanTools {
  let current: TaskPlan | null = null;
  let calls = 0;

  const refuse = (label: string, note: string, result: string): Plan => ({
    kind: 'refuse',
    label,
    note,
    result,
  });

  // What this call would do to the plan.
  const kindOf = (steps: readonly string[]): 'new' | 'progress' | 'change' =>
    current === null
      ? 'new'
      : sameSteps(current.steps, steps)
        ? 'progress'
        : 'change';

  const describe = (call: ToolCall): string => {
    const parsed = parse(call);
    if (!parsed.ok) return 'Planning the task';
    const kind = kindOf(parsed.steps);
    return kind === 'new'
      ? `Plan this task in ${parsed.steps.length} steps`
      : kind === 'change'
        ? `Change the plan (${current!.steps.length} steps to ${parsed.steps.length})`
        : 'Update the plan';
  };

  const plan = (call: ToolCall): Plan => {
    if (levelOf(SET_PLAN) === 'never') {
      return refuse(
        'Turned off in Tools',
        'You have turned this tool off in the Tools panel.',
        'Planning is turned off. Do not try it again: just do the task.',
      );
    }
    if (calls >= MAX_PLAN_CALLS) {
      return refuse(
        'Plan limit reached',
        `Already updated the plan ${MAX_PLAN_CALLS} times in this reply.`,
        `You have already used set_plan ${MAX_PLAN_CALLS} times in this reply. Carry on with the task and stop updating the plan.`,
      );
    }
    const parsed = parse(call);
    if (!parsed.ok) {
      return refuse(
        "Couldn't make that plan",
        'The plan was not usable.',
        parsed.message,
      );
    }
    const kind = kindOf(parsed.steps);
    // Moving the progress forward is not a change to the plan: no question.
    if (kind === 'progress') return { kind: 'auto' };
    // The user turned the question off for plans (Tools panel): it goes ahead.
    if (levelOf(SET_PLAN) !== 'ask') return { kind: 'auto' };
    const before = kind === 'change' ? current!.steps : null;
    return {
      kind: 'ask',
      text: describe(call),
      risky: false,
      always: true,
      declinedResult:
        'The user did not approve this plan. Do not start the task and do not make another plan yet. Tell the user briefly that you have not started, and ask what they would like changed (use offer_choices, or ask in words).',
      card: {
        list: planLines(parsed.steps, before),
        ...(kind === 'change' && parsed.reason !== ''
          ? { text: { label: 'Why', value: parsed.reason } }
          : {}),
      },
    };
  };

  async function run(call: ToolCall): Promise<ToolOutcome> {
    // Checked again now: things may have changed while the user decided.
    const decided = plan(call);
    if (decided.kind === 'refuse') {
      return {
        label: decided.label,
        ok: false,
        note: decided.note,
        result: decided.result,
      };
    }
    const parsed = parse(call);
    if (!parsed.ok) {
      return {
        label: "Couldn't make that plan",
        ok: false,
        note: 'The plan was not usable.',
        result: parsed.message,
      };
    }
    calls++;
    const kind = kindOf(parsed.steps);
    const total = parsed.steps.length;
    // Progress only moves forward, and never beyond the end.
    const floor = kind === 'progress' ? current!.done : 0;
    const asked =
      parsed.done ?? (kind === 'change' ? Math.min(current!.done, total) : 0);
    const done = Math.min(total, Math.max(floor, asked));
    const next: TaskPlan = { steps: parsed.steps, done };
    current = next;
    const details = progressLines(next).join('\n');
    if (kind === 'new') {
      return {
        label: `Plan: ${total} steps`,
        ok: true,
        plan: next,
        details,
        note: `The user approved the plan (${total} steps).`,
        result: `The user approved the plan. Start with step 1: "${next.steps[0]}". When you finish a step, call set_plan again with the same steps and done set to how many are finished. If you need to change the steps, call it with the new steps and a short reason: the user reviews the change.`,
      };
    }
    if (kind === 'change') {
      return {
        label: `Plan changed: ${total} steps`,
        ok: true,
        plan: next,
        details,
        note: `The user approved the changed plan (${total} steps).`,
        result: `The user approved the changed plan. ${done} of ${total} steps are done. ${done < total ? `Carry on with step ${done + 1}: "${next.steps[done]}".` : 'All steps are done: give the user the answer.'}`,
      };
    }
    return {
      label: `Plan: ${done} of ${total} done`,
      ok: true,
      plan: next,
      details,
      note: `${done} of ${total} steps done.`,
      result:
        done < total
          ? `Saved: ${done} of ${total} steps done. Next, step ${done + 1}: "${next.steps[done]}".`
          : 'Saved: all steps are done. Now give the user the answer.',
    };
  }

  return { plan, describe, run, current: () => current };
}
