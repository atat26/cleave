import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_TEXT_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  planUpload,
} from './uploadRules.ts';

const head = (...values: number[]) =>
  Uint8Array.from([
    ...values,
    ...new Array(Math.max(0, 16 - values.length)).fill(0x41),
  ]);
const ascii = (text: string) =>
  Uint8Array.from(
    text
      .padEnd(16, ' ')
      .split('')
      .map((c) => c.charCodeAt(0)),
  );

test('text, code and web page files become text artifacts of the right kind, named after the file', () => {
  assert.deepEqual(planUpload('notes.md', 100, ascii('# hi')), {
    type: 'text',
    kind: 'markdown',
    title: 'notes.md',
  });
  assert.deepEqual(planUpload('C:\\x\\run.py', 100, ascii('print(1)')), {
    type: 'text',
    kind: 'code',
    title: 'run.py',
  });
  assert.deepEqual(planUpload('/home/a/page.HTML', 100, ascii('<p>')), {
    type: 'text',
    kind: 'html',
    title: 'page.HTML',
  });
  assert.deepEqual(planUpload('a.txt', 5, ascii('hello')), {
    type: 'text',
    kind: 'text',
    title: 'a.txt',
  });
});

test('images and PDFs become viewable files, if they really are what the name says', () => {
  const png = planUpload('cat.PNG', 1000, head(0x89, 0x50, 0x4e, 0x47));
  assert.deepEqual(png, {
    type: 'file',
    mime: 'image/png',
    ext: 'png',
    title: 'cat.PNG',
    label: 'Image',
  });
  assert.equal(planUpload('a.jpeg', 10, head(0xff, 0xd8, 0xff)).type, 'file');
  assert.equal(
    (planUpload('a.jpeg', 10, head(0xff, 0xd8, 0xff)) as { ext: string }).ext,
    'jpg',
  );
  assert.equal(planUpload('a.gif', 10, ascii('GIF89a')).type, 'file');
  assert.equal(
    planUpload('a.webp', 10, ascii('RIFF....WEBPVP8 ')).type,
    'file',
  );
  assert.equal(planUpload('a.bmp', 10, ascii('BM')).type, 'file');
  const pdf = planUpload('paper.pdf', 5000, ascii('%PDF-1.7'));
  assert.deepEqual(pdf, {
    type: 'file',
    mime: 'application/pdf',
    ext: 'pdf',
    title: 'paper.pdf',
    label: 'PDF',
  });
});

test('a file that is not what its name says is refused (a program renamed to .png, a text file named .pdf)', () => {
  assert.equal(
    planUpload('evil.png', 1000, ascii('MZ\u0090 program')).type,
    'refused',
  );
  assert.equal(
    planUpload('fake.pdf', 1000, ascii('just text')).type,
    'refused',
  );
  assert.equal(planUpload('x.gif', 1000, ascii('<html>')).type, 'refused');
  assert.match(
    (planUpload('evil.png', 1000, ascii('MZ')) as { reason: string }).reason,
    /not really an image/,
  );
  assert.match(
    (planUpload('fake.pdf', 1000, ascii('x')) as { reason: string }).reason,
    /not really a PDF/,
  );
});

test('empty, huge, binary and unknown files are refused with a plain reason', () => {
  for (const bad of [
    planUpload('a.png', 0, head(0x89, 0x50, 0x4e, 0x47)),
    planUpload('a.png', MAX_UPLOAD_BYTES + 1, head(0x89, 0x50, 0x4e, 0x47)),
    planUpload('a.txt', MAX_TEXT_UPLOAD_BYTES + 1, ascii('x')),
    planUpload(
      'a.txt',
      10,
      Uint8Array.from([0x68, 0x00, 0x69, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ),
    planUpload('setup.exe', 100, ascii('MZ')),
    planUpload('x.svg', 100, ascii('<svg>')),
    planUpload('noending', 100, ascii('x')),
    planUpload('a.zip', 100, ascii('PK')),
    planUpload('a.png', NaN, head(0x89, 0x50, 0x4e, 0x47)),
  ]) {
    assert.equal(bad.type, 'refused');
    assert.ok((bad as { reason: string }).reason.length > 5);
  }
});
