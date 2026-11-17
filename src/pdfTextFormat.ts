// Turning the words PDF.js finds on each page of a PDF into the text the assistant
// reads. Pure code (no PDF library), so it is easy to test.

// How much of a PDF is read: pages beyond these are left off, with a note.
export const MAX_PDF_PAGES = 300;
export const MAX_PDF_TEXT_CHARS = 400_000;

// What was read from a PDF: its text (empty for a scanned one), how many pages it
// has, and whether some of it was left off for being too long.
export type PdfTextResult =
  | {
      ok: true;
      pages: number;
      text: string;
      scanned: boolean;
      truncated: boolean;
    }
  | { ok: false };

// An answer from the window, checked before it is trusted.
export function parsePdfText(raw: unknown): PdfTextResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false };
  const r = raw as Record<string, unknown>;
  if (
    r.ok !== true ||
    typeof r.text !== 'string' ||
    typeof r.pages !== 'number' ||
    !Number.isInteger(r.pages) ||
    r.pages < 0 ||
    typeof r.scanned !== 'boolean' ||
    typeof r.truncated !== 'boolean'
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    pages: r.pages,
    text: r.text.slice(0, MAX_PDF_TEXT_CHARS),
    scanned: r.scanned,
    truncated: r.truncated || r.text.length > MAX_PDF_TEXT_CHARS,
  };
}

// One piece of text on a page, as PDF.js reports it.
export interface TextItemLike {
  str?: unknown;
  hasEOL?: unknown;
}

// The text of one page: the pieces in order, a new line where the PDF ends one.
export function pageText(items: readonly object[]): string {
  let text = '';
  for (const raw of items) {
    const item = raw as TextItemLike;
    if (typeof item.str !== 'string') continue;
    text += item.str;
    if (item.hasEOL === true) text += '\n';
  }
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Whether any page has text at all (a scanned PDF is only pictures).
export const hasReadableText = (pages: readonly string[]): boolean =>
  pages.some((page) => page.trim() !== '');

// The whole document as one text, each page under its number. Stops at the
// character limit (the last page is cut there).
export function documentText(pages: readonly string[]): {
  text: string;
  truncated: boolean;
} {
  let text = '';
  for (let index = 0; index < pages.length; index++) {
    const block = `${index > 0 ? '\n\n' : ''}--- Page ${index + 1} ---\n${pages[index]}`;
    if (text.length + block.length > MAX_PDF_TEXT_CHARS) {
      return {
        text: (text + block).slice(0, MAX_PDF_TEXT_CHARS),
        truncated: true,
      };
    }
    text += block;
  }
  return { text, truncated: false };
}
