// A small, safe Markdown reader for the assistant's replies: headings, bold, italic,
// strikethrough, inline code, code blocks, lists, quotes, rules, tables and links.
// It turns text into a plain tree of blocks and pieces of text (see Markdown.tsx
// for how that is drawn). It never produces HTML, so a reply cannot contain markup
// that runs or looks like part of the app:
//   - raw HTML in the text is just text
//   - only http and https links are kept as links; anything else shows as text
//   - images are never loaded (a remote image can leak that you read a message)
//   - it never throws: half-written Markdown (a reply still streaming in) just shows
//     as it is, and unclosed pieces stay plain
//   - size is capped, so a huge or hostile reply cannot make it slow
// Pure code with no Electron or React, so it is easy to test.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; url: string; children: Inline[] };

export type Align = 'left' | 'right' | 'center' | null;

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'quote'; children: Block[] }
  | { type: 'rule' }
  | {
      type: 'table';
      align: Align[];
      header: Inline[][];
      rows: Inline[][][];
    };

const MAX_SOURCE = 200_000;
const MAX_INLINE = 8_000;
const MAX_DEPTH = 4;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLUMNS = 12;
const MAX_URL = 2_000;

// ---- Links -----------------------------------------------------------------------

// A link address we are willing to make clickable: http or https, no username or
// password. Null otherwise.
export function safeLink(raw: string): string | null {
  if (raw.length === 0 || raw.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  return url.href;
}

function withoutLinks(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.type === 'link') {
      for (const child of withoutLinks(node.children)) {
        if (child.type === 'text') pushText(out, child.text);
        else out.push(child);
      }
    } else if (
      node.type === 'strong' ||
      node.type === 'em' ||
      node.type === 'del'
    ) {
      out.push({ ...node, children: withoutLinks(node.children) });
    } else if (node.type === 'text') {
      pushText(out, node.text);
    } else {
      out.push(node);
    }
  }
  return out;
}

// The words of some pieces with the formatting taken off.
const plainWords = (nodes: Inline[]): string =>
  nodes
    .map((n) =>
      n.type === 'text' || n.type === 'code' ? n.text : plainWords(n.children),
    )
    .join('');

const ADDRESS_WORDS =
  /^(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?::\d+)?(?:[/?#]\S*)?$/i;

// The real site of a link whose words look like the address of another site, or null. A link reading
// "https://bank.example/login" that leads to evil.example is the classic trick; showing where it truly
// goes costs nothing when the words are honest (the same site, with or without "www.").
export function misleadingHost(words: string, url: string): string | null {
  const said = ADDRESS_WORDS.exec(words.trim());
  if (!said) return null;
  const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');
  let real: string;
  try {
    real = new URL(url).hostname;
  } catch {
    return null;
  }
  return bare(said[1]) === bare(real) ? null : real;
}

// ---- Inline pieces -----------------------------------------------------------------

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const isWordChar = (ch: string | undefined) =>
  ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);

const LINK = /^\[([^\]\n]{0,500})\]\(\s*([^)\s]{1,2000})(?:\s+"[^"\n]*")?\s*\)/;
const IMAGE = /^!\[([^\]\n]{0,300})\]\(\s*[^)\s]{1,2000}(?:\s+"[^"\n]*")?\s*\)/;
const BARE_URL = /^https?:\/\/[^\s<>[\]"']{1,2000}/;

// Join neighbouring bits of text, so the tree stays small.
function pushText(out: Inline[], text: string) {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last && last.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

export function parseInline(text: string, depth = 0): Inline[] {
  if (text.length > MAX_INLINE || depth > MAX_DEPTH) {
    return text === '' ? [] : [{ type: 'text', text }];
  }
  const out: Inline[] = [];
  let i = 0;
  let plain = '';
  const flush = () => {
    pushText(out, plain);
    plain = '';
  };

  while (i < text.length) {
    const ch = text[i];

    // A backslash makes the next punctuation character plain.
    if (ch === '\\' && i + 1 < text.length && PUNCTUATION.test(text[i + 1])) {
      plain += text[i + 1];
      i += 2;
      continue;
    }

    // Inline code: `code` (a longer run of backticks can hold shorter ones).
    if (ch === '`') {
      let run = 1;
      while (text[i + run] === '`') run++;
      const fence = '`'.repeat(run);
      const close = text.indexOf(fence, i + run);
      if (close > i + run && text[close + run] !== '`') {
        flush();
        let code = text.slice(i + run, close);
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') {
          code = code.slice(1, -1);
        }
        out.push({ type: 'code', text: code });
        i = close + run;
        continue;
      }
      plain += fence;
      i += run;
      continue;
    }

    // An image is never loaded: show it as plain words.
    if (ch === '!' && text[i + 1] === '[') {
      const image = IMAGE.exec(text.slice(i, i + 3000));
      if (image) {
        plain += `[image: ${image[1] || 'no description'}]`;
        i += image[0].length;
        continue;
      }
    }

    // A link: [words](https://address)
    if (ch === '[') {
      const link = LINK.exec(text.slice(i, i + 3000));
      if (link) {
        flush();
        const url = safeLink(link[2]);
        // A link inside a link would be two places in one: the words stay, the inner link goes.
        const inner = withoutLinks(parseInline(link[1], depth + 1));
        // An address that is not a plain web address shows only its words.
        if (url) {
          // Words that look like a web address but lead somewhere else say where it really goes.
          const real = misleadingHost(plainWords(inner), url);
          if (real) inner.push({ type: 'text', text: ` (goes to ${real})` });
          out.push({ type: 'link', url, children: inner });
        } else for (const piece of inner) out.push(piece);
        i += link[0].length;
        continue;
      }
    }

    // A bare web address becomes a link.
    if (
      (ch === 'h' || ch === 'H') &&
      !isWordChar(text[i - 1]) &&
      /^https?:\/\//i.test(text.slice(i, i + 8))
    ) {
      const match = BARE_URL.exec(text.slice(i, i + 2100));
      if (match) {
        // Trailing punctuation belongs to the sentence, not the address.
        const address = match[0].replace(/[.,;:!?)\]]+$/, '');
        const url = safeLink(address);
        if (url) {
          flush();
          out.push({
            type: 'link',
            url,
            children: [{ type: 'text', text: address }],
          });
          i += address.length;
          continue;
        }
      }
    }

    // **bold**, __bold__, ~~strikethrough~~
    if ((ch === '*' || ch === '_' || ch === '~') && text[i + 1] === ch) {
      const marker = ch + ch;
      const close = text.indexOf(marker, i + 2);
      const inner = close > i + 2 ? text.slice(i + 2, close) : '';
      const underscoreInWord =
        ch === '_' && (isWordChar(text[i - 1]) || isWordChar(text[close + 2]));
      if (inner !== '' && inner === inner.trim() && !underscoreInWord) {
        flush();
        out.push({
          type: ch === '~' ? 'del' : 'strong',
          children: parseInline(inner, depth + 1),
        });
        i = close + 2;
        continue;
      }
    }

    // *italic*, _italic_
    if (ch === '*' || ch === '_') {
      let close = -1;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === '\\') {
          j++;
          continue;
        }
        if (text[j] === ch && text[j + 1] !== ch && text[j - 1] !== ch) {
          close = j;
          break;
        }
      }
      const inner = close > i + 1 ? text.slice(i + 1, close) : '';
      const wordy =
        ch === '_' && (isWordChar(text[i - 1]) || isWordChar(text[close + 1]));
      if (
        inner !== '' &&
        inner === inner.trim() &&
        !wordy &&
        !isSpace(text[i + 1])
      ) {
        flush();
        out.push({ type: 'em', children: parseInline(inner, depth + 1) });
        i = close + 1;
        continue;
      }
    }

    plain += ch;
    i++;
  }
  flush();
  return out;
}

// ---- Blocks --------------------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const TABLE_SEPARATOR =
  /^ *\|?[ \t]*:?-{1,}:?[ \t]*(?:\|[ \t]*:?-{1,}:?[ \t]*)*\|? *$/;

const indentOf = (line: string) => /^ */.exec(line)?.[0].length ?? 0;

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\' && row[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (row[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += row[i];
    }
  }
  cells.push(cell.trim());
  return cells.slice(0, MAX_TABLE_COLUMNS);
}

const startsTable = (lines: string[], i: number) =>
  lines[i].includes('|') &&
  i + 1 < lines.length &&
  lines[i + 1].includes('-') &&
  TABLE_SEPARATOR.test(lines[i + 1]) &&
  splitRow(lines[i]).length === splitRow(lines[i + 1]).length;

// Does this line begin something other than a plain paragraph?
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line) ||
    startsTable(lines, i)
  );
}

function parseBlocks(lines: string[], depth: number): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    // A code block. If it is never closed (a reply still streaming in), the rest
    // of the text is the code.
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[i]);
        if (
          close &&
          close[1][0] === marker[0] &&
          close[1].length >= marker.length
        ) {
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(QUOTE.exec(lines[i])?.[1] ?? '');
        i++;
      }
      blocks.push({
        type: 'quote',
        children:
          depth < MAX_DEPTH
            ? parseBlocks(inner, depth + 1)
            : [{ type: 'paragraph', children: parseInline(inner.join('\n')) }],
      });
      continue;
    }

    if (startsTable(lines, i)) {
      const header = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        return left && right
          ? 'center'
          : right
            ? 'right'
            : left
              ? 'left'
              : null;
      });
      i += 2;
      const rows: Inline[][][] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        lines[i].includes('|') &&
        rows.length < MAX_TABLE_ROWS
      ) {
        rows.push(splitRow(lines[i]).map((cell) => parseInline(cell)));
        i++;
      }
      blocks.push({
        type: 'table',
        align,
        header: header.map((cell) => parseInline(cell)),
        rows,
      });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const base = item[1].length;
      const ordered = /\d/.test(item[2]);
      const start = ordered ? Number.parseInt(item[2], 10) : 1;
      const items: Block[][] = [];
      while (i < lines.length) {
        const current = LIST_ITEM.exec(lines[i]);
        // A new item of this list is at the same indentation and the same kind.
        if (
          !current ||
          current[1].length !== base ||
          /\d/.test(current[2]) !== ordered
        ) {
          break;
        }
        const content: string[] = [current[3]];
        i++;
        // What belongs to this item: lines indented further (nested lists and
        // continued paragraphs), and single blank lines between them.
        while (i < lines.length) {
          const next = lines[i];
          if (next.trim() === '') {
            const after = lines[i + 1];
            if (
              after !== undefined &&
              indentOf(after) > base &&
              after.trim() !== ''
            ) {
              content.push('');
              i++;
              continue;
            }
            break;
          }
          if (indentOf(next) <= base) break;
          content.push(next.slice(Math.min(indentOf(next), base + 2)));
          i++;
        }
        items.push(
          depth < MAX_DEPTH
            ? parseBlocks(content, depth + 1)
            : [
                {
                  type: 'paragraph',
                  children: parseInline(content.join('\n')),
                },
              ],
        );
        // Blank lines between items of the same list.
        if (
          i < lines.length &&
          lines[i].trim() === '' &&
          i + 1 < lines.length
        ) {
          const next = LIST_ITEM.exec(lines[i + 1]);
          if (next && next[1].length === base && /\d/.test(next[2]) === ordered)
            i++;
        }
        if (items.length >= 500) break;
      }
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }

    // Otherwise a paragraph: lines up to a blank line or the start of another block.
    const paragraph: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !startsBlock(lines, i)
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push({
      type: 'paragraph',
      children: parseInline(paragraph.join('\n')),
    });
  }
  return blocks;
}

// Turn a reply's text into blocks. Never throws.
export function parseMarkdown(source: string): Block[] {
  try {
    const text =
      source.length > MAX_SOURCE ? source.slice(0, MAX_SOURCE) : source;
    return parseBlocks(
      text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'),
      0,
    );
  } catch {
    return source === ''
      ? []
      : [{ type: 'paragraph', children: [{ type: 'text', text: source }] }];
  }
}
