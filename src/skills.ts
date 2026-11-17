// Skills: reusable instructions you give the assistant ("Compare prices", "Tidy my
// tabs"). A skill is a name, a line saying when to use it, and what to do. They apply
// everywhere (not to one Space). You make them, import them, or the assistant makes them
// (after you approve what it wrote). A skill is only text: it can never change what the
// assistant is allowed to do or switch off a safety rule.
//
// Skills are kept in skills.json. Deleting one moves it to a trash (shown in the
// Library under Recently deleted) so it can be brought back. Files use the common
// "SKILL.md" shape: a short header with the name and description, then the steps.
// Pure and strict about what it reads back from disk, so it is easy to test.

export type SkillOrigin = 'you' | 'starter' | 'assistant' | 'imported';

export interface Skill {
  id: number;
  name: string;
  // When to use it: the one line the assistant always sees.
  description: string;
  // What to do: the assistant reads this only when it uses the skill.
  instructions: string;
  enabled: boolean;
  origin: SkillOrigin;
  createdAt: number;
  updatedAt: number;
}

export interface TrashedSkill extends Skill {
  deletedAt: number;
}

export interface SkillsState {
  version: 1;
  nextId: number;
  skills: Skill[];
  trash: TrashedSkill[];
  // The starter skills were added once (deleting them does not bring them back).
  seeded: boolean;
}

export const MAX_SKILLS = 100;
export const MAX_SKILL_TRASH = 100;
export const MAX_NAME_CHARS = 60;
export const MAX_DESCRIPTION_CHARS = 300;
export const MAX_INSTRUCTION_CHARS = 8000;

const ORIGINS: readonly SkillOrigin[] = [
  'you',
  'starter',
  'assistant',
  'imported',
];

// ---- Cleaning ------------------------------------------------------------------------

// A single line of text: control and invisible formatting characters become spaces,
// whitespace is squeezed, and the result is cut to a length.
export function cleanLine(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const swapped = Array.from(raw, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    const bad =
      code < 32 ||
      (code >= 127 && code <= 159) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      code === 0xfeff;
    return bad ? ' ' : ch;
  }).join('');
  return swapped.replace(/\s+/g, ' ').trim().slice(0, max);
}

// Longer text: line breaks and indentation are kept, other control and invisible
// formatting characters are swapped for spaces, runs of blank lines are squeezed.
export function cleanBody(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const swapped = Array.from(raw.replace(/\r\n?/g, '\n'), (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    const bad =
      (code < 32 && code !== 10 && code !== 9) ||
      (code >= 127 && code <= 159) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      code === 0xfeff;
    return bad ? ' ' : ch;
  }).join('');
  return swapped
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

// ---- The starter skills ---------------------------------------------------------------

export interface SkillInput {
  name: string;
  description: string;
  instructions: string;
}

export const STARTER_SKILLS: readonly SkillInput[] = [
  {
    name: 'Compare prices',
    description:
      'Use when the user wants to compare prices, plans or options across pages or shops.',
    instructions: [
      '1. Find out what is being compared, and which pages or shops. Ask one short question if it is unclear.',
      '2. For each page, use read_tables first (prices are often in tables), then read_page if there are none. Use find_in_page to point at a price on the page.',
      '3. Write down for each option: name, price, what is included, and any condition (delivery, minimum, trial).',
      '4. Answer with a short comparison table, then one sentence on which looks best and why. Say clearly when a price could not be found.',
      '5. Offer to save the comparison as an artifact. Do not save it unless the user says yes.',
    ].join('\n'),
  },
  {
    name: 'Summarise a page',
    description:
      'Use when the user asks for a summary or the key points of a page or article.',
    instructions: [
      '1. Read the page with read_page. If it is very long, read it in parts.',
      '2. Give a summary in about five short bullet points, then one line on who it is for or what to do with it.',
      '3. Quote nothing at length. Keep the summary in your own words.',
      '4. Offer to save the page as an artifact with save_page_as_artifact if the user may want to keep it. Do not save it unless they say yes.',
    ].join('\n'),
  },
  {
    name: 'Research a topic',
    description:
      'Use when the user asks you to look into a topic using several sources.',
    instructions: [
      '1. Search the web with web_search for the topic, with two or three different queries if the first is thin.',
      '2. Read the most useful results with read_link (not more than four) and note where each fact came from.',
      '3. Write a short answer, then a list of the sources you used with their addresses. Say where sources disagree, and what you could not confirm.',
      '4. Offer to save it as an artifact. Do not save it unless the user says yes.',
    ].join('\n'),
  },
  {
    name: 'Tidy my tabs',
    description:
      'Use when the user wants their open tabs sorted into Spaces or cleaned up.',
    instructions: [
      '1. Use list_all_tabs to see every tab and Space.',
      '2. Group tabs by what they are about. Prefer the Spaces that already exist. Suggest a new Space only for a group of three or more tabs that fits nowhere.',
      '3. Make any new Spaces with create_space, then move tabs with ONE move_tabs call so the user approves the whole plan on one card.',
      '4. Never close a tab unless the user asked. If some tabs look finished (a receipt, a search results page), list them and ask.',
      '5. Finish with one line saying what moved.',
    ].join('\n'),
  },
];

// ---- State -------------------------------------------------------------------------------

export const emptySkills = (): SkillsState => ({
  version: 1,
  nextId: 1,
  skills: [],
  trash: [],
  seeded: false,
});

// A fresh state with the starter skills in it.
export function defaultSkills(now = Date.now()): SkillsState {
  let state = emptySkills();
  for (const input of STARTER_SKILLS) {
    const made = createSkill(state, input, now, 'starter');
    if (made.ok) state = made.state;
  }
  return { ...state, seeded: true };
}

const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;
const isTime = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parseSkill(raw: unknown, now: number): Skill | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.id)) return null;
  const name = cleanLine(r.name, MAX_NAME_CHARS);
  const instructions = cleanBody(r.instructions, MAX_INSTRUCTION_CHARS);
  if (name === '' || instructions === '') return null;
  return {
    id: r.id,
    name,
    description: cleanLine(r.description, MAX_DESCRIPTION_CHARS),
    instructions,
    enabled: r.enabled !== false,
    origin: ORIGINS.find((o) => o === r.origin) ?? 'you',
    createdAt: isTime(r.createdAt) ? r.createdAt : now,
    updatedAt: isTime(r.updatedAt) ? r.updatedAt : now,
  };
}

// Turn whatever is on disk into valid state. A missing or broken file gives the starter
// skills; a good file is kept as it is. Never throws.
export function parseSkills(raw: unknown, now = Date.now()): SkillsState {
  if (typeof raw !== 'object' || raw === null) return defaultSkills(now);
  const r = raw as Record<string, unknown>;
  const seen = new Set<number>();
  let maxId = 0;
  const skills: Skill[] = [];
  if (Array.isArray(r.skills)) {
    for (const item of r.skills) {
      if (skills.length >= MAX_SKILLS) break;
      const skill = parseSkill(item, now);
      if (!skill || seen.has(skill.id)) continue;
      seen.add(skill.id);
      maxId = Math.max(maxId, skill.id);
      skills.push(skill);
    }
  }
  const trash: TrashedSkill[] = [];
  if (Array.isArray(r.trash)) {
    for (const item of r.trash) {
      if (trash.length >= MAX_SKILL_TRASH) break;
      const skill = parseSkill(item, now);
      if (!skill || seen.has(skill.id)) continue;
      seen.add(skill.id);
      maxId = Math.max(maxId, skill.id);
      trash.push({
        ...skill,
        deletedAt: isTime((item as { deletedAt?: unknown }).deletedAt)
          ? (item as { deletedAt: number }).deletedAt
          : now,
      });
    }
  }
  return {
    version: 1,
    nextId: Math.max(isId(r.nextId) ? r.nextId : 1, maxId + 1),
    skills,
    trash,
    seeded: r.seeded === true,
  };
}

export const findSkill = (state: SkillsState, id: number): Skill | undefined =>
  state.skills.find((s) => s.id === id);

// A name nobody else has: "Compare prices", then "Compare prices 2", and so on.
export function uniqueName(
  state: SkillsState,
  wanted: string,
  exceptId: number | null = null,
): string {
  const taken = new Set(
    state.skills
      .filter((s) => s.id !== exceptId)
      .map((s) => s.name.toLowerCase()),
  );
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` ${n}`;
    const candidate = `${wanted.slice(0, MAX_NAME_CHARS - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return wanted;
}

export type SkillProblem = 'no-name' | 'no-instructions' | 'too-many';

// Check what a person (or the assistant) wrote, giving the cleaned skill or the problem.
export function checkInput(
  input: Partial<SkillInput>,
):
  | { ok: true; value: SkillInput }
  | { ok: false; problem: Exclude<SkillProblem, 'too-many'> } {
  const name = cleanLine(input.name, MAX_NAME_CHARS);
  const instructions = cleanBody(input.instructions, MAX_INSTRUCTION_CHARS);
  if (name === '') return { ok: false, problem: 'no-name' };
  if (instructions === '') return { ok: false, problem: 'no-instructions' };
  return {
    ok: true,
    value: {
      name,
      description: cleanLine(input.description, MAX_DESCRIPTION_CHARS),
      instructions,
    },
  };
}

export const PROBLEM_WORDS: Record<SkillProblem, string> = {
  'no-name': 'Give the skill a name.',
  'no-instructions': 'Write what the assistant should do.',
  'too-many': `You can have at most ${MAX_SKILLS} skills. Delete one first.`,
};

// ---- Changing skills ---------------------------------------------------------------------

export function createSkill(
  state: SkillsState,
  input: Partial<SkillInput>,
  now: number,
  origin: SkillOrigin = 'you',
):
  | { ok: true; state: SkillsState; skill: Skill }
  | { ok: false; problem: SkillProblem } {
  const checked = checkInput(input);
  if (!checked.ok) return checked;
  if (state.skills.length >= MAX_SKILLS) {
    return { ok: false, problem: 'too-many' };
  }
  const skill: Skill = {
    id: state.nextId,
    name: uniqueName(state, checked.value.name),
    description: checked.value.description,
    instructions: checked.value.instructions,
    enabled: true,
    origin,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ok: true,
    skill,
    state: {
      ...state,
      nextId: state.nextId + 1,
      skills: [...state.skills, skill],
    },
  };
}

export function updateSkill(
  state: SkillsState,
  id: number,
  changes: Partial<SkillInput>,
  now: number,
):
  | { ok: true; state: SkillsState; skill: Skill }
  | { ok: false; problem: Exclude<SkillProblem, 'too-many'> | 'not-found' } {
  const current = findSkill(state, id);
  if (!current) return { ok: false, problem: 'not-found' };
  const checked = checkInput({
    name: changes.name ?? current.name,
    description: changes.description ?? current.description,
    instructions: changes.instructions ?? current.instructions,
  });
  if (!checked.ok) return checked;
  const skill: Skill = {
    ...current,
    name: uniqueName(state, checked.value.name, id),
    description: checked.value.description,
    instructions: checked.value.instructions,
    updatedAt: now,
  };
  return {
    ok: true,
    skill,
    state: {
      ...state,
      skills: state.skills.map((s) => (s.id === id ? skill : s)),
    },
  };
}

export function setSkillEnabled(
  state: SkillsState,
  id: number,
  enabled: boolean,
): SkillsState {
  const current = findSkill(state, id);
  if (!current || current.enabled === enabled) return state;
  return {
    ...state,
    skills: state.skills.map((s) => (s.id === id ? { ...s, enabled } : s)),
  };
}

// A copy with a name of its own ("Compare prices 2"), off until you turn it on.
export function duplicateSkill(
  state: SkillsState,
  id: number,
  now: number,
): { ok: true; state: SkillsState; skill: Skill } | { ok: false } {
  const current = findSkill(state, id);
  if (!current) return { ok: false };
  const made = createSkill(state, current, now, 'you');
  if (!made.ok) return { ok: false };
  return {
    ok: true,
    skill: { ...made.skill, enabled: false },
    state: {
      ...made.state,
      skills: made.state.skills.map((s) =>
        s.id === made.skill.id ? { ...s, enabled: false } : s,
      ),
    },
  };
}

// Delete: the skill moves to the trash (the oldest trashed ones go if it is full).
export function deleteSkill(
  state: SkillsState,
  id: number,
  now: number,
): SkillsState {
  const current = findSkill(state, id);
  if (!current) return state;
  return {
    ...state,
    skills: state.skills.filter((s) => s.id !== id),
    trash: [...state.trash, { ...current, deletedAt: now }].slice(
      -MAX_SKILL_TRASH,
    ),
  };
}

// Bring a deleted skill back (off, so it does not start working unseen; a taken name
// gets a number).
export function restoreSkill(
  state: SkillsState,
  id: number,
  now: number,
): SkillsState {
  const item = state.trash.find((s) => s.id === id);
  if (!item || state.skills.length >= MAX_SKILLS) return state;
  const { deletedAt: _deletedAt, ...skill } = item;
  void _deletedAt;
  return {
    ...state,
    trash: state.trash.filter((s) => s.id !== id),
    skills: [
      ...state.skills,
      {
        ...skill,
        name: uniqueName(state, skill.name),
        enabled: false,
        updatedAt: now,
      },
    ],
  };
}

export function purgeSkill(state: SkillsState, id: number): SkillsState {
  return state.trash.some((s) => s.id === id)
    ? { ...state, trash: state.trash.filter((s) => s.id !== id) }
    : state;
}

// Drop trashed skills older than `days` days.
export function purgeOldSkills(
  state: SkillsState,
  now: number,
  days: number,
): SkillsState {
  const cutoff = now - days * 24 * 60 * 60_000;
  const kept = state.trash.filter((s) => s.deletedAt >= cutoff);
  return kept.length === state.trash.length ? state : { ...state, trash: kept };
}

// The skills that are on, in the order they were made.
export const enabledSkills = (state: SkillsState): Skill[] =>
  state.skills.filter((s) => s.enabled);

// ---- Files (SKILL.md) ------------------------------------------------------------------

// A skill as a file: a header with its name and description, then the steps.
export function skillMarkdown(skill: SkillInput): string {
  const header = [
    '---',
    `name: ${cleanLine(skill.name, MAX_NAME_CHARS)}`,
    `description: ${cleanLine(skill.description, MAX_DESCRIPTION_CHARS)}`,
    '---',
  ];
  return `${header.join('\n')}\n\n${skill.instructions.trim()}\n`;
}

// A file name from the skill's name: letters, numbers and a few signs, never a path.
export function skillFileName(name: string): string {
  const base = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .slice(0, 80)
    .trim();
  return `${base === '' ? 'Skill' : base}.md`;
}

// Read a skill file. Other header lines are ignored. Without a header, the first
// "# Heading" is the name and the rest are the steps.
export function parseSkillMarkdown(
  text: unknown,
): { ok: true; value: SkillInput } | { ok: false; problem: SkillProblem } {
  if (typeof text !== 'string') return { ok: false, problem: 'no-name' };
  const source = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  let name = '';
  let description = '';
  let body = source;
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(source);
  if (match) {
    for (const line of match[1].split('\n')) {
      const pair = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
      if (!pair) continue;
      const value = pair[2].trim().replace(/^(["'])(.*)\1$/, '$2');
      if (pair[1].toLowerCase() === 'name') name = value;
      if (pair[1].toLowerCase() === 'description') description = value;
    }
    body = source.slice(match[0].length);
  } else {
    const heading = /^#\s+(.+)\n?/.exec(source.trimStart());
    if (heading) {
      name = heading[1];
      body = source.trimStart().slice(heading[0].length);
    }
  }
  return checkInput({ name, description, instructions: body });
}

// ---- "Make a skill from this chat" ----------------------------------------------------

// What is sent to the assistant when you choose "Make a skill from this chat…" in a chat's
// menu. It writes the skill with create_skill, so you see the whole text on the approval
// card and can say no.
export const MAKE_SKILL_REQUEST =
  'Make a skill from this conversation. Look back at what we did together and turn the steps that worked into a reusable skill. Call create_skill once, with: a short name; a description that starts with "Use when" and says what kind of task it is for; and numbered instructions written in general terms (not about this one example), with no private details and nothing copied from web pages. Do not use any other tool first.';

// ---- What the screen and the assistant see ------------------------------------------

// A skill as a list shows it (without the steps, which can be long).
export interface SkillInfo {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  origin: SkillOrigin;
  updatedAt: number;
}

export const skillInfo = (skill: Skill): SkillInfo => ({
  id: skill.id,
  name: skill.name,
  description: skill.description,
  enabled: skill.enabled,
  origin: skill.origin,
  updatedAt: skill.updatedAt,
});

export const ORIGIN_WORDS: Record<SkillOrigin, string> = {
  you: 'Made by you',
  starter: 'Starter skill',
  assistant: 'Made by the assistant',
  imported: 'Imported',
};
