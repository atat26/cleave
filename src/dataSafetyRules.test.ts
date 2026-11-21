import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanStoredFile } from './artifacts.ts';
import {
  MAX_BACKUP_FILE_BYTES,
  MAX_BACKUP_TOTAL_BYTES,
  isBackupName,
  isUploadName,
  parseManifest,
} from './backupFormat.ts';
import { parseDownloads } from './downloadList.ts';
import {
  defaultDownloadSettings,
  folderProblem,
  isLocalFilePath,
  parseDownloadSettings,
  withDownloadSettings,
} from './downloadSettings.ts';
import { VIEWABLE_EXTENSIONS, isViewableExtension } from './uploadTypes.ts';

const HASH = 'a'.repeat(64);

test('only an image or a PDF can be an upload', () => {
  assert.deepEqual([...VIEWABLE_EXTENSIONS].sort(), [
    'gif',
    'jpeg',
    'jpg',
    'pdf',
    'png',
    'webp',
  ]);
  for (const ok of ['png', 'jpg', 'pdf', 'gif', 'webp'])
    assert.ok(isViewableExtension(ok), ok);
  for (const bad of [
    'exe',
    'bat',
    'lnk',
    'ps1',
    'hta',
    'html',
    'svg',
    'PNG',
    '',
    'png ',
    5,
    null,
  ]) {
    assert.ok(!isViewableExtension(bad), String(bad));
  }
});

test('an upload name in a backup is a number and a viewable extension, nothing else', () => {
  for (const ok of ['5.png', '12.pdf', '3.jpg', '99.gif', '7.webp']) {
    assert.ok(isUploadName(ok), ok);
    assert.ok(isBackupName(`uploads/${ok}`, false), ok);
  }
  for (const bad of [
    '5.exe',
    '5.bat',
    '5.lnk',
    '5.ps1',
    '5.hta',
    '5.PNG',
    '5',
    'a.png',
    '5.png.exe',
    '../5.png',
  ]) {
    assert.ok(!isUploadName(bad), bad);
    assert.ok(!isBackupName(`uploads/${bad}`, true), bad);
  }
});

test('a backup that holds a program among its uploads is refused whole', () => {
  for (const name of ['uploads/5.exe', 'uploads/5.bat', 'uploads/5.lnk']) {
    const result = parseManifest({
      app: 'Cleave',
      format: 1,
      appVersion: '0.1.1',
      createdAt: '2026-11-21T00:00:00.000Z',
      includesKeys: false,
      files: [
        { name: 'chats.json', size: 5, sha256: HASH },
        { name, size: 5, sha256: HASH },
      ],
    });
    assert.ok(!result.ok, name);
    assert.match(result.error, /does not recognise/);
  }
});

test('a saved artifact cannot claim a file that is not an image or a PDF', () => {
  const file = (ext: string) => ({
    name: 'x',
    mime: 'image/png',
    ext,
    bytes: 5,
  });
  assert.equal(cleanStoredFile(file('png'))?.ext, 'png');
  assert.equal(cleanStoredFile(file('pdf'))?.ext, 'pdf');
  for (const ext of ['exe', 'bat', 'lnk', 'ps1', 'js']) {
    assert.equal(cleanStoredFile(file(ext)), null, ext);
  }
});

test('a backup that says it holds an enormous file is refused before anything is read', () => {
  const manifest = (size: number, more: unknown[] = []) => ({
    app: 'Cleave',
    format: 1,
    appVersion: '0.1.1',
    createdAt: '2026-11-21T00:00:00.000Z',
    includesKeys: false,
    files: [{ name: 'chats.json', size, sha256: HASH }, ...more],
  });
  assert.ok(parseManifest(manifest(1000)).ok);
  assert.ok(parseManifest(manifest(MAX_BACKUP_FILE_BYTES)).ok);
  const tooBig = parseManifest(manifest(MAX_BACKUP_FILE_BYTES + 1));
  assert.ok(!tooBig.ok);
  assert.match(tooBig.error, /much bigger/);
  // Many files that together are over the total.
  const many = Array.from({ length: 30 }, (_, i) => ({
    name: `uploads/${i + 1}.png`,
    size: MAX_BACKUP_FILE_BYTES,
    sha256: HASH,
  }));
  assert.ok(MAX_BACKUP_FILE_BYTES * 31 > MAX_BACKUP_TOTAL_BYTES);
  assert.ok(!parseManifest(manifest(MAX_BACKUP_FILE_BYTES, many)).ok);
});

test('a download folder: a plain folder on this computer, not a system or Startup folder', () => {
  for (const ok of [
    'C:\\Users\\me\\Downloads',
    'D:\\Files',
    'C:\\Users\\me\\My Stuff\\x',
  ]) {
    assert.equal(folderProblem(ok, false), null, ok);
  }
  for (const bad of [
    'C:\\Windows\\System32',
    'c:\\windows',
    'C:\\Program Files\\App',
    'C:\\Program Files (x86)\\App',
    'C:\\ProgramData\\x',
    'C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup',
    'C:/Users/me/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/StartUp/',
    'C:\\Users\\me\\..\\..\\Windows',
    'relative\\path',
    '',
    'C:\\x\u0000y',
    'x'.repeat(1000),
    5,
    null,
  ]) {
    assert.notEqual(folderProblem(bad, true), null, String(bad));
  }
});

test('a network or device folder is only taken when you chose it yourself', () => {
  const share = '\\\\server\\share\\files';
  assert.equal(folderProblem(share, false), 'a network folder');
  assert.equal(folderProblem('//server/share', false), 'a network folder');
  assert.equal(folderProblem(share, true), null);
  for (const device of ['\\\\?\\C:\\x', '\\\\.\\pipe\\x', '//?/C:/x']) {
    assert.equal(folderProblem(device, false), 'a device path', device);
    assert.equal(folderProblem(device, true), 'a device path', device);
  }
  // Even one you chose cannot be a system or Startup folder.
  assert.notEqual(folderProblem('\\\\server\\share', true), 'a network folder');
});

test('settings read back from disk, or from a backup, never take a network or system folder', () => {
  for (const folder of [
    '\\\\server\\share',
    'C:\\Windows',
    'C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup',
  ]) {
    assert.equal(
      parseDownloadSettings({ folder, askWhere: true }).folder,
      null,
      folder,
    );
  }
  assert.equal(
    parseDownloadSettings({ folder: 'D:\\Files' }).folder,
    'D:\\Files',
  );
  assert.equal(
    parseDownloadSettings({ folder: 'D:\\Files', askWhere: true }).askWhere,
    true,
  );
});

test('a folder chosen in the folder window may be on the network, but not a system folder', () => {
  const base = defaultDownloadSettings();
  assert.equal(
    withDownloadSettings(base, { folder: '\\\\server\\share\\files' }).folder,
    '\\\\server\\share\\files',
  );
  assert.equal(
    withDownloadSettings(base, { folder: 'C:\\Windows' }).folder,
    null,
  );
  assert.equal(
    withDownloadSettings(base, { folder: '\\\\?\\C:\\x' }).folder,
    null,
  );
  const set = withDownloadSettings(base, { folder: 'D:\\Files' });
  assert.equal(set.folder, 'D:\\Files');
  assert.equal(withDownloadSettings(set, { folder: null }).folder, null);
  // Nothing else changes it.
  assert.equal(
    withDownloadSettings(set, { askWhere: true }).folder,
    'D:\\Files',
  );
  assert.equal(withDownloadSettings(set, 'x').folder, 'D:\\Files');
});

test('a path on this computer, and nothing that reaches another one', () => {
  for (const ok of ['C:\\Users\\me\\Downloads\\photo.jpg', 'D:\\a.txt'])
    assert.ok(isLocalFilePath(ok), ok);
  for (const bad of [
    '\\\\server\\share\\x.exe',
    '//server/share/x',
    '\\\\?\\C:\\x',
    'relative.txt',
    '',
    'C:\\a\u0000b',
    5,
    null,
  ]) {
    assert.ok(!isLocalFilePath(bad), String(bad));
  }
});

test('a saved list of downloads cannot point a harmless-looking name at a program or a share', () => {
  const item = (id: number, name: string, p: string) => ({
    id,
    url: 'https://a.example/',
    name,
    path: p,
    totalBytes: 1,
    receivedBytes: 1,
    state: 'done',
    startedAt: 1,
    endedAt: 2,
  });
  const parsed = parseDownloads(
    {
      nextId: 10,
      items: [
        item(1, 'photo.jpg', 'C:\\Users\\me\\Downloads\\photo.jpg'),
        item(2, 'photo.jpg', 'C:\\Users\\me\\Downloads\\evil.exe'),
        item(3, 'photo.jpg', '\\\\server\\share\\photo.jpg'),
        item(4, 'report.pdf', 'relative\\report.pdf'),
      ],
    },
    5,
  );
  assert.deepEqual(
    parsed.items.map((i) => [i.id, i.path]),
    [
      [1, 'C:\\Users\\me\\Downloads\\photo.jpg'],
      // The others stay in the list, but have no path, so they cannot be opened.
      [2, ''],
      [3, ''],
      [4, ''],
    ],
  );
});
