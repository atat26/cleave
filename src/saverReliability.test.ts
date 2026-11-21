import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSaver, saveJson, saveJsonSync } from './storage.ts';

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cleave-saver-'));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const quiet = () => undefined;

// A path where writing fails: the file's place is taken by a folder, so the rename cannot work.
// Removing the folder later makes the same save work, like a program letting go of a file.
function blocked(dir: string, name = 'data.json') {
  const file = path.join(dir, name);
  fs.mkdirSync(file);
  return {
    file,
    release: () => fs.rmSync(file, { recursive: true, force: true }),
  };
}

test('a save that fails stays waiting and is tried again until it works', async () => {
  const dir = folder();
  const { file, release } = blocked(dir);
  let data = { n: 1 };
  const saver = createSaver(file, () => data, 10, quiet);
  saver.schedule();
  await sleep(120);
  // Still blocked: nothing saved, but it has not given up.
  assert.ok(fs.statSync(file).isDirectory());
  release();
  await sleep(400);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { n: 1 });
  data = { n: 2 };
  saver.schedule();
  await saver.flush();
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { n: 2 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('writing at close never throws, keeps the change waiting, and does not stop other files', () => {
  const dir = folder();
  const bad = blocked(dir, 'bad.json');
  const good = path.join(dir, 'good.json');
  const errors: unknown[] = [];
  const badSaver = createSaver(
    bad.file,
    () => ({ a: 1 }),
    10_000,
    (e) => errors.push(e),
  );
  const goodSaver = createSaver(good, () => ({ b: 2 }), 10_000, quiet);
  badSaver.schedule();
  goodSaver.schedule();
  // The window closing: every saver is written, in turn.
  assert.doesNotThrow(() => badSaver.flushSync());
  assert.doesNotThrow(() => goodSaver.flushSync());
  assert.equal(errors.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(good, 'utf8')), { b: 2 });
  // The failed one is still waiting: once it can be written, the next flush writes it.
  bad.release();
  badSaver.flushSync();
  assert.deepEqual(JSON.parse(fs.readFileSync(bad.file, 'utf8')), { a: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a slow older save can never land over a newer one', async () => {
  const dir = folder();
  const file = path.join(dir, 'order.json');
  const older = saveJson(file, { version: 'old' }); // starts first, finishes later
  saveJsonSync(file, { version: 'new' }); // the window closing writes at once
  await older;
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    version: 'new',
  });
  // No temporary files are left behind.
  assert.deepEqual(fs.readdirSync(dir), ['order.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a change made while an earlier write is still going is written at close, and the older write cannot land over it', async () => {
  const dir = folder();
  const file = path.join(dir, 'busy.json');
  let data = { n: 1 };
  const saver = createSaver(file, () => data, 1, quiet);
  saver.schedule();
  await sleep(5); // the first write has probably started but may not be finished
  data = { n: 2 };
  saver.schedule(); // a change, then the window closes
  saver.flushSync();
  await sleep(150);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { n: 2 });
  assert.deepEqual(fs.readdirSync(dir), ['busy.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});
