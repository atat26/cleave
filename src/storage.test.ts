import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { addSpace, addTab, defaultState } from './model.ts';
import { createSaver, loadState, saveState } from './storage.ts';

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
