// Has this chat already read web pages? Pages are written by strangers, and a skill is a standing
// instruction the assistant would follow in later chats, so once a chat has read anything from the web
// (in any earlier reply, not only the current one) writing a skill always asks. Pure, so it is tested.

import { TOOL_CATALOG } from './toolPolicy.ts';

// Besides every tool that looks at or reads a page, the ones that show a page's title or text as
// they act, and saving a page.
const ALSO_WEB = new Set([
  'go_to',
  'open_tab',
  'click',
  'select_option',
  'save_page_as_artifact',
]);

export const readsTheWeb = (toolName: string): boolean =>
  TOOL_CATALOG.some((t) => t.name === toolName && t.group === 'look') ||
  ALSO_WEB.has(toolName);

// `tools` are the steps of the chat so far (name and how each ended).
export function chatHasReadWeb(
  tools: Iterable<{ name: string; status: string }>,
): boolean {
  for (const tool of tools) {
    if (tool.status === 'ok' && readsTheWeb(tool.name)) return true;
  }
  return false;
}
