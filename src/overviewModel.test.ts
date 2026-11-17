import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agoWords,
  matchesQuery,
  overviewContent,
  summaryLine,
} from './overviewModel.ts';

const page = (id: number, title: string, url: string, closed = false) => ({
  id,
  title,
  url,
  closed,
});

test('a search matches when every word appears, in any order and any letter case', () => {
  assert.equal(matchesQuery('', 'anything'), true);
  assert.equal(matchesQuery('   ', 'anything'), true);
  assert.equal(matchesQuery('gpu tesla', 'Dell NVIDIA Tesla K80 GPU'), true);
  assert.equal(matchesQuery('TESLA gpu', 'dell nvidia tesla k80 gpu'), true);
  assert.equal(matchesQuery('gpu amd', 'Dell NVIDIA Tesla K80 GPU'), false);
  assert.equal(matchesQuery('ebay', 'Title', 'www.ebay.com'), true);
});

test('pages are split into open and closed, and the search narrows everything', () => {
  const pages = [
    page(1, 'Tesla K80 listing', 'https://www.ebay.com/itm/1'),
    page(2, 'Old forum thread', 'https://forum.example.org/t/9', true),
    page(3, 'Tesla news', 'https://news.example.com/', true),
  ];
  const artifacts = [
    { id: 1, title: 'GPU notes', kind: 'markdown' },
    { id: 2, title: 'Budget calc', kind: 'html' },
  ];
  const chats = [
    { id: 1, title: 'Which GPU?', updatedAt: 100 },
    { id: 2, title: 'Dinner ideas', updatedAt: 300 },
    { id: 3, title: 'GPU prices', updatedAt: 200 },
  ];
  const all = overviewContent({ query: '', pages, artifacts, chats });
  assert.deepEqual(
    all.open.map((p) => p.id),
    [1],
  );
  assert.deepEqual(
    all.closed.map((p) => p.id),
    [2, 3],
  );
  assert.equal(all.artifacts.length, 2);
  // Chats: most recently used first.
  assert.deepEqual(
    all.chats.map((c) => c.id),
    [2, 3, 1],
  );

  const gpu = overviewContent({ query: 'gpu', pages, artifacts, chats });
  assert.deepEqual(
    gpu.open.map((p) => p.id),
    [],
  );
  assert.deepEqual(
    gpu.artifacts.map((a) => a.id),
    [1],
  );
  assert.deepEqual(
    gpu.chats.map((c) => c.id),
    [3, 1],
  );
  const tesla = overviewContent({ query: 'tesla', pages, artifacts, chats });
  assert.deepEqual(
    tesla.open.map((p) => p.id),
    [1],
  );
  assert.deepEqual(
    tesla.closed.map((p) => p.id),
    [3],
  );
  // A web address can be searched by its site; kind too.
  assert.deepEqual(
    overviewContent({
      query: 'forum.example',
      pages,
      artifacts,
      chats,
    }).closed.map((p) => p.id),
    [2],
  );
  assert.deepEqual(
    overviewContent({ query: 'html', pages, artifacts, chats }).artifacts.map(
      (a) => a.id,
    ),
    [2],
  );
  // The lists given are never changed.
  assert.deepEqual(
    chats.map((c) => c.id),
    [1, 2, 3],
  );
});

test('the line under a Space name leaves out what there is none of', () => {
  assert.equal(
    summaryLine({ pages: 0, open: 0, artifacts: 0, chats: 0 }),
    'Nothing here yet',
  );
  assert.equal(
    summaryLine({ pages: 1, open: 1, artifacts: 0, chats: 0 }),
    '1 page (1 open)',
  );
  assert.equal(
    summaryLine({ pages: 12, open: 4, artifacts: 3, chats: 2 }),
    '12 pages (4 open) · 3 artifacts · 2 chats',
  );
  assert.equal(
    summaryLine({ pages: 0, open: 0, artifacts: 1, chats: 1 }),
    '1 artifact · 1 chat',
  );
});

test('time is said in a few plain words', () => {
  const now = new Date('2026-11-17T12:00:00').getTime();
  const ago = (ms: number) => agoWords(now - ms, now);
  assert.equal(ago(0), 'just now');
  assert.equal(ago(30_000), 'just now');
  assert.equal(ago(5 * 60_000), '5 min ago');
  assert.equal(ago(3 * 3_600_000), '3 h ago');
  assert.equal(ago(30 * 3_600_000), 'yesterday');
  assert.equal(ago(4 * 86_400_000), '4 days ago');
  assert.equal(ago(20 * 86_400_000), 'Oct 28');
  // The future is not "negative minutes".
  assert.equal(agoWords(now + 60_000, now), 'just now');
});
