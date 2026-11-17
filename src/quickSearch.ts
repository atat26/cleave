// Quick search (Ctrl+K): one box that finds anything in the browser. What you typed
// comes first as three ways to use it (go to it, search the web for it, ask the
// assistant about it), then what matches, in groups: open tabs, closed pages, Spaces,
// artifacts, earlier chats, bookmarks and history. With nothing typed, it shows the
// few most recent of each. Pure code with no Electron, so it is easy to test; what a
// chosen row does is decided in tabs.ts.
import type { Artifact } from './artifacts.ts';
import type { Bookmark } from './bookmarks.ts';
import { byRecency, isUntouched, searchChats } from './chats.ts';
import type { ChatsState } from './chats.ts';
import {
  DEFAULT_CHAT_EMOJI,
  DEFAULT_SPACE_EMOJI,
  defaultArtifactEmoji,
  emojiOr,
} from './emoji.ts';
import { historyUrl } from './history.ts';
import type { HistoryEntry } from './history.ts';
import type { MenuEntry, MenuItem } from './menuTypes.ts';
import type { SavedState } from './model.ts';
import type { ClosedTab } from './recentlyClosed.ts';
import { looksLikeAddress } from './url.ts';

// How many rows each group shows: a few when nothing is typed, more once you type.
export const EMPTY_PER_GROUP = 3;
export const TYPED_PER_GROUP = 8;
// The longest text kept from what you typed.
export const MAX_QUERY = 500;

export interface QuickSources {
  state: Pick<SavedState, 'tabs' | 'spaces' | 'active'>;
  // Recently closed tabs (oldest first, as they are kept).
  closed: readonly ClosedTab[];
  artifacts: readonly Pick<
    Artifact,
    'id' | 'title' | 'kind' | 'emoji' | 'spaceId' | 'content' | 'updatedAt'
  >[];
  chats: ChatsState;
  history: readonly HistoryEntry[];
  bookmarks: readonly Bookmark[];
  // The name of the web search engine ("Search with ...").
  engineName: string;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

const wordsOf = (text: string): string[] =>
  text.toLowerCase().split(/\s+/).filter(Boolean);

const hasAll = (words: string[], text: string): boolean => {
  const lower = text.toLowerCase();
  return words.every((w) => lower.includes(w));
};

// Lower is better: the name starts with what you typed, then the name has every
// word, then only the rest of the text does.
function rank(words: string[], name: string, rest: string): number {
  const lower = name.toLowerCase();
  if (words.length > 0 && lower.startsWith(words[0])) return 0;
  if (hasAll(words, lower)) return 1;
  return hasAll(words, `${lower} ${rest.toLowerCase()}`) ? 2 : 3;
}

// A short piece of text around the first word that matched.
function snippetOf(words: string[], text: string): string {
  const flat = text.replace(/\s+/g, ' ');
  const lower = flat.toLowerCase();
  const at = words.map((w) => lower.indexOf(w)).find((i) => i >= 0) ?? 0;
  const from = Math.max(0, at - 30);
  const to = Math.min(flat.length, at + 70);
  return `${from > 0 ? '…' : ''}${flat.slice(from, to).trim()}${to < flat.length ? '…' : ''}`;
}

const header = (label: string): MenuItem => ({ type: 'header', label });

// ---- The rows ----------------------------------------------------------------------

export function quickSearchItems(
  query: string,
  sources: QuickSources,
): MenuItem[] {
  const typed = query.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
  const words = wordsOf(typed);
  const limit = words.length === 0 ? EMPTY_PER_GROUP : TYPED_PER_GROUP;
  const spaceName = (id: number | null) =>
    id === null
      ? null
      : (sources.state.spaces.find((s) => s.id === id)?.name ?? null);
  const out: MenuItem[] = [];

  // What you typed: three things it can be used for.
  if (typed !== '') {
    if (looksLikeAddress(typed)) {
      out.push({
        type: 'item',
        id: `quick.go:${typed}`,
        label: `Go to ${typed}`,
        detail: 'Open this address',
        icon: 'arrow-right',
      });
    }
    out.push({
      type: 'item',
      id: `quick.search:${typed}`,
      label: `Search for “${typed}”`,
      detail: `Search with ${sources.engineName}`,
      icon: 'search',
    });
    out.push({
      type: 'item',
      id: `quick.ask:${typed}`,
      label: `Ask about “${typed}”`,
      detail: 'Start a chat with the assistant',
      icon: 'sparkle',
    });
  }

  const group = (label: string, rows: MenuEntry[]) => {
    if (rows.length === 0) return;
    out.push(header(label), ...rows.slice(0, limit));
  };
  // The pages already listed above, so history does not repeat them.
  const seen = new Set<string>();
  const remember = (url: string) => {
    const key = historyUrl(url);
    if (key !== null) seen.add(key);
  };

  // Open tabs, from every Space (the one you are on is marked).
  const activeId =
    sources.state.active?.kind === 'tab' ? sources.state.active.id : null;
  const openTabs = sources.state.tabs
    .filter((t) => !t.closed)
    .map((t) => ({
      t,
      text: `${t.title} ${hostOf(t.url)} ${t.url}`,
    }))
    .filter(({ text }) => hasAll(words, text))
    .map(({ t }) => ({
      t,
      score: rank(words, t.title, `${hostOf(t.url)} ${t.url}`),
    }))
    .sort((a, b) => a.score - b.score);
  group(
    'Open tabs',
    openTabs.map(({ t }): MenuEntry => {
      remember(t.url);
      const host = hostOf(t.url);
      const space = spaceName(t.spaceId);
      return {
        type: 'item',
        id: `quick.tab:${t.id}`,
        label: t.title.trim() || host || 'New tab',
        detail: space ? `${host} · ${space}` : host,
        image: t.favicon ?? undefined,
        checked: t.id === activeId,
      };
    }),
  );

  // Pages kept in a Space with no tab open, then the tabs you closed lately.
  const kept = sources.state.tabs
    .filter(
      (t) => t.closed && hasAll(words, `${t.title} ${hostOf(t.url)} ${t.url}`),
    )
    .map((t) => ({
      t,
      score: rank(words, t.title, `${hostOf(t.url)} ${t.url}`),
    }))
    .sort((a, b) => a.score - b.score);
  const keptKeys = new Set(kept.map(({ t }) => historyUrl(t.url)));
  const recent = [...sources.closed]
    .reverse()
    .filter(
      (c) =>
        !keptKeys.has(historyUrl(c.url)) &&
        hasAll(words, `${c.title} ${hostOf(c.url)} ${c.url}`),
    );
  group('Closed pages', [
    ...kept.map(({ t }): MenuEntry => {
      remember(t.url);
      const space = spaceName(t.spaceId);
      return {
        type: 'item',
        id: `quick.tab:${t.id}`,
        label: t.title.trim() || hostOf(t.url),
        detail: space
          ? `Open again · ${hostOf(t.url)} · ${space}`
          : `Open again · ${hostOf(t.url)}`,
        image: t.favicon ?? undefined,
      };
    }),
    ...recent.map((c): MenuEntry => {
      remember(c.url);
      const space = spaceName(c.spaceId);
      return {
        type: 'item',
        id: `quick.closed:${c.id}`,
        label: c.title.trim() || hostOf(c.url),
        detail: space
          ? `Reopen · ${hostOf(c.url)} · ${space}`
          : `Reopen · ${hostOf(c.url)}`,
      };
    }),
  ]);

  // Spaces.
  const spaces = sources.state.spaces
    .filter((s) => hasAll(words, s.name))
    .map((s) => ({ s, score: rank(words, s.name, '') }))
    .sort((a, b) => a.score - b.score);
  group(
    'Spaces',
    spaces.map(
      ({ s }): MenuEntry => ({
        type: 'item',
        id: `quick.space:${s.id}`,
        label: s.name,
        detail: 'Space',
        emoji: emojiOr(s.emoji, DEFAULT_SPACE_EMOJI),
      }),
    ),
  );

  // Artifacts: by name first, then by what they say.
  const artifacts = [...sources.artifacts]
    .filter(
      (a) =>
        hasAll(words, a.title) ||
        (a.kind !== 'file' && hasAll(words, `${a.title} ${a.content}`)),
    )
    .map((a) => ({
      a,
      score: rank(words, a.title, a.kind === 'file' ? '' : a.content),
    }))
    .sort((x, y) => x.score - y.score || y.a.updatedAt - x.a.updatedAt);
  group(
    'Artifacts',
    artifacts.map(({ a, score }): MenuEntry => {
      const space = spaceName(a.spaceId);
      const inText = score >= 2 && words.length > 0;
      return {
        type: 'item',
        id: `quick.artifact:${a.id}`,
        label: a.title.trim() || 'Untitled',
        detail: inText
          ? snippetOf(words, a.content)
          : space
            ? `Artifact · ${space}`
            : 'Artifact',
        emoji: emojiOr(a.emoji, defaultArtifactEmoji(a.kind)),
      };
    }),
  );

  // Chats: by name and by what was said; with nothing typed, the latest.
  const chatRows: MenuEntry[] =
    words.length === 0
      ? byRecency(sources.chats.conversations.filter((c) => !isUntouched(c)))
          .slice(0, limit)
          .map((c) => ({
            type: 'item' as const,
            id: `quick.chat:${c.id}`,
            label: c.title,
            detail: 'Chat',
            emoji: emojiOr(c.emoji, DEFAULT_CHAT_EMOJI),
          }))
      : searchChats(sources.chats, typed).map(({ id, snippet }) => {
          const chat = sources.chats.conversations.find((c) => c.id === id);
          return {
            type: 'item' as const,
            id: `quick.chat:${id}`,
            label: chat?.title ?? 'Chat',
            detail: snippet ?? 'Chat',
            emoji: emojiOr(chat?.emoji ?? null, DEFAULT_CHAT_EMOJI),
          };
        });
  group('Chats', chatRows);

  // Bookmarks and history only when something is typed (they are long lists).
  if (words.length > 0) {
    const bookmarks = [...sources.bookmarks]
      .reverse()
      .filter((b) => hasAll(words, `${b.title} ${b.url}`))
      .filter((b) => {
        const key = historyUrl(b.url);
        return key !== null && !seen.has(key);
      })
      .map((b) => ({
        b,
        score: rank(words, b.title, `${hostOf(b.url)} ${b.url}`),
      }))
      .sort((x, y) => x.score - y.score);
    group(
      'Bookmarks',
      bookmarks.map(({ b }): MenuEntry => {
        remember(b.url);
        return {
          type: 'item',
          id: `quick.page:${b.url}`,
          label: b.title.trim() || hostOf(b.url),
          detail: `Bookmark · ${hostOf(b.url)}`,
          icon: 'bookmark',
        };
      }),
    );

    // History: one row per page, the most recent visit's title.
    const pages = new Map<string, { url: string; title: string; at: number }>();
    for (let i = sources.history.length - 1; i >= 0; i--) {
      const entry = sources.history[i];
      const key = historyUrl(entry.url);
      if (key === null || seen.has(key) || pages.has(key)) continue;
      if (!hasAll(words, `${entry.title} ${entry.url}`)) continue;
      pages.set(key, { url: key, title: entry.title, at: entry.visitedAt });
      if (pages.size >= limit * 4) break;
    }
    group(
      'History',
      [...pages.values()]
        .map((p) => ({
          p,
          score: rank(words, p.title, `${hostOf(p.url)} ${p.url}`),
        }))
        .sort((x, y) => x.score - y.score || y.p.at - x.p.at)
        .map(
          ({ p }): MenuEntry => ({
            type: 'item',
            id: `quick.page:${p.url}`,
            label: p.title.trim() || hostOf(p.url),
            detail: hostOf(p.url),
            icon: 'history',
          }),
        ),
    );
  }

  return out;
}

// ---- Reading a chosen row ------------------------------------------------------------

export type QuickChoice =
  | { kind: 'go' | 'search' | 'ask'; text: string }
  | { kind: 'page'; url: string }
  | { kind: 'tab' | 'closed' | 'space' | 'artifact' | 'chat'; id: number };

export function parseQuickChoice(id: unknown): QuickChoice | null {
  if (typeof id !== 'string' || id.length > MAX_QUERY + 200) return null;
  const text = /^quick\.(go|search|ask):([\s\S]+)$/.exec(id);
  if (text) {
    const typed = text[2].trim();
    return typed === ''
      ? null
      : { kind: text[1] as 'go' | 'search' | 'ask', text: typed };
  }
  const page = /^quick\.page:([\s\S]+)$/.exec(id);
  if (page) return { kind: 'page', url: page[1] };
  const num = /^quick\.(tab|closed|space|artifact|chat):(\d+)$/.exec(id);
  return num
    ? {
        kind: num[1] as 'tab' | 'closed' | 'space' | 'artifact' | 'chat',
        id: Number(num[2]),
      }
    : null;
}
