import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  createSaver,
  forgetUnreadable,
  isUnreadable,
  loadJson,
  saveJson,
  saveJsonSync,
} from './storage.ts';

const made: string[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleave-storage-'));
  made.push(dir);
  forgetUnreadable();
  return dir;
};
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const parse = (raw: unknown) => raw as { n: number };
const fresh = () => ({ n: 0 });
const error = (code: string) =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;
const fast = { delayMs: 0, retries: 3 };

test('a file that is busy for a moment is read when it frees up', async () => {
  const file = path.join(temp(), 'a.json');
  let tries = 0;
  const loaded = await loadJson(file, parse, fresh, {
    ...fast,
    read: async () => {
      tries++;
      if (tries <= 2) throw error('EBUSY');
      return '{"n": 7}';
    },
  });
  assert.deepEqual(loaded, { n: 7 });
  assert.equal(tries, 3);
  assert.equal(isUnreadable(file), false);
});

test('a file that cannot be read is left exactly as it is: nothing is saved over it', async () => {
  const file = path.join(temp(), 'b.json');
  fs.writeFileSync(file, '{"n": 41, "precious": true}');
  let tries = 0;
  const loaded = await loadJson(file, parse, fresh, {
    ...fast,
    read: async () => {
      tries++;
      throw error('EBUSY');
    },
  });
  // The run starts without it...
  assert.deepEqual(loaded, { n: 0 });
  assert.equal(tries, 1 + fast.retries);
  assert.equal(isUnreadable(file), true);
  // ...but neither kind of save, nor the delayed saver, touches the real file.
  await saveJson(file, { n: 1 });
  saveJsonSync(file, { n: 2 });
  const saver = createSaver(file, () => ({ n: 3 }), 0);
  saver.schedule();
  await saver.flush();
  saver.schedule();
  saver.flushSync();
  assert.equal(fs.readFileSync(file, 'utf8'), '{"n": 41, "precious": true}');
  assert.ok(!fs.existsSync(`${file}.tmp`));
});

test('an error that will not pass is not retried, and is protected the same way', async () => {
  const file = path.join(temp(), 'c.json');
  fs.writeFileSync(file, '{"n": 5}');
  let tries = 0;
  const loaded = await loadJson(file, parse, fresh, {
    ...fast,
    read: async () => {
      tries++;
      throw error('EIO');
    },
  });
  assert.deepEqual(loaded, { n: 0 });
  assert.equal(tries, 1);
  await saveJson(file, { n: 9 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{"n": 5}');
});

test('a file that is not there is a new start: it is saved normally', async () => {
  const file = path.join(temp(), 'd.json');
  const loaded = await loadJson(file, parse, fresh, fast);
  assert.deepEqual(loaded, { n: 0 });
  assert.equal(isUnreadable(file), false);
  await saveJson(file, { n: 4 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { n: 4 });
});

test('a broken file is moved aside and a new one can be saved', async () => {
  const dir = temp();
  const file = path.join(dir, 'e.json');
  fs.writeFileSync(file, '{ not json');
  const loaded = await loadJson(file, parse, fresh, fast);
  assert.deepEqual(loaded, { n: 0 });
  assert.equal(fs.readFileSync(`${file}.corrupt`, 'utf8'), '{ not json');
  assert.equal(isUnreadable(file), false);
  await saveJson(file, { n: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { n: 1 });
});

test('a broken file that cannot be moved aside is not written over either', async () => {
  const dir = temp();
  const file = path.join(dir, 'f.json');
  fs.writeFileSync(file, '{ not json');
  // Something that cannot be replaced is in the way of "f.json.corrupt".
  fs.mkdirSync(`${file}.corrupt`);
  fs.writeFileSync(path.join(`${file}.corrupt`, 'keep'), 'x');
  const loaded = await loadJson(file, parse, fresh, fast);
  assert.deepEqual(loaded, { n: 0 });
  assert.equal(isUnreadable(file), true);
  await saveJson(file, { n: 1 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{ not json');
});

test('only the file that could not be read is held back', async () => {
  const dir = temp();
  const bad = path.join(dir, 'bad.json');
  const good = path.join(dir, 'good.json');
  fs.writeFileSync(bad, '{"n": 1}');
  await loadJson(bad, parse, fresh, {
    ...fast,
    read: async () => {
      throw error('EPERM');
    },
  });
  await saveJson(good, { n: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(good, 'utf8')), { n: 2 });
  assert.equal(fs.readFileSync(bad, 'utf8'), '{"n": 1}');
});
