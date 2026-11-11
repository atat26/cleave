// Your choices in the Tools panel: how much each tool may do without asking. Only
// the choices that differ from a tool's default are saved, so a tool's default can
// improve later without being stuck at an old value. Saved to tools.json. Pure
// data and functions, so it is easy to test.
import { defaultLevel, isApprovalLevel, TOOL_CATALOG } from './toolPolicy.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

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
