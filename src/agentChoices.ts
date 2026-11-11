// Choices the assistant offers as buttons ("Open DuckDuckGo in a new tab" / "Use
// the tab that is already open"). Clicking one fills the message box with that
// text, so you can send it as it is or change it first.
//
// The assistant sends plain text only. The app draws the buttons itself, so a
// reply can never contain markup, scripts or anything else that runs. (This is
// the first, safe step towards richer replies.) Pure code.
import { cleanLabel } from './chatLinks.ts';

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;
const MAX_CHOICE_CHARS = 120;
const MAX_QUESTION_CHARS = 200;

export interface Choices {
  question: string;
  options: string[];
}

// The choices the model asked to show, tidied, or null if there is nothing usable.
export function parseChoices(raw: string): Choices | null {
  let args: unknown;
  try {
    args = JSON.parse(raw || '{}');
  } catch {
    return null;
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return null;
  }
  const { question, choices } = args as Record<string, unknown>;
  if (!Array.isArray(choices)) return null;

  const options: string[] = [];
  for (const choice of choices) {
    if (typeof choice !== 'string') continue;
    // One line each, and no quote tricks; cut to a sensible length.
    const tidy = cleanLabel(choice, MAX_CHOICE_CHARS);
    if (tidy !== '' && !options.includes(tidy)) options.push(tidy);
    if (options.length >= MAX_CHOICES) break;
  }
  if (options.length < MIN_CHOICES) return null;
  return {
    question: cleanLabel(question, MAX_QUESTION_CHARS),
    options,
  };
}
