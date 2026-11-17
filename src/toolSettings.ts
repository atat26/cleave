// Your choices in the Tools panel: how much each tool may do without asking. Only
// the choices that differ from a tool's default are saved, so a tool's default can
// improve later without being stuck at an old value. Saved to tools.json. Pure
// data and functions, so it is easy to test.
import { defaultLevel, isApprovalLevel, TOOL_CATALOG } from './toolPolicy.ts';
import type { ApprovalLevel, ToolInfo } from './toolPolicy.ts';

export interface ToolSettings {
  version: 1;
  // Tool name -> level, for the tools set to something other than their default.
  levels: Record<string, ApprovalLevel>;
}

export const defaultToolSettings = (): ToolSettings => ({
  version: 1,
  levels: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Turn whatever is on disk into valid settings: unknown tools and unknown levels
// are dropped, and anything equal to the default is not kept. Never throws.
export function parseToolSettings(raw: unknown): ToolSettings {
  const settings = defaultToolSettings();
  if (!isRecord(raw) || !isRecord(raw.levels)) return settings;
  for (const tool of TOOL_CATALOG) {
    const level = raw.levels[tool.name];
    if (isApprovalLevel(level) && level !== tool.defaultLevel) {
      settings.levels[tool.name] = level;
    }
  }
  return settings;
}

// The level for a tool: your choice, else its default. Unknown tools are "ask".
export function levelFor(settings: ToolSettings, tool: string): ApprovalLevel {
  return settings.levels[tool] ?? defaultLevel(tool) ?? 'ask';
}

// One tool as the Tools panel shows it: its description, its default, and the
// level it is at now.
export interface ToolRow extends ToolInfo {
  level: ApprovalLevel;
}

export function describeTools(settings: ToolSettings): ToolRow[] {
  return TOOL_CATALOG.map((tool) => ({
    ...tool,
    level: levelFor(settings, tool.name),
  }));
}

// Set one tool's level. A tool that is not in the catalog is ignored.
export function withLevel(
  settings: ToolSettings,
  tool: string,
  level: ApprovalLevel,
): ToolSettings {
  const fallback = defaultLevel(tool);
  if (fallback === undefined || !isApprovalLevel(level)) return settings;
  const levels = { ...settings.levels };
  if (level === fallback) delete levels[tool];
  else levels[tool] = level;
  return { ...settings, levels };
}

// ---- Presets, summaries, search and groups (for the Tools panel) ---------------------

export type ToolPreset = 'cautious' | 'balanced' | 'hands-off';
export const TOOL_PRESETS: readonly ToolPreset[] = [
  'cautious',
  'balanced',
  'hands-off',
];
export const PRESET_WORDS: Record<ToolPreset, string> = {
  cautious: 'Cautious',
  balanced: 'Balanced',
  'hands-off': 'Hands-off',
};
export const PRESET_HELP: Record<ToolPreset, string> = {
  cautious:
    'Asks before almost everything, even reading a page. Only scrolling, listing linked tabs, using a skill and offering buttons just happen.',
  balanced:
    'The default: looking and reading just happen; anything that changes things, or sees more than the pages you linked, asks.',
  'hands-off':
    'Most things just happen, including seeing all your tabs, history and chats. Risky things (buying, sending, deleting, closing tabs) still ask.',
};

// Tools that only touch the conversation itself, so even "Cautious" lets them happen.
const ALWAYS_HAPPEN = new Set([
  'list_linked_tabs',
  'scroll',
  'offer_choices',
  'use_skill',
]);

// The level every tool gets from a preset.
export function presetLevels(
  preset: ToolPreset,
  catalog: readonly ToolInfo[] = TOOL_CATALOG,
): Record<string, ApprovalLevel> {
  const levels: Record<string, ApprovalLevel> = {};
  for (const tool of catalog) {
    if (preset === 'balanced') levels[tool.name] = tool.defaultLevel;
    else if (preset === 'cautious') {
      levels[tool.name] = ALWAYS_HAPPEN.has(tool.name) ? 'always' : 'ask';
    } else {
      // Hands-off: what already just happens stays; the rest goes ahead unless risky.
      levels[tool.name] = tool.defaultLevel === 'always' ? 'always' : 'if-safe';
    }
  }
  return levels;
}

// Set many tools at once (a preset, or a whole group). Unknown tools are ignored.
export function withLevels(
  settings: ToolSettings,
  levels: Record<string, ApprovalLevel>,
): ToolSettings {
  let next = settings;
  for (const [tool, level] of Object.entries(levels)) {
    next = withLevel(next, tool, level);
  }
  return next;
}

// Which preset the tools are at now, or "custom" when they match none.
export function detectPreset(
  rows: readonly Pick<ToolRow, 'name' | 'level'>[],
  catalog: readonly ToolInfo[] = TOOL_CATALOG,
): ToolPreset | 'custom' {
  for (const preset of TOOL_PRESETS) {
    const wanted = presetLevels(preset, catalog);
    if (rows.every((row) => wanted[row.name] === row.level)) return preset;
  }
  return 'custom';
}

// How many tools are at each level, in a plain line
// ("52 tools · 40 ask first · 8 always allowed").
export function summarizeRows(rows: readonly Pick<ToolRow, 'level'>[]): string {
  const count = (level: ApprovalLevel) =>
    rows.filter((r) => r.level === level).length;
  const parts: [number, string][] = [
    [count('ask'), 'ask first'],
    [count('if-safe'), 'allowed if safe'],
    [count('always'), 'always allowed'],
    [count('never'), 'turned off'],
  ];
  return [
    `${rows.length} tool${rows.length === 1 ? '' : 's'}`,
    ...parts.filter(([n]) => n > 0).map(([n, words]) => `${n} ${words}`),
  ].join(' · ');
}

// The tools that match what was typed (every word, in the name, title or description).
export function filterRows<T extends ToolRow>(
  rows: readonly T[],
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...rows];
  return rows.filter((row) => {
    const text =
      `${row.title} ${row.summary} ${row.name.replace(/_/g, ' ')}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

// The one level every tool in a list is at, or null when they differ.
export function commonLevel(
  rows: readonly Pick<ToolRow, 'level'>[],
): ApprovalLevel | null {
  if (rows.length === 0) return null;
  return rows.every((r) => r.level === rows[0].level) ? rows[0].level : null;
}

// The levels for "set everything in this group to ...".
export function groupLevels(
  rows: readonly Pick<ToolRow, 'name' | 'group'>[],
  group: ToolInfo['group'],
  level: ApprovalLevel,
): Record<string, ApprovalLevel> {
  const levels: Record<string, ApprovalLevel> = {};
  for (const row of rows) if (row.group === group) levels[row.name] = level;
  return levels;
}
