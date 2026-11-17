// A Space as a Markdown file: its name and note, a list of its pages (open ones, then
// the ones you closed) as links, and a list of its artifacts (titles and kinds, not
// their text). Made for you to keep or share, so addresses are written as they are
// (with any password in an address removed). Pure, so it is easy to test.

export interface ExportPage {
  title: string;
  url: string;
  closed: boolean;
}
export interface ExportArtifact {
  title: string;
  kind: string;
}

// Text that is safe inside a Markdown link label or a heading line.
const label = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\[\]`*_<>|])/g, '\\$1');

// An address without a username or password, or null if it is not a web address.
function plainAddress(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    parsed.username = '';
    parsed.password = '';
    // Parentheses would end the link early.
    return parsed.href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch {
    return null;
  }
}

export function spaceMarkdown(input: {
  name: string;
  about: string;
  pages: ExportPage[];
  artifacts: ExportArtifact[];
}): string {
  const lines: string[] = [`# ${label(input.name) || 'Space'}`, ''];
  const about = input.about.trim();
  if (about !== '') {
    for (const line of about.split('\n')) lines.push(`> ${line}`.trimEnd());
    lines.push('');
  }
  const link = (page: ExportPage): string | null => {
    const address = plainAddress(page.url);
    if (address === null) return null;
    return `- [${label(page.title) || address}](${address})`;
  };
  const open = input.pages
    .filter((p) => !p.closed)
    .map(link)
    .filter((l): l is string => l !== null);
  const closed = input.pages
    .filter((p) => p.closed)
    .map(link)
    .filter((l): l is string => l !== null);
  if (open.length > 0) lines.push('## Pages', '', ...open, '');
  if (closed.length > 0) lines.push('## Closed pages', '', ...closed, '');
  if (input.artifacts.length > 0) {
    lines.push(
      '## Artifacts',
      '',
      ...input.artifacts.map(
        (a) => `- ${label(a.title) || 'Untitled'} (${label(a.kind)})`,
      ),
      '',
    );
  }
  if (lines.length <= 2 && about === '')
    lines.push('_This Space is empty._', '');
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

// A file name from the Space's name: letters, numbers and a few signs, never a path.
export function exportFileName(name: string, fallback = 'Space'): string {
  const base = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .slice(0, 80)
    .trim();
  return `${base === '' ? fallback : base}.md`;
}
