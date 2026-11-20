import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import {
  DEV_DATA_FOLDER,
  INSTALLED_DATA_FOLDER,
  dataFolderName,
  dataFolderPath,
} from './dataFolder.ts';

test('the installed app and a development copy never share a data folder', () => {
  assert.notEqual(dataFolderName(true), dataFolderName(false));
  assert.equal(dataFolderName(true), INSTALLED_DATA_FOLDER);
  assert.equal(dataFolderName(false), DEV_DATA_FOLDER);
});

test('the installed app is called Cleave; the development copy keeps the folder the test copy always used', () => {
  assert.equal(INSTALLED_DATA_FOLDER, 'Cleave');
  assert.equal(DEV_DATA_FOLDER, 'ai-browser');
});

test('the folder is made inside the given app-data folder', () => {
  assert.equal(
    dataFolderPath('C:\\Users\\me\\AppData\\Roaming', true),
    path.join('C:\\Users\\me\\AppData\\Roaming', 'Cleave'),
  );
  assert.equal(
    dataFolderPath('C:\\Users\\me\\AppData\\Roaming', false),
    path.join('C:\\Users\\me\\AppData\\Roaming', 'ai-browser'),
  );
});
