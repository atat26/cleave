import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultDownloadSettings,
  parseDownloadSettings,
  withDownloadSettings,
} from './downloadSettings.ts';

test('downloads go to the Downloads folder without asking, by default', () => {
  assert.deepEqual(defaultDownloadSettings(), {
    version: 1,
    folder: null,
    askWhere: false,
  });
});

test('a saved absolute folder and the ask switch are kept; anything else is not', () => {
  const parsed = parseDownloadSettings({
    folder: 'C:\\Users\\me\\Stuff',
    askWhere: true,
  });
  assert.equal(parsed.askWhere, true);
  assert.equal(parsed.folder, 'C:\\Users\\me\\Stuff');
  for (const bad of ['relative\\path', '', 5, null, 'C:\\a\u0000b']) {
    assert.equal(parseDownloadSettings({ folder: bad }).folder, null);
  }
  for (const junk of [null, 5, 'x', [], {}]) {
    assert.deepEqual(parseDownloadSettings(junk), defaultDownloadSettings());
  }
});

test('changes apply one at a time; null goes back to the default folder', () => {
  let settings = withDownloadSettings(defaultDownloadSettings(), {
    folder: 'C:\\Data',
  });
  assert.equal(settings.folder, 'C:\\Data');
  settings = withDownloadSettings(settings, { askWhere: true });
  assert.equal(settings.folder, 'C:\\Data');
  assert.equal(settings.askWhere, true);
  assert.equal(
    withDownloadSettings(settings, { folder: 'not\\absolute' }).folder,
    'C:\\Data',
  );
  assert.equal(withDownloadSettings(settings, { folder: null }).folder, null);
  assert.deepEqual(withDownloadSettings(settings, 5), settings);
});
