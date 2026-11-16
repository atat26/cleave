import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_SUGGESTIONS,
  SUGGEST_ROW_HEIGHT,
  suggest,
  suggestRect,
  typedRow,
} from './suggest.ts';
import type { SuggestSources } from './suggest.ts';
import { looksLikeAddress } from './url.ts';

const NOW = new Date(2026, 10, 14, 15, 0).getTime();
const DAY = 24 * 60 * 60_000;

const none = (): SuggestSources => ({ bookmarks: [], history: [], tabs: [] });

test('what is typed comes first: an address to go to, or a web search', () => {
  assert.equal(typedRow('example.com')?.kind, 'go');
  assert.equal(typedRow('https://a.example/x')?.kind, 'go');
  assert.equal(typedRow('cheap gpu')?.kind, 'search');
  assert.equal(typedRow('javascript:alert(1)')?.kind, 'search');
  assert.equal(typedRow('   '), null);
  assert.equal(looksLikeAddress('localhost:3000'), true);
  assert.equal(looksLikeAddress('hello world'), false);
  const rows = suggest('cheap gpu', none(), NOW);
  assert.equal(rows.length, 1);
  assert.match(rows[0].url, /^https:\/\/duckduckgo\.com\/\?q=cheap%20gpu/);
});

test('nothing is suggested for an empty box', () => {
  assert.deepEqual(suggest('', none(), NOW), []);
  assert.deepEqual(suggest('  ', none(), NOW), []);
});

test('matches need every word, in the site, title or address', () => {
  const sources: SuggestSources = {
    ...none(),
    history: [
      {
        url: 'https://docs.example/models',
        title: 'Models overview',
        visitedAt: NOW - DAY,
      },
      {
        url: 'https://shop.example/gpu',
        title: 'Graphics cards',
        visitedAt: NOW - DAY,
      },
    ],
  };
  const urls = (text: string) =>
    suggest(text, sources, NOW)
      .slice(1)
      .map((r) => r.url);
  assert.deepEqual(urls('docs'), ['https://docs.example/models']);
  assert.deepEqual(urls('graphics shop'), ['https://shop.example/gpu']);
  assert.deepEqual(urls('graphics docs'), []);
  assert.deepEqual(urls('zzz'), []);
});

test('a site that starts with what you typed beats a title that only contains it', () => {
  const sources: SuggestSources = {
    ...none(),
    history: [
      {
        url: 'https://other.example/a',
        title: 'All about docs',
        visitedAt: NOW,
      },
      {
        url: 'https://docs.example/a',
        title: 'Home',
        visitedAt: NOW - 20 * DAY,
      },
    ],
  };
  const rows = suggest('docs', sources, NOW).slice(1);
  assert.equal(rows[0].url, 'https://docs.example/a');
});

test('bookmarks and open tabs outrank plain history for the same match', () => {
  const sources: SuggestSources = {
    bookmarks: [{ url: 'https://wiki.example/b', title: 'Wiki bookmark' }],
    history: [
      { url: 'https://wiki.example/h', title: 'Wiki history', visitedAt: NOW },
    ],
    tabs: [
      {
        id: 5,
        url: 'https://wiki.example/t',
        title: 'Wiki tab',
        closed: false,
      },
    ],
  };
  const rows = suggest('wiki', sources, NOW).slice(1);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['bookmark', 'tab', 'history'],
  );
});

test('the same page from several sources shows once, as the best kind', () => {
  const url = 'https://wiki.example/page';
  const sources: SuggestSources = {
    bookmarks: [{ url, title: 'Wiki page' }],
    history: [
      { url: `${url}#intro`, title: 'Wiki page', visitedAt: NOW - DAY },
      { url, title: 'Wiki page', visitedAt: NOW },
    ],
    tabs: [{ id: 9, url, title: 'Wiki page', closed: false }],
  };
  const rows = suggest('wiki', sources, NOW).slice(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'tab');
  assert.equal(rows[0].tabId, 9);
  assert.match(rows[0].detail, /^Switch to tab/);
});

test('a page kept in a Space with no tab says it will be opened from the Space', () => {
  const sources: SuggestSources = {
    ...none(),
    tabs: [
      { id: 3, url: 'https://kept.example/', title: 'Kept page', closed: true },
    ],
  };
  const row = suggest('kept', sources, NOW)[1];
  assert.equal(row.kind, 'tab');
  assert.equal(row.closed, true);
  assert.match(row.detail, /^Open from a Space/);
});

test('pages visited more often and more recently rank higher', () => {
  const sources: SuggestSources = {
    ...none(),
    history: [
      {
        url: 'https://a.example/old',
        title: 'News old',
        visitedAt: NOW - 60 * DAY,
      },
      {
        url: 'https://b.example/new',
        title: 'News new',
        visitedAt: NOW - 1000,
      },
      {
        url: 'https://c.example/often',
        title: 'News often',
        visitedAt: NOW - 60 * DAY,
      },
      {
        url: 'https://c.example/often',
        title: 'News often',
        visitedAt: NOW - 61 * DAY,
      },
      {
        url: 'https://c.example/often',
        title: 'News often',
        visitedAt: NOW - 62 * DAY,
      },
    ],
  };
  const rows = suggest('news', sources, NOW).slice(1);
  assert.deepEqual(
    rows.map((r) => r.title),
    ['News new', 'News often', 'News old'],
  );
});

test('the address you typed is not repeated as a suggestion', () => {
  const sources: SuggestSources = {
    ...none(),
    history: [
      { url: 'https://example.com/', title: 'Example', visitedAt: NOW },
      { url: 'https://example.com/more', title: 'More', visitedAt: NOW },
    ],
  };
  const rows = suggest('example.com', sources, NOW);
  assert.equal(rows[0].kind, 'go');
  assert.deepEqual(
    rows.slice(1).map((r) => r.url),
    ['https://example.com/more'],
  );
});

test('only web pages are suggested, and there are never more than the limit', () => {
  const history = [
    { url: 'about:blank', title: 'blank thing', visitedAt: NOW },
    { url: 'file:///c:/thing', title: 'file thing', visitedAt: NOW },
    ...Array.from({ length: 30 }, (_, i) => ({
      url: `https://s${i}.example/thing`,
      title: `Thing ${i}`,
      visitedAt: NOW - i,
    })),
  ];
  const rows = suggest('thing', { ...none(), history }, NOW);
  assert.equal(rows.length, MAX_SUGGESTIONS);
  assert.ok(rows.slice(1).every((r) => r.url.startsWith('https://')));
});

test('the dropdown sits under the address bar, as wide as it, and fits its rows', () => {
  const rect = suggestRect({ x: 200, y: 8, width: 500, height: 32 }, 5, 900);
  assert.equal(rect.x, 200);
  assert.equal(rect.y, 8 + 32 + 4);
  assert.equal(rect.width, 500);
  assert.equal(rect.height, 5 * SUGGEST_ROW_HEIGHT + 12);
  // A narrow bar still gets a usable width.
  assert.equal(
    suggestRect({ x: 0, y: 0, width: 100, height: 32 }, 1, 900).width,
    240,
  );
  // It never runs past the bottom of the window.
  const short = suggestRect({ x: 0, y: 8, width: 500, height: 32 }, 8, 200);
  assert.ok(short.y + short.height <= 200);
  assert.equal(
    suggestRect({ x: 0, y: 8, width: 500, height: 32 }, 3, 20).height,
    0,
  );
});

test('the first row names the search engine in use', () => {
  const google = {
    id: 'google',
    name: 'Google',
    template: 'https://www.google.com/search?q=%s',
  };
  const row = typedRow('cheap gpu', google);
  assert.equal(row?.detail, 'Search with Google');
  assert.equal(row?.url, 'https://www.google.com/search?q=cheap%20gpu');
  assert.equal(typedRow('cheap gpu')?.detail, 'Search with DuckDuckGo');
});
