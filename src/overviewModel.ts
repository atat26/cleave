// What a Space's overview page shows and how it is searched: the pages split into
// open and closed, the artifacts and chats that belong to it, a search box that
// narrows all of them, and the short wording ("5 min ago", "3 pages"). Pure, so it is
// easy to test.

export interface OverviewPage {
  id: number;
  title: string;
  url: string;
  closed: boolean;
}
export interface OverviewArtifact {
  id: number;
  title: string;
  kind: string;
}
export interface OverviewChat {
  id: number;
  title: string;
  updatedAt: number;
}

export interface OverviewContent<
  P extends OverviewPage,
  A extends OverviewArtifact,
  C extends OverviewChat,
> {
  open: P[];
  closed: P[];
  artifacts: A[];
  chats: C[];
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

// Does this text match what was typed? Every word typed must appear somewhere in
// the text, in any order, ignoring letter case.
export function matchesQuery(query: string, ...texts: string[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = texts.join(' ').toLowerCase();
  return words.every((word) => hay.includes(word));
}

// Everything the overview shows, narrowed by the search text. `chats` are the chats
// linked to this Space, most recently used first.
export function overviewContent<
  P extends OverviewPage,
  A extends OverviewArtifact,
  C extends OverviewChat,
>(input: {
  query: string;
  pages: P[];
  artifacts: A[];
  chats: C[];
}): OverviewContent<P, A, C> {
  const { query } = input;
  const pages = input.pages.filter((p) =>
    matchesQuery(query, p.title, hostOf(p.url), p.url),
  );
  return {
    open: pages.filter((p) => !p.closed),
    closed: pages.filter((p) => p.closed),
    artifacts: input.artifacts.filter((a) =>
      matchesQuery(query, a.title, a.kind),
    ),
    chats: [...input.chats]
      .filter((c) => matchesQuery(query, c.title))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// The short line under a Space's name: "12 pages (4 open) · 3 artifacts · 2 chats".
// Things there are none of are left out; an empty Space says so.
export function summaryLine(counts: {
  pages: number;
  open: number;
  artifacts: number;
  chats: number;
}): string {
  const parts: string[] = [];
  if (counts.pages > 0) {
    parts.push(
      `${plural(counts.pages, 'page', 'pages')} (${counts.open} open)`,
    );
  }
  if (counts.artifacts > 0) {
    parts.push(plural(counts.artifacts, 'artifact', 'artifacts'));
  }
  if (counts.chats > 0) parts.push(plural(counts.chats, 'chat', 'chats'));
  return parts.length === 0 ? 'Nothing here yet' : parts.join(' · ');
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or a date.
export function agoWords(time: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const date = new Date(time);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
