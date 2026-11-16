import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeCount,
  addDownload,
  byteText,
  clearFinished,
  downloadSummary,
  RECENT_MS,
  defaultDownloads,
  FLOOD_LIMIT,
  FLOOD_WINDOW_MS,
  floodCheck,
  MAX_DOWNLOADS,
  parseDownloads,
  progressOf,
  removeDownload,
  statusText,
  updateDownload,
} from './downloadList.ts';
import type { DownloadItem, DownloadState } from './downloadList.ts';

const NOW = 1_000_000;
const file = (name: string, state: 'downloading' | 'done' = 'downloading') => ({
  url: `https://a.example/${name}`,
  name,
  path: `C:/Downloads/${name}`,
  totalBytes: 1000,
  state,
});

test('a download is added with its details, newest last, and gets progress and an end', () => {
  const added = addDownload(defaultDownloads(), file('a.pdf'), NOW);
  assert.equal(added.id, 1);
  assert.equal(added.state.items[0].state, 'downloading');
  assert.equal(added.state.items[0].endedAt, null);
  let state = updateDownload(added.state, 1, { receivedBytes: 400 }, NOW + 1);
  assert.equal(progressOf(state.items[0]), 0.4);
  assert.equal(activeCount(state), 1);
  state = updateDownload(
    state,
    1,
    { state: 'done', receivedBytes: 1000 },
    NOW + 5,
  );
  assert.equal(state.items[0].endedAt, NOW + 5);
  assert.equal(progressOf(state.items[0]), 1);
  assert.equal(activeCount(state), 0);
  assert.equal(updateDownload(state, 99, { state: 'done' }, NOW), state);
});

test('a download that is blocked starts already ended and is not active', () => {
  const blocked = addDownload(
    defaultDownloads(),
    { ...file('b.zip'), state: 'blocked' as never },
    NOW,
  );
  assert.equal(activeCount(blocked.state), 0);
  assert.equal(blocked.state.items[0].endedAt, NOW);
});

test('a download can be removed, and the finished ones cleared (not those still going)', () => {
  let state = addDownload(defaultDownloads(), file('a.pdf', 'done'), NOW).state;
  state = addDownload(state, file('b.pdf'), NOW).state;
  state = addDownload(state, file('c.pdf', 'done'), NOW).state;
  assert.deepEqual(
    removeDownload(state, 1).items.map((i) => i.name),
    ['b.pdf', 'c.pdf'],
  );
  assert.equal(removeDownload(state, 99), state);
  assert.deepEqual(
    clearFinished(state).items.map((i) => i.name),
    ['b.pdf'],
  );
  assert.equal(clearFinished(defaultDownloads()).items.length, 0);
});

test('the list is capped, dropping the oldest finished ones first', () => {
  let state = defaultDownloads();
  state = addDownload(state, file('active.bin'), NOW).state;
  for (let i = 0; i < MAX_DOWNLOADS + 5; i++) {
    state = addDownload(state, file(`f${i}.txt`, 'done'), NOW + i).state;
  }
  assert.equal(state.items.length, MAX_DOWNLOADS);
  // The one still going was not dropped.
  assert.ok(state.items.some((i) => i.name === 'active.bin'));
});

test('sizes read in plain units', () => {
  assert.equal(byteText(12), '12 B');
  assert.equal(byteText(1536), '1.5 KB');
  assert.equal(byteText(5 * 1024 * 1024), '5 MB');
  assert.equal(byteText(250 * 1024 * 1024), '250 MB');
  assert.equal(byteText(3 * 1024 ** 3), '3 GB');
});

const item = (
  state: DownloadState,
  received = 0,
  total = 2048,
): DownloadItem => ({
  id: 1,
  url: '',
  name: 'x',
  path: '',
  totalBytes: total,
  receivedBytes: received,
  state,
  startedAt: 0,
  endedAt: null,
});

test('the status says how far along it is, or how it ended', () => {
  assert.equal(statusText(item('downloading', 1024)), '1 KB of 2 KB');
  assert.equal(statusText(item('paused', 1024)), 'Paused · 1 KB of 2 KB');
  assert.equal(statusText(item('downloading', 1024, 0)), '1 KB');
  assert.equal(statusText(item('done')), '2 KB');
  assert.equal(statusText(item('cancelled')), 'Cancelled');
  assert.equal(statusText(item('failed')), 'Failed');
  assert.match(statusText(item('blocked')), /too many/);
  assert.equal(progressOf(item('downloading', 1, 0)), null);
});

test('a page starting too many downloads at once is blocked, then allowed again', () => {
  let starts: number[] = [];
  for (let i = 0; i < FLOOD_LIMIT; i++) {
    const check = floodCheck(starts, NOW + i);
    assert.equal(check.allowed, true);
    starts = check.starts;
  }
  const blocked = floodCheck(starts, NOW + FLOOD_LIMIT);
  assert.equal(blocked.allowed, false);
  // A moment later the earlier ones no longer count.
  assert.equal(floodCheck(starts, NOW + FLOOD_WINDOW_MS + 10).allowed, true);
});

test('a download cut off when the app closed is marked failed, and junk is dropped', () => {
  const parsed = parseDownloads(
    {
      nextId: 5,
      items: [
        {
          id: 1,
          url: 'https://a.example/x',
          name: 'x.zip',
          path: 'C:/x.zip',
          totalBytes: 10,
          receivedBytes: 4,
          state: 'downloading',
          startedAt: 5,
          endedAt: null,
        },
        {
          id: 2,
          url: 'u',
          name: 'done.pdf',
          path: 'p',
          totalBytes: 9,
          receivedBytes: 9,
          state: 'done',
          startedAt: 6,
          endedAt: 7,
        },
        { id: 2, url: 'u', name: 'dup.pdf', state: 'done' },
        { id: 3, name: '', state: 'done' },
        { id: 4, name: 'odd.bin', state: 'weird', totalBytes: -5 },
        'junk',
      ],
    },
    NOW,
  );
  assert.deepEqual(
    parsed.items.map((i) => [i.name, i.state]),
    [
      ['x.zip', 'failed'],
      ['done.pdf', 'done'],
      ['odd.bin', 'failed'],
    ],
  );
  assert.equal(parsed.items[0].endedAt, NOW);
  assert.equal(parsed.items[2].totalBytes, 0);
  assert.ok(parsed.nextId >= 5);
  for (const junk of [null, 5, 'x', [], {}, { items: 'no' }]) {
    assert.equal(parseDownloads(junk, NOW).items.length, 0);
  }
});

test('the indicator says how many are going and how far, or that one just finished', () => {
  let state = addDownload(defaultDownloads(), file('a.bin'), NOW).state;
  state = addDownload(state, file('b.bin'), NOW).state;
  state = updateDownload(state, 1, { receivedBytes: 500 }, NOW);
  state = updateDownload(state, 2, { receivedBytes: 250 }, NOW);
  const going = downloadSummary(state, NOW + 1);
  assert.equal(going.active, 2);
  assert.equal(going.progress, 0.375);
  assert.equal(going.recent, null);
  // A download of unknown size makes the combined progress unknown.
  const unknown = addDownload(
    state,
    { ...file('c.bin'), totalBytes: 0 },
    NOW,
  ).state;
  assert.equal(downloadSummary(unknown, NOW).progress, null);
  // All finished: mentioned for a few seconds, then quiet.
  let done = updateDownload(state, 1, { state: 'done' }, NOW + 1000);
  done = updateDownload(done, 2, { state: 'done' }, NOW + 2000);
  assert.deepEqual(downloadSummary(done, NOW + 3000), {
    active: 0,
    progress: null,
    recent: 'done',
  });
  assert.equal(downloadSummary(done, NOW + 2000 + RECENT_MS + 1).recent, null);
  // A failure is noticed too; cancelled and blocked ones are not news.
  const failed = updateDownload(state, 1, { state: 'failed' }, NOW + 1000);
  const mixed = updateDownload(failed, 2, { state: 'cancelled' }, NOW + 1000);
  assert.equal(downloadSummary(mixed, NOW + 1500).recent, 'failed');
  const quiet = updateDownload(
    updateDownload(state, 1, { state: 'cancelled' }, NOW),
    2,
    { state: 'cancelled' },
    NOW,
  );
  assert.equal(downloadSummary(quiet, NOW + 1).recent, null);
  assert.deepEqual(downloadSummary(defaultDownloads(), NOW), {
    active: 0,
    progress: null,
    recent: null,
  });
});
