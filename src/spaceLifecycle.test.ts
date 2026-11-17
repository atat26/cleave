import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_TRASHED_SPACES,
  defaultSpaceTrash,
  emptySpaceTrash,
  parseSpaceTrash,
  purgeOldTrashedSpaces,
  purgeTrashedSpace,
  takeTrashedSpace,
  trashSpace,
} from './spaceTrash.ts';
import { exportFileName, spaceMarkdown } from './spaceExport.ts';

const space = (name = 'Trip') => ({
  name,
  color: 'blue',
  emoji: '✈️' as string | null,
  about: 'Rome in May',
  pages: [
    { title: 'Flights', url: 'https://a.example/f' },
    { title: 'Bad', url: 'javascript:alert(1)' },
  ],
  artifactIds: [3, 4],
});

test('a deleted Space is kept with its pages (web ones only) and can be taken back out', () => {
  const day = 86_400_000;
  const trash = trashSpace(defaultSpaceTrash(), space(), 1000);
  assert.equal(trash.items.length, 1);
  assert.equal(trash.items[0].id, 1);
  assert.deepEqual(trash.items[0].pages, [
    { title: 'Flights', url: 'https://a.example/f' },
  ]);
  assert.deepEqual(trash.items[0].artifactIds, [3, 4]);
  const second = trashSpace(trash, space('Work'), 2000);
  assert.equal(second.items[1].id, 2);
  const taken = takeTrashedSpace(second, 1)!;
  assert.equal(taken.item.name, 'Trip');
  assert.deepEqual(
    taken.trash.items.map((i) => i.id),
    [2],
  );
  assert.equal(takeTrashedSpace(second, 99), null);
  // Removing for good, emptying, and the age limit.
  assert.deepEqual(
    purgeTrashedSpace(second, 1).items.map((i) => i.id),
    [2],
  );
  assert.equal(purgeTrashedSpace(second, 99), second);
  assert.equal(emptySpaceTrash(second).items.length, 0);
  const aged = purgeOldTrashedSpaces(second, 1000 + 30 * day + 500, 30);
  assert.deepEqual(
    aged.items.map((i) => i.id),
    [2],
  );
  assert.equal(purgeOldTrashedSpaces(second, 2500, 30), second);
});

test('the trash is capped, ids are never reused, and disk data is repaired', () => {
  let trash = defaultSpaceTrash();
  for (let i = 0; i < MAX_TRASHED_SPACES + 5; i++)
    trash = trashSpace(trash, space(`S${i}`), i);
  assert.equal(trash.items.length, MAX_TRASHED_SPACES);
  assert.equal(trash.items[0].name, 'S5');
  const back = parseSpaceTrash(JSON.parse(JSON.stringify(trash)));
  assert.equal(back.items.length, MAX_TRASHED_SPACES);
  assert.equal(back.nextId, trash.nextId);
  const bad = parseSpaceTrash({
    nextId: 1,
    items: [
      {
        id: 7,
        name: '  ',
        pages: [{ title: 5, url: 'https://ok.example' }, { url: 'file:///x' }],
        artifactIds: [1, 'x', -2, 3.5],
      },
      { id: 7, name: 'dup' },
      { id: 0, name: 'zero' },
      5,
      null,
    ],
  });
  assert.equal(bad.items.length, 1);
  assert.equal(bad.items[0].name, 'Space');
  assert.deepEqual(bad.items[0].pages, [
    { title: '', url: 'https://ok.example' },
  ]);
  assert.deepEqual(bad.items[0].artifactIds, [1]);
  assert.equal(bad.nextId, 8);
  for (const junk of [null, 5, 'x', [], {}, { items: 3 }]) {
    assert.deepEqual(parseSpaceTrash(junk), defaultSpaceTrash());
  }
});

test('a Space exports as a Markdown file with its note, pages and artifacts', () => {
  const md = spaceMarkdown({
    name: 'GPU [hunt]',
    about: 'Budget $600.\nPrefer 16 GB.',
    pages: [
      {
        title: 'Tesla *K80*',
        url: 'https://user:secret@www.ebay.com/itm/1?x=(1)',
        closed: false,
      },
      { title: 'Old thread', url: 'https://forum.example/t/9', closed: true },
      { title: 'Local', url: 'file:///C:/x', closed: false },
    ],
    artifacts: [{ title: 'Notes', kind: 'markdown' }],
  });
  assert.equal(
    md,
    [
      '# GPU \\[hunt\\]',
      '',
      '> Budget $600.',
      '> Prefer 16 GB.',
      '',
      '## Pages',
      '',
      '- [Tesla \\*K80\\*](https://www.ebay.com/itm/1?x=%281%29)',
      '',
      '## Closed pages',
      '',
      '- [Old thread](https://forum.example/t/9)',
      '',
      '## Artifacts',
      '',
      '- Notes (markdown)',
      '',
    ].join('\n'),
  );
  assert.ok(!md.includes('secret'));
  assert.ok(!md.includes('file:'));
  assert.equal(
    spaceMarkdown({ name: '', about: '', pages: [], artifacts: [] }),
    '# Space\n\n_This Space is empty._\n',
  );
});

test('the file name is a plain name, never a path', () => {
  assert.equal(exportFileName('GPU hunt'), 'GPU hunt.md');
  assert.equal(exportFileName('a/b\\c:d*?"<>|e'), 'a b c d e.md');
  assert.equal(exportFileName('..\\..\\evil'), 'evil.md');
  assert.equal(exportFileName('   '), 'Space.md');
  assert.equal(exportFileName('x'.repeat(200)).length, 83);
});
