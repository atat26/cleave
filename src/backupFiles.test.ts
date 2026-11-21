import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { KEYS_FILE } from './backupFormat.ts';
import {
  PENDING_RESTORE_DIR,
  applyPendingRestore,
  autoSnapshot,
  createBackup,
  listAutoSnapshots,
  readRestoreResult,
  snapshotIfDue,
  stageRestore,
  verifyBackup,
} from './backupFiles.ts';

const made: string[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleave-backup-'));
  made.push(dir);
  return dir;
};
// The test folders are removed when the tests end.
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});
const write = (dir: string, name: string, text: string) => {
  const file = path.join(dir, ...name.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const read = (dir: string, name: string) =>
  fs.readFileSync(path.join(dir, ...name.split('/')), 'utf8');
const exists = (dir: string, name: string) =>
  fs.existsSync(path.join(dir, ...name.split('/')));

// A data folder like the app's: data files, an extension list, keys, uploads, and things a backup
// must never touch.
function makeData(label: string): string {
  const dir = temp();
  write(dir, 'spaces.json', `spaces ${label}`);
  write(dir, 'chats.json', `chats ${label}`);
  write(dir, 'artifacts.json', `artifacts ${label}`);
  write(dir, 'extensions.json', `extension list ${label}`);
  write(dir, KEYS_FILE, `keys ${label}`);
  write(dir, 'uploads/7.png', `picture ${label}`);
  write(dir, 'Preferences', 'browser engine file');
  write(dir, 'Cache/data_0', 'cache');
  return dir;
}
const make = (
  dataDir: string,
  extra: Partial<Parameters<typeof createBackup>[0]> = {},
) =>
  createBackup({
    dataDir,
    parentDir: temp(),
    folderName: 'Cleave backup test',
    appVersion: '0.1.1',
    includeKeys: false,
    now: new Date(2026, 10, 20, 16, 30, 0),
    ...extra,
  });

test('a backup holds the data files and uploads, and not extensions, keys, caches or engine files', () => {
  const data = makeData('A');
  const { folder, manifest } = make(data);
  assert.deepEqual(manifest.files.map((f) => f.name).sort(), [
    'artifacts.json',
    'chats.json',
    'spaces.json',
    'uploads/7.png',
  ]);
  assert.equal(read(folder, 'chats.json'), 'chats A');
  assert.equal(read(folder, 'uploads/7.png'), 'picture A');
  for (const never of ['extensions.json', KEYS_FILE, 'Preferences', 'Cache']) {
    assert.ok(!exists(folder, never), never);
  }
  assert.equal(manifest.includesKeys, false);
  assert.ok(verifyBackup(folder).ok);
});

test('the keys are only in a backup when asked for', () => {
  const data = makeData('A');
  const { folder, manifest } = make(data, { includeKeys: true });
  assert.ok(manifest.files.some((f) => f.name === KEYS_FILE));
  assert.equal(manifest.includesKeys, true);
  assert.equal(read(folder, KEYS_FILE), 'keys A');
  assert.ok(verifyBackup(folder).ok);
});

test('a second backup with the same name gets its own folder', () => {
  const data = makeData('A');
  const parentDir = temp();
  const first = make(data, { parentDir });
  const second = make(data, { parentDir });
  assert.notEqual(first.folder, second.folder);
  assert.equal(path.basename(second.folder), 'Cleave backup test (2)');
});

test('a damaged, cut-short or odd folder is refused', () => {
  const data = makeData('A');
  const refused = (folder: string, pattern: RegExp) => {
    const result = verifyBackup(folder);
    assert.ok(!result.ok);
    assert.match(result.error, pattern);
  };

  refused(temp(), /no backup\.json/);

  const changed = make(data).folder;
  write(changed, 'chats.json', 'chats B');
  refused(changed, /does not match its checksum/);

  const missing = make(data).folder;
  fs.rmSync(path.join(missing, 'spaces.json'));
  refused(missing, /spaces\.json is missing/);

  const noList = make(data).folder;
  fs.rmSync(path.join(noList, 'backup.json'));
  refused(noList, /no backup\.json/);

  const broken = make(data).folder;
  write(broken, 'backup.json', '{ not json');
  refused(broken, /damaged/);

  // A list that names a file the app does not use is not trusted at all.
  const odd = make(data).folder;
  const list = JSON.parse(read(odd, 'backup.json'));
  list.files.push({ name: 'extensions.json', size: 1, sha256: 'b'.repeat(64) });
  write(odd, 'backup.json', JSON.stringify(list));
  refused(odd, /does not recognise/);
});

test('a restore replaces what is in the backup, removes what is not, and leaves everything else alone', () => {
  const old = makeData('OLD');
  const { folder } = make(old);

  const data = makeData('NEW');
  write(data, 'tools.json', 'tools NEW (not in the backup)');
  write(data, 'uploads/8.png', 'picture only now');

  assert.ok(stageRestore(folder, data).ok);
  assert.ok(exists(data, `${PENDING_RESTORE_DIR}/backup.json`));
  // Staging changes nothing yet.
  assert.equal(read(data, 'chats.json'), 'chats NEW');

  const now = new Date(2026, 10, 20, 17, 0, 0);
  const result = applyPendingRestore(data, now);
  assert.ok(result?.applied);

  assert.equal(read(data, 'chats.json'), 'chats OLD');
  assert.equal(read(data, 'spaces.json'), 'spaces OLD');
  assert.equal(read(data, 'uploads/7.png'), 'picture OLD');
  // In the folder now but not in the backup: gone (and kept in the safety copy).
  assert.ok(!exists(data, 'tools.json'));
  assert.ok(!exists(data, 'uploads/8.png'));
  // Not part of a backup: untouched, keys included (the backup did not hold keys).
  assert.equal(read(data, 'extensions.json'), 'extension list NEW');
  assert.equal(read(data, KEYS_FILE), 'keys NEW');
  assert.equal(read(data, 'Preferences'), 'browser engine file');
  assert.ok(exists(data, 'Cache/data_0'));

  // What was there before is kept, and the staging folder is gone.
  assert.equal(result.safetyFolder, 'before-restore 2026-11-20 17-00-00');
  assert.equal(read(data, `${result.safetyFolder}/chats.json`), 'chats NEW');
  assert.equal(
    read(data, `${result.safetyFolder}/tools.json`),
    'tools NEW (not in the backup)',
  );
  assert.equal(
    read(data, `${result.safetyFolder}/uploads/8.png`),
    'picture only now',
  );
  assert.ok(!exists(data, PENDING_RESTORE_DIR));
  assert.equal(readRestoreResult(data)?.ok, true);
  // Nothing is left to apply on the next start.
  assert.equal(applyPendingRestore(data, now), null);
});

test('a backup with keys restores them; one without leaves the current keys', () => {
  const withKeys = make(makeData('OLD'), { includeKeys: true }).folder;
  const data = makeData('NEW');
  assert.ok(stageRestore(withKeys, data).ok);
  assert.ok(applyPendingRestore(data, new Date())?.applied);
  assert.equal(read(data, KEYS_FILE), 'keys OLD');

  const without = make(makeData('OLD2')).folder;
  assert.ok(stageRestore(without, data).ok);
  assert.ok(applyPendingRestore(data, new Date())?.applied);
  assert.equal(read(data, KEYS_FILE), 'keys OLD');
});

test('a bad backup is refused at staging and changes nothing', () => {
  const data = makeData('NEW');
  const folder = make(makeData('OLD')).folder;
  write(folder, 'chats.json', 'tampered');
  const result = stageRestore(folder, data);
  assert.ok(!result.ok);
  assert.equal(read(data, 'chats.json'), 'chats NEW');
  assert.ok(!exists(data, PENDING_RESTORE_DIR));
});

test('a staged copy that was damaged before the restart is refused, and nothing is changed', () => {
  const data = makeData('NEW');
  assert.ok(stageRestore(make(makeData('OLD')).folder, data).ok);
  write(data, `${PENDING_RESTORE_DIR}/chats.json`, 'tampered');

  const result = applyPendingRestore(data, new Date());
  assert.ok(result && !result.applied);
  assert.equal(read(data, 'chats.json'), 'chats NEW');
  assert.equal(read(data, 'spaces.json'), 'spaces NEW');
  assert.ok(!exists(data, PENDING_RESTORE_DIR));
  const note = readRestoreResult(data);
  assert.ok(note && !note.ok);
});

test('if the swap fails half way, everything is put back', () => {
  // The backup has zoom.json, but here "zoom.json" is a folder, so replacing it must fail,
  // after the files that come before it have already been swapped.
  const source = makeData('OLD');
  write(source, 'zoom.json', 'zoom OLD');
  const { folder } = make(source);

  const data = makeData('NEW');
  fs.mkdirSync(path.join(data, 'zoom.json'));
  assert.ok(stageRestore(folder, data).ok);

  const result = applyPendingRestore(data, new Date(2026, 10, 20, 17, 0, 0));
  assert.ok(result && !result.applied);
  assert.equal(read(data, 'chats.json'), 'chats NEW');
  assert.equal(read(data, 'artifacts.json'), 'artifacts NEW');
  assert.equal(read(data, 'spaces.json'), 'spaces NEW');
  assert.equal(read(data, 'uploads/7.png'), 'picture NEW');
  assert.ok(!exists(data, PENDING_RESTORE_DIR));
  const note = readRestoreResult(data);
  assert.ok(note && !note.ok);
});

test('automatic copies keep only the newest three, and are made without keys', () => {
  const data = makeData('A');
  for (let minute = 0; minute < 5; minute++) {
    autoSnapshot({
      dataDir: data,
      appVersion: '0.1.1',
      now: new Date(2026, 10, 20, 16, minute, 0),
    });
  }
  assert.deepEqual(listAutoSnapshots(data), [
    'auto 2026-11-20 16-04-00',
    'auto 2026-11-20 16-03-00',
    'auto 2026-11-20 16-02-00',
  ]);
  const newest = path.join(data, 'backups', 'auto 2026-11-20 16-04-00');
  assert.ok(verifyBackup(newest).ok);
  assert.ok(!exists(newest, KEYS_FILE));
});

test('an automatic copy that can be restored like any backup', () => {
  const data = makeData('A');
  const folder = autoSnapshot({
    dataDir: data,
    appVersion: '0.1.1',
    now: new Date(2026, 10, 20, 16, 0, 0),
  });
  write(data, 'chats.json', 'chats CHANGED');
  assert.ok(stageRestore(folder, data).ok);
  assert.ok(applyPendingRestore(data, new Date())?.applied);
  assert.equal(read(data, 'chats.json'), 'chats A');
});

test('a new automatic copy is skipped when one was made a moment ago', () => {
  const data = makeData('A');
  const minute = 60_000;
  const first = snapshotIfDue({
    dataDir: data,
    appVersion: '1',
    now: new Date(2026, 10, 20, 16, 0, 0),
    minGapMs: 15 * minute,
  });
  assert.ok(first);
  const soon = snapshotIfDue({
    dataDir: data,
    appVersion: '1',
    now: new Date(2026, 10, 20, 16, 5, 0),
    minGapMs: 15 * minute,
  });
  assert.equal(soon, null);
  const later = snapshotIfDue({
    dataDir: data,
    appVersion: '1',
    now: new Date(2026, 10, 20, 16, 20, 0),
    minGapMs: 15 * minute,
  });
  assert.ok(later);
  assert.equal(listAutoSnapshots(data).length, 2);
});

test('a data folder with nothing in it still backs up and restores', () => {
  const empty = temp();
  const { folder, manifest } = make(empty);
  assert.equal(manifest.files.length, 0);
  assert.ok(verifyBackup(folder).ok);
  const data = makeData('NEW');
  assert.ok(stageRestore(folder, data).ok);
  assert.ok(applyPendingRestore(data, new Date())?.applied);
  // The backup was empty, so a restore empties the data files (kept in the safety copy).
  assert.ok(!exists(data, 'chats.json'));
});
