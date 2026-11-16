import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanFileName, isRiskyFile, uniqueName } from './downloadName.ts';

test('an ordinary file name comes out exactly as it was', () => {
  for (const name of [
    'report.pdf',
    'invoice-march 2026.pdf',
    'archive.tar.gz',
    'Résumé (final).docx',
    'データ.txt',
    'noextension',
  ]) {
    assert.equal(cleanFileName(name), name);
  }
});

test('folders in a name never escape: only the last part is kept', () => {
  assert.equal(cleanFileName('..\\..\\Startup\\update.exe'), 'update.exe');
  assert.equal(cleanFileName('../../etc/passwd'), 'passwd');
  assert.equal(cleanFileName('C:\\Windows\\system32\\evil.dll'), 'evil.dll');
  assert.equal(cleanFileName('a/b/'), 'download');
});

test('characters Windows refuses become underscores', () => {
  assert.equal(cleanFileName('a<b>c:d"e|f?g*h.txt'), 'a_b_c_d_e_f_g_h.txt');
  assert.equal(cleanFileName('line\nbreak\tname.txt'), 'line_break_name.txt');
});

test('reserved Windows names get a prefix, with their type kept', () => {
  assert.equal(cleanFileName('CON.txt'), '_CON.txt');
  assert.equal(cleanFileName('nul'), '_nul');
  assert.equal(cleanFileName('com1.log'), '_com1.log');
  assert.equal(cleanFileName('console.txt'), 'console.txt');
});

test('dots and spaces at the ends are removed, and a leading dot does not hide the file', () => {
  assert.equal(cleanFileName('report.pdf. . '), 'report.pdf');
  assert.equal(cleanFileName('...hidden.txt'), 'hidden.txt');
  assert.equal(cleanFileName('   '), 'download');
  assert.equal(cleanFileName(''), 'download');
  assert.equal(cleanFileName('...'), 'download');
});

test('characters that disguise the real type are removed', () => {
  // "photo", a right-to-left override, then "gpj.exe": it would display as photoexe.jpg
  assert.equal(cleanFileName('photo\u202egpj.exe'), 'photogpj.exe');
  assert.equal(cleanFileName('a\u200bb\u2060c.txt'), 'abc.txt');
});

test('anything that is not text gives the fallback', () => {
  for (const bad of [null, undefined, 5, {}, []]) {
    assert.equal(cleanFileName(bad), 'download');
  }
  assert.equal(cleanFileName(null, 'file'), 'file');
});

test('a very long name is shortened but keeps its type', () => {
  const long = `${'x'.repeat(400)}.pdf`;
  const clean = cleanFileName(long);
  assert.ok(clean.length <= 120);
  assert.ok(clean.endsWith('.pdf'));
});

test('a name that is taken gets a number before its type', () => {
  const taken = new Set(['report.pdf', 'report (1).pdf', 'noext', 'noext (1)']);
  const isTaken = (name: string) => taken.has(name);
  assert.equal(uniqueName('report.pdf', isTaken), 'report (2).pdf');
  assert.equal(uniqueName('new.pdf', isTaken), 'new.pdf');
  assert.equal(uniqueName('noext', isTaken), 'noext (2)');
});

test('programs and scripts are risky to open, judged by every extension', () => {
  for (const name of [
    'setup.exe',
    'run.BAT',
    'x.ps1',
    'invoice.pdf.exe',
    'report.docm',
    'disk.iso',
    'a.js',
  ]) {
    assert.equal(isRiskyFile(name), true, name);
  }
  for (const name of [
    'report.pdf',
    'archive.tar.gz',
    'photo.jpg',
    'exe',
    'notes.txt',
    'data.json',
  ]) {
    assert.equal(isRiskyFile(name), false, name);
  }
});
