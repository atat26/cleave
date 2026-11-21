import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BACKUP_FORMAT,
  DATA_FILES,
  KEYS_FILE,
  autoFolderName,
  autoFolderTime,
  autoNamesToDelete,
  backupFolderName,
  beforeRestoreFolderName,
  formatBytes,
  isBackupName,
  isUploadName,
  parseManifest,
  snapshotIsDue,
  sortAutoNames,
  summarizeBackup,
} from './backupFormat.ts';

const HASH = 'a'.repeat(64);
const manifest = (changes: Record<string, unknown> = {}) => ({
  app: 'Cleave',
  format: BACKUP_FORMAT,
  appVersion: '0.1.1',
  createdAt: '2026-11-20T21:30:00.000Z',
  includesKeys: false,
  files: [
    { name: 'chats.json', size: 10, sha256: HASH },
    { name: 'uploads/12.png', size: 5, sha256: HASH },
  ],
  ...changes,
});

test('the data files are settings and content files only, each named once', () => {
  assert.equal(new Set(DATA_FILES).size, DATA_FILES.length);
  for (const name of DATA_FILES) assert.match(name, /^[a-z-]+\.json$/);
  // Extensions are not part of a backup, and the keys are only there when asked for.
  assert.ok(!DATA_FILES.includes('extensions.json'));
  assert.ok(!DATA_FILES.includes(KEYS_FILE));
  for (const must of [
    'spaces.json',
    'chats.json',
    'artifacts.json',
    'history.json',
    'bookmarks.json',
  ]) {
    assert.ok(DATA_FILES.includes(must), must);
  }
});

test('uploads are "<number>.<extension>" and nothing else', () => {
  assert.ok(isUploadName('12.png'));
  assert.ok(isUploadName('4096.pdf'));
  for (const bad of [
    'png',
    '12',
    '12.',
    'a.png',
    '12.p/g',
    '../12.png',
    '12.png/x',
    '12.png ',
    '',
  ]) {
    assert.ok(!isUploadName(bad), JSON.stringify(bad));
  }
});

test('only known names may be in a backup, and never a path out of it', () => {
  assert.ok(isBackupName('chats.json', false));
  assert.ok(isBackupName('uploads/12.png', false));
  assert.ok(!isBackupName(KEYS_FILE, false));
  assert.ok(isBackupName(KEYS_FILE, true));
  for (const bad of [
    'extensions.json',
    'Preferences',
    '../chats.json',
    '..\\chats.json',
    'uploads/../chats.json',
    'uploads/a/b.png',
    'uploads/12.png/..',
    'C:/Windows/win.ini',
    '/etc/passwd',
    'chats.json.bak',
    '',
  ]) {
    assert.ok(!isBackupName(bad, true), JSON.stringify(bad));
  }
});

test('a good backup.json is read', () => {
  const result = parseManifest(manifest());
  assert.ok(result.ok);
  assert.equal(result.manifest.files.length, 2);
  assert.equal(result.manifest.includesKeys, false);
  assert.equal(result.manifest.createdAt, '2026-11-20T21:30:00.000Z');
});

test('anything that is not exactly what Cleave writes is refused', () => {
  const refused = (value: unknown, pattern: RegExp) => {
    const result = parseManifest(value);
    assert.ok(!result.ok);
    assert.match(result.error, pattern);
  };
  refused(null, /not a Cleave backup/);
  refused([], /not a Cleave backup/);
  refused(manifest({ app: 'Other' }), /not a Cleave backup/);
  refused(manifest({ format: BACKUP_FORMAT + 1 }), /newer version/);
  refused(manifest({ format: 0 }), /damaged/);
  refused(manifest({ format: 'x' }), /damaged/);
  refused(manifest({ createdAt: 'yesterday' }), /damaged/);
  refused(manifest({ includesKeys: 'no' }), /damaged/);
  refused(manifest({ files: 'chats.json' }), /damaged/);
  refused(
    manifest({ files: [{ name: 'chats.json', size: -1, sha256: HASH }] }),
    /damaged/,
  );
  refused(
    manifest({ files: [{ name: 'chats.json', size: 1.5, sha256: HASH }] }),
    /damaged/,
  );
  refused(
    manifest({ files: [{ name: 'chats.json', size: 1, sha256: 'xyz' }] }),
    /damaged/,
  );
  refused(
    manifest({
      files: [
        { name: 'chats.json', size: 1, sha256: HASH },
        { name: 'chats.json', size: 1, sha256: HASH },
      ],
    }),
    /damaged/,
  );
});

test('a file Cleave does not recognise, or a path out of the backup, refuses the whole backup', () => {
  for (const name of [
    'extensions.json',
    '../chats.json',
    'uploads/../x.json',
    KEYS_FILE,
  ]) {
    const result = parseManifest(
      manifest({ files: [{ name, size: 1, sha256: HASH }] }),
    );
    assert.ok(!result.ok, name);
    assert.match(result.error, /does not recognise/);
  }
  // The keys file is fine once the backup says it holds keys.
  assert.ok(
    parseManifest(
      manifest({
        includesKeys: true,
        files: [{ name: KEYS_FILE, size: 1, sha256: HASH }],
      }),
    ).ok,
  );
});

test('a summary counts data files and uploads apart', () => {
  const parsed = parseManifest(manifest());
  assert.ok(parsed.ok);
  assert.deepEqual(summarizeBackup(parsed.manifest), {
    createdAt: '2026-11-20T21:30:00.000Z',
    appVersion: '0.1.1',
    files: 1,
    uploads: 1,
    bytes: 15,
    includesKeys: false,
  });
});

test('sizes read plainly', () => {
  assert.equal(formatBytes(12), '12 bytes');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3.5 * 1024 * 1024), '3.5 MB');
  assert.equal(formatBytes(2.25 * 1024 * 1024 * 1024), '2.3 GB');
});

test('folder names are sortable, and use nothing Windows refuses in a name', () => {
  const at = new Date(2026, 10, 20, 16, 5, 9);
  assert.equal(backupFolderName(at), 'Cleave backup 2026-11-20 16-05');
  assert.equal(autoFolderName(at), 'auto 2026-11-20 16-05-09');
  assert.equal(
    beforeRestoreFolderName(at),
    'before-restore 2026-11-20 16-05-09',
  );
  for (const name of [
    backupFolderName(at),
    autoFolderName(at),
    beforeRestoreFolderName(at),
  ]) {
    assert.doesNotMatch(name, /[<>:"/\\|?*]/);
  }
});

test('automatic copies: read the time back, newest first, keep only the newest few', () => {
  const at = new Date(2026, 10, 20, 16, 5, 9);
  assert.equal(autoFolderTime(autoFolderName(at))?.getTime(), at.getTime());
  assert.equal(autoFolderTime('Cleave backup 2026-11-20 16-05'), null);
  assert.equal(autoFolderTime('auto 2026-13-20 16-05-09x'), null);

  const names = [
    'auto 2026-11-18 09-00-00',
    'auto 2026-11-20 16-05-09',
    'notes',
    'auto 2026-11-19 12-00-00',
    'auto 2026-11-17 08-00-00',
  ];
  assert.deepEqual(sortAutoNames(names), [
    'auto 2026-11-20 16-05-09',
    'auto 2026-11-19 12-00-00',
    'auto 2026-11-18 09-00-00',
    'auto 2026-11-17 08-00-00',
  ]);
  assert.deepEqual(autoNamesToDelete(names, 3), ['auto 2026-11-17 08-00-00']);
  assert.deepEqual(autoNamesToDelete(names, 10), []);
  // Folders that are not ours are never in the list to delete.
  assert.ok(!autoNamesToDelete(['notes', 'x'], 0).includes('notes'));
});

test('a new automatic copy is due unless one is very recent', () => {
  const now = new Date(2026, 10, 20, 16, 30, 0);
  const minute = 60_000;
  assert.equal(snapshotIsDue([], now, 15 * minute), true);
  assert.equal(
    snapshotIsDue(['auto 2026-11-20 16-20-00'], now, 15 * minute),
    false,
  );
  assert.equal(
    snapshotIsDue(['auto 2026-11-20 16-10-00'], now, 15 * minute),
    true,
  );
  assert.equal(snapshotIsDue(['junk'], now, 15 * minute), true);
});
