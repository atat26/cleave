import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { addSpace, addTab, defaultState } from './model.ts';
import { newConversation } from './chats.ts';
import {
  createSaver,
  loadChats,
  loadState,
  saveJson,
  saveState,
} from './storage.ts';

// Each test works in its own throwaway folder under the system temp directory.
async function tempFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-browser-test-'));
  return { dir, file: path.join(dir, 'spaces.json') };
}

test('a missing file loads as a fresh default state', async () => {
  const { dir, file } = await tempFile();
  assert.deepEqual(await loadState(file), defaultState());
  await fs.rm(dir, { recursive: true });
});

test('save then load gives back the same state, with no temp file left', async () => {
  const { dir, file } = await tempFile();
  const state = addTab(addSpace(defaultState(), 'Work').state, {
    url: 'https://a.example',
  }).state;
  await saveState(file, state);
  assert.deepEqual(await loadState(file), state);
  assert.deepEqual(await fs.readdir(dir), ['spaces.json']);
  await fs.rm(dir, { recursive: true });
});

test('a corrupt file is set aside and the app starts fresh', async () => {
  const { dir, file } = await tempFile();
  await fs.writeFile(file, '{ this is not json', 'utf8');
  assert.deepEqual(await loadState(file), defaultState());
  assert.equal(
    await fs.readFile(`${file}.corrupt`, 'utf8'),
    '{ this is not json',
  );
  await fs.rm(dir, { recursive: true });
});

test('valid JSON with bad contents is repaired, not trusted', async () => {
  const { dir, file } = await tempFile();
  await fs.writeFile(
    file,
    JSON.stringify({
      tabs: [{ id: 1, url: 'file:///C:/x', title: '', spaceId: null }],
    }),
    'utf8',
  );
  assert.deepEqual((await loadState(file)).tabs, []);
  await fs.rm(dir, { recursive: true });
});

test('flushSync writes immediately and only when something changed', async () => {
  const { dir, file } = await tempFile();
  let state = defaultState();
  const saver = createSaver(file, () => state, 60_000);
  saver.flushSync(); // nothing scheduled: no file
  assert.deepEqual(await fs.readdir(dir), []);
  state = addTab(state, { url: 'https://now.example' }).state;
  saver.schedule();
  saver.flushSync();
  assert.equal((await loadState(file)).tabs.length, 1);
  await fs.rm(dir, { recursive: true });
});

test('chats load and save the same careful way (missing, corrupt, tampered)', async () => {
  const { dir, file } = await tempFile();
  // Missing file: one fresh conversation.
  const fresh = await loadChats(file);
  assert.equal(fresh.conversations.length, 1);
  // Round trip.
  const saved = newConversation(fresh).state;
  await saveJson(file, saved);
  assert.deepEqual(await loadChats(file), saved);
  // Tampered: bad entries dropped, still usable.
  await fs.writeFile(
    file,
    JSON.stringify({
      conversations: [{ id: 1, title: 'ok' }, { id: 'x' }],
      activeId: 7,
    }),
    'utf8',
  );
  const repaired = await loadChats(file);
  assert.deepEqual(
    repaired.conversations.map((c) => c.title),
    ['ok'],
  );
  assert.equal(repaired.activeId, 1);
  // Corrupt: set aside, start fresh.
  await fs.writeFile(file, '{ not json', 'utf8');
  assert.equal((await loadChats(file)).conversations.length, 1);
  assert.equal(await fs.readFile(`${file}.corrupt`, 'utf8'), '{ not json');
  await fs.rm(dir, { recursive: true });
});

test('the saver batches many changes into one write and flush writes at once', async () => {
  const { dir, file } = await tempFile();
  let state = defaultState();
  const saver = createSaver(file, () => state, 20);
  for (let i = 0; i < 5; i++) {
    state = addTab(state, { url: `https://t${i}.example` }).state;
    saver.schedule();
  }
  await saver.flush();
  assert.equal((await loadState(file)).tabs.length, 5);
  state = addTab(state, { url: 'https://last.example' }).state;
  saver.schedule();
  await saver.flush(); // no waiting for the timer
  assert.equal((await loadState(file)).tabs.length, 6);
  await fs.rm(dir, { recursive: true });
});
