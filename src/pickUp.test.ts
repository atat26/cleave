import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Artifact } from './artifacts.ts';
import type { Conversation } from './chats.ts';
import type { SavedTab } from './model.ts';
import { MAX_PICK, pickUpRows, recentSpaceIds, timeAgo } from './pickUp.ts';
import type { PickSources } from './pickUp.ts';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const MIN = 60_000;

const chat = (
  id: number,
  spaceId: number | null,
  at: number,
  said = true,
): Conversation =>
  ({
    id,
    title: `Chat ${id}`,
    refs:
      spaceId === null
        ? []
        : [{ kind: 'space', id: spaceId, title: 'S', url: null }],
    messages: said ? [{}] : [],
    updatedAt: at,
  }) as unknown as Conversation;

const art = (id: number, spaceId: number | null, at: number): Artifact =>
  ({ id, title: `Doc ${id}`, spaceId, updatedAt: at }) as unknown as Artifact;

const tab = (id: number, spaceId: number | null, url: string): SavedTab =>
  ({
    id,
    url,
    title: `Page ${id}`,
    spaceId,
    favicon: null,
    closed: false,
  }) as SavedTab;

const sources = (): PickSources => ({
  tabs: [
    tab(9, 1, 'https://a.example/x'),
    tab(10, 2, 'https://b.example/'),
    tab(11, 1, 'about:newtab'),
  ],
  artifacts: [art(2, 1, NOW - 5 * MIN), art(3, 2, NOW - MIN)],
  chats: [
    chat(4, 1, NOW - 12 * MIN),
    chat(5, 1, NOW - 50 * MIN),
    chat(6, 1, NOW, false),
    chat(7, null, NOW),
  ],
  history: [
    {
      id: 1,
      url: 'https://a.example/x#frag',
      title: 'A',
      visitedAt: NOW - 60 * MIN,
    },
  ],
});

test("Pick up shows this Space's chats, artifacts and pages, newest first, three at most", () => {
  const { rows, total } = pickUpRows(1, sources(), []);
  assert.deepEqual(
    rows.map((r) => r.key),
    ['artifact:2', 'chat:4', 'chat:5'],
  );
  assert.equal(rows.length, MAX_PICK);
  // Three more candidates than shown: 2 artifact/chat rows plus the page.
  assert.equal(total, 4);
  assert.equal(rows[0].title, 'Doc 2');
});

test('an empty chat, a chat with no Space, and a new tab never appear; a page needs a visit', () => {
  const { rows } = pickUpRows(1, sources(), ['artifact:2', 'chat:4', 'chat:5']);
  assert.deepEqual(
    rows.map((r) => r.key),
    ['page:9'],
  );
  assert.equal(
    pickUpRows(1, sources(), []).rows.some((r) => r.key === 'chat:6'),
    false,
  );
  assert.equal(
    pickUpRows(1, sources(), []).rows.some((r) => r.key === 'chat:7'),
    false,
  );
});

test('hiding an item takes it off Pick up and brings the next one up', () => {
  const { rows, total } = pickUpRows(1, sources(), ['artifact:2']);
  assert.deepEqual(
    rows.map((r) => r.key),
    ['chat:4', 'chat:5', 'page:9'],
  );
  assert.equal(total, 3);
});

test('with no Space there is no Pick up', () => {
  assert.deepEqual(pickUpRows(null, sources(), []), { rows: [], total: 0 });
});

test('Spaces are ordered by when they were last used; unused ones keep their order', () => {
  assert.deepEqual(recentSpaceIds([1, 2, 3], sources()), [2, 1, 3]);
  const later: PickSources = {
    ...sources(),
    artifacts: [art(2, 1, NOW + 5 * MIN), art(3, 2, NOW - MIN)],
  };
  assert.deepEqual(recentSpaceIds([1, 2, 3], later), [1, 2, 3]);
  assert.deepEqual(
    recentSpaceIds([5, 6], { tabs: [], artifacts: [], chats: [], history: [] }),
    [5, 6],
  );
});

test('times read as short phrases', () => {
  assert.equal(timeAgo(NOW - 20_000, NOW), 'Just now');
  assert.equal(timeAgo(NOW - 12 * MIN, NOW), '12 min ago');
  assert.equal(timeAgo(NOW - 60 * MIN, NOW), '1 hour ago');
  assert.equal(timeAgo(NOW - 5 * 60 * MIN, NOW), '5 hours ago');
  assert.equal(timeAgo(NOW - 30 * 60 * MIN, NOW), 'Yesterday');
  assert.equal(timeAgo(NOW - 3 * 24 * 60 * MIN, NOW), '3 days ago');
  assert.equal(timeAgo(NOW - 21 * 24 * 60 * MIN, NOW), '3 weeks ago');
  assert.equal(timeAgo(NOW - 400 * 24 * 60 * MIN, NOW), 'Earlier');
});

test('two tabs on the same page are one item', () => {
  const two: PickSources = {
    ...sources(),
    chats: [],
    artifacts: [],
    tabs: [
      tab(9, 1, 'https://a.example/x'),
      tab(12, 1, 'https://a.example/x#other'),
    ],
  };
  assert.deepEqual(
    pickUpRows(1, two, []).rows.map((r) => r.key),
    ['page:9'],
  );
});

test('a chat with a reply nobody has read is marked "Reply waiting"; nothing else is', () => {
  const from = { ...sources(), unread: new Set([5, 99]) };
  const { rows } = pickUpRows(1, from, []);
  const flags = Object.fromEntries(rows.map((r) => [r.key, r.unread]));
  assert.equal(flags['chat:5'], true);
  assert.equal(flags['chat:4'], false);
  assert.equal(flags['artifact:2'], false);
  // Nothing is unread unless said so.
  assert.ok(pickUpRows(1, sources(), []).rows.every((r) => !r.unread));
});
