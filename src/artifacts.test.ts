import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  artifactsIn,
  createArtifact,
  defaultArtifacts,
  deleteArtifact,
  hasInternet,
  setArtifactInternet,
  kindFromName,
  MAX_ARTIFACT_CHARS,
  MAX_ARTIFACTS,
  parseArtifacts,
  releaseMissingSpaces,
  releaseSpace,
  updateArtifact,
} from './artifacts.ts';
import type { Artifact, ArtifactsState } from './artifacts.ts';

const make = (
  state: ArtifactsState,
  input: Parameters<typeof createArtifact>[1],
  now = 1,
) => {
  const result = createArtifact(state, input, now);
  assert.ok(result.ok);
  return result;
};

test('creating gives each artifact its own number and a clean title', () => {
  const a = make(defaultArtifacts(), {
    kind: 'markdown',
    title: '  My\n  notes ',
  });
  const b = make(a.state, { kind: 'text' });
  assert.equal(a.artifact.id, 1);
  assert.equal(a.artifact.title, 'My notes');
  assert.equal(b.artifact.id, 2);
  assert.equal(b.artifact.title, 'Untitled');
  assert.equal(b.artifact.spaceId, null);
  assert.equal(b.state.artifacts.length, 2);
});

test('unknown kinds, oversized content and too many artifacts are refused', () => {
  const s = defaultArtifacts();
  assert.deepEqual(createArtifact(s, { kind: 'pdf' }, 1), {
    ok: false,
    reason: 'bad-kind',
  });
  assert.deepEqual(
    createArtifact(
      s,
      { kind: 'text', content: 'x'.repeat(MAX_ARTIFACT_CHARS + 1) },
      1,
    ),
    { ok: false, reason: 'too-long' },
  );
  const full: ArtifactsState = {
    ...s,
    artifacts: Array.from({ length: MAX_ARTIFACTS }, (_, i) => ({
      id: i + 1,
      title: 't',
      kind: 'text',
      content: '',
      spaceId: null,
      createdAt: 0,
      updatedAt: 0,
    })) as Artifact[],
  };
  assert.deepEqual(createArtifact(full, { kind: 'text' }, 1), {
    ok: false,
    reason: 'too-many',
  });
});

test('file names decide the kind; things with no editor get no kind', () => {
  assert.equal(kindFromName('notes.MD'), 'markdown');
  assert.equal(kindFromName('page.html'), 'html');
  assert.equal(kindFromName('app.tsx'), 'code');
  assert.equal(kindFromName('readme.txt'), 'text');
  for (const name of [
    'report.pdf',
    'photo.png',
    'movie.mp4',
    'archive.zip',
    'noextension',
    'x.',
  ]) {
    assert.equal(kindFromName(name), null, name);
  }
});

test('updating changes only what is given and stamps the time', () => {
  const a = make(
    defaultArtifacts(),
    { kind: 'text', title: 'A', content: 'one' },
    5,
  );
  const r = updateArtifact(a.state, 1, { content: 'two' }, 9);
  assert.ok(r.ok);
  assert.equal(r.artifact.content, 'two');
  assert.equal(r.artifact.title, 'A');
  assert.equal(r.artifact.createdAt, 5);
  assert.equal(r.artifact.updatedAt, 9);
  const moved = updateArtifact(r.state, 1, { spaceId: 3 }, 10);
  assert.ok(moved.ok);
  assert.equal(moved.artifact.spaceId, 3);
  const out = updateArtifact(moved.state, 1, { spaceId: null }, 11);
  assert.ok(out.ok);
  assert.equal(out.artifact.spaceId, null);
  assert.deepEqual(updateArtifact(a.state, 99, {}, 1), {
    ok: false,
    reason: 'not-found',
  });
  assert.deepEqual(
    updateArtifact(
      a.state,
      1,
      { content: 'x'.repeat(MAX_ARTIFACT_CHARS + 1) },
      1,
    ),
    { ok: false, reason: 'too-long' },
  );
});

test('deleting removes one artifact; numbers are never reused', () => {
  const a = make(defaultArtifacts(), { kind: 'text' });
  const b = make(a.state, { kind: 'text' });
  const left = deleteArtifact(b.state, 1);
  assert.deepEqual(
    left.artifacts.map((x) => x.id),
    [2],
  );
  assert.equal(make(left, { kind: 'text' }).artifact.id, 3);
  assert.equal(deleteArtifact(left, 99), left);
});

test('deleting a Space keeps its artifacts but takes them out of it', () => {
  let s = make(defaultArtifacts(), { kind: 'text', spaceId: 2 }).state;
  s = make(s, { kind: 'text', spaceId: 3 }).state;
  const after = releaseSpace(s, 2);
  assert.deepEqual(
    after.artifacts.map((a) => a.spaceId),
    [null, 3],
  );
  assert.equal(releaseSpace(after, 2), after);
});

test('listing by Space puts the newest edit first', () => {
  let s = make(defaultArtifacts(), { kind: 'text', spaceId: 1 }, 1).state;
  s = make(s, { kind: 'text', spaceId: 1 }, 2).state;
  s = make(s, { kind: 'text' }, 3).state;
  const edited = updateArtifact(s, 1, { content: 'new' }, 10);
  assert.ok(edited.ok);
  assert.deepEqual(
    artifactsIn(edited.state, 1).map((a) => a.id),
    [1, 2],
  );
  assert.deepEqual(
    artifactsIn(edited.state, null).map((a) => a.id),
    [3],
  );
});

test('whatever is on disk is repaired, never trusted', () => {
  assert.deepEqual(parseArtifacts(null), defaultArtifacts());
  assert.deepEqual(parseArtifacts({ artifacts: 'no' }), defaultArtifacts());
  const parsed = parseArtifacts({
    nextId: 1,
    artifacts: [
      { id: 4, title: 5, kind: 'text', content: 'ok', spaceId: -2 },
      { id: 4, title: 'dup', kind: 'text', content: 'dup' },
      { id: 5, kind: 'pdf', content: 'x' },
      { id: 6, kind: 'text', content: 7 },
      'junk',
      {
        id: 7,
        title: 'Big',
        kind: 'html',
        content: 'y'.repeat(MAX_ARTIFACT_CHARS + 5),
        spaceId: 2,
      },
    ],
  });
  assert.deepEqual(
    parsed.artifacts.map((a) => a.id),
    [4, 7],
  );
  assert.equal(parsed.artifacts[0].title, 'Untitled');
  assert.equal(parsed.artifacts[0].spaceId, null);
  assert.equal(parsed.artifacts[1].content.length, MAX_ARTIFACT_CHARS);
  assert.equal(parsed.nextId, 8);
});

test('the revision goes up only when the text changes, so a stale save can be told apart', () => {
  const a = make(
    defaultArtifacts(),
    { kind: 'text', title: 'A', content: 'one' },
    1,
  );
  assert.equal(a.artifact.revision, 0);
  const edited = updateArtifact(a.state, 1, { content: 'two' }, 2);
  assert.ok(edited.ok);
  assert.equal(edited.artifact.revision, 1);
  // The same text, a rename and a move are not new versions of the text.
  const same = updateArtifact(edited.state, 1, { content: 'two' }, 3);
  const renamed = updateArtifact(edited.state, 1, { title: 'B' }, 3);
  const moved = updateArtifact(edited.state, 1, { spaceId: 4 }, 3);
  assert.ok(same.ok && renamed.ok && moved.ok);
  assert.equal(same.artifact.revision, 1);
  assert.equal(renamed.artifact.revision, 1);
  assert.equal(moved.artifact.revision, 1);
  // It is saved and loaded; an old file without one starts at 0.
  assert.equal(
    parseArtifacts(JSON.parse(JSON.stringify(edited.state))).artifacts[0]
      .revision,
    1,
  );
  assert.equal(
    parseArtifacts({ artifacts: [{ id: 1, kind: 'text', content: '' }] })
      .artifacts[0].revision,
    0,
  );
});

test('the internet in a preview is allowed for one exact text, and lapses when anything else changes it', () => {
  const made = make(defaultArtifacts(), {
    kind: 'html',
    title: 'Page',
    content: '<p>a</p>',
  });
  const id = made.artifact.id;
  // Off to begin with.
  assert.equal(hasInternet(made.artifact), false);
  assert.equal(made.artifact.internetFor, null);
  // Allowed for the text as it is now.
  const on = setArtifactInternet(made.state, id, true);
  assert.ok(on.ok);
  assert.equal(hasInternet(on.artifact), true);
  // A rename, a move or a new emoji do not change the text: still allowed.
  const renamed = updateArtifact(
    on.state,
    id,
    { title: 'New', spaceId: 3, emoji: '🧮' },
    5,
  );
  assert.ok(renamed.ok);
  assert.equal(hasInternet(renamed.artifact), true);
  // The assistant edits the text (no keepInternet): the permission is gone.
  const edited = updateArtifact(on.state, id, { content: '<p>b</p>' }, 6);
  assert.ok(edited.ok);
  assert.equal(edited.artifact.revision, made.artifact.revision + 1);
  assert.equal(hasInternet(edited.artifact), false);
  // And it does not come back by itself later, whatever happens after.
  const later = updateArtifact(edited.state, id, { title: 'Again' }, 7);
  assert.ok(later.ok);
  assert.equal(hasInternet(later.artifact), false);
  // Your own typing keeps it, for the text you typed.
  const typed = updateArtifact(
    on.state,
    id,
    { content: '<p>c</p>', keepInternet: true },
    8,
  );
  assert.ok(typed.ok);
  assert.equal(hasInternet(typed.artifact), true);
  assert.equal(typed.artifact.internetFor, typed.artifact.revision);
  // keepInternet cannot grant it where it was not allowed before.
  const none = updateArtifact(
    made.state,
    id,
    { content: '<p>d</p>', keepInternet: true },
    9,
  );
  assert.ok(none.ok);
  assert.equal(hasInternet(none.artifact), false);
  // Switching it off.
  const off = setArtifactInternet(typed.state, id, false);
  assert.ok(off.ok);
  assert.equal(hasInternet(off.artifact), false);
  assert.equal(setArtifactInternet(typed.state, 999, true).ok, false);
});

test('the permission survives a restart, and a tampered file cannot invent one', () => {
  const made = make(defaultArtifacts(), {
    kind: 'html',
    title: 'P',
    content: 'x',
  });
  const on = setArtifactInternet(made.state, made.artifact.id, true);
  assert.ok(on.ok);
  const back = parseArtifacts(JSON.parse(JSON.stringify(on.state)));
  assert.equal(hasInternet(back.artifacts[0]), true);
  const tampered = parseArtifacts({
    artifacts: [
      { id: 1, kind: 'html', content: 'x', revision: 4, internetFor: 'yes' },
      { id: 2, kind: 'html', content: 'x', revision: 4, internetFor: 3 },
      { id: 3, kind: 'html', content: 'x', revision: 4 },
    ],
  });
  assert.deepEqual(
    tampered.artifacts.map((a) => hasInternet(a)),
    [false, false, false],
  );
});

test('an uploaded image or PDF is a "file" artifact: it needs its details, has no text, and cannot be edited', () => {
  const file = { name: 'cat.png', mime: 'image/png', ext: 'png', bytes: 1234 };
  const made = createArtifact(
    defaultArtifacts(),
    { kind: 'file', title: 'cat.png', file },
    5,
  );
  assert.ok(made.ok);
  assert.equal(made.artifact.content, '');
  assert.deepEqual(made.artifact.file, file);
  // A file artifact needs its details; a text one must not have any.
  assert.equal(
    createArtifact(defaultArtifacts(), { kind: 'file', title: 'x' }, 5).ok,
    false,
  );
  assert.equal(
    createArtifact(
      defaultArtifacts(),
      { kind: 'file', title: 'x', file: { ...file, ext: '../x' } },
      5,
    ).ok,
    false,
  );
  assert.equal(
    createArtifact(
      defaultArtifacts(),
      { kind: 'file', title: 'x', file: { ...file, mime: 'nope' } },
      5,
    ).ok,
    false,
  );
  const text = createArtifact(
    defaultArtifacts(),
    { kind: 'text', title: 'x', file },
    5,
  );
  assert.ok(text.ok);
  assert.equal(text.artifact.file, null);
  // Its text cannot be changed (the revision stays), but it can be renamed and moved.
  const tried = updateArtifact(
    made.state,
    made.artifact.id,
    { content: 'hacked', title: 'Cat', spaceId: 3 },
    6,
  );
  assert.ok(tried.ok);
  assert.equal(tried.artifact.content, '');
  assert.equal(tried.artifact.revision, 0);
  assert.equal(tried.artifact.title, 'Cat');
  assert.equal(tried.artifact.spaceId, 3);
  // Saved and read back; a file artifact without details, or text with details, is dropped.
  const back = parseArtifacts(JSON.parse(JSON.stringify(made.state)));
  assert.deepEqual(back.artifacts[0].file, file);
  const bad = parseArtifacts({
    artifacts: [
      { id: 1, kind: 'file', content: '' },
      { id: 2, kind: 'markdown', content: 'x', file },
      {
        id: 3,
        kind: 'file',
        content: '',
        file: { name: 'a', mime: 'image/png', ext: 'png', bytes: -5 },
      },
      { id: 4, kind: 'file', content: '', file },
    ],
  });
  assert.deepEqual(
    bad.artifacts.map((x) => x.id),
    [2, 4],
  );
  assert.equal(bad.artifacts[0].file, null);
});

test('uploaded files are called Image or PDF in lists, and sizes are said plainly', async () => {
  const { fileLabel, byteWords } = await import('./artifacts.ts');
  assert.equal(
    fileLabel({ file: { name: 'a', mime: 'image/png', ext: 'png', bytes: 1 } }),
    'Image',
  );
  assert.equal(
    fileLabel({
      file: { name: 'a', mime: 'application/pdf', ext: 'pdf', bytes: 1 },
    }),
    'PDF',
  );
  assert.equal(fileLabel({ file: null }), null);
  assert.equal(byteWords(512), '512 bytes');
  assert.equal(byteWords(2048), '2 KB');
  assert.equal(byteWords(3 * 1024 * 1024 + 200_000), '3.2 MB');
});

test('artifacts in a Space that no longer exists are put outside every Space (and nothing else changes)', () => {
  let state = defaultArtifacts();
  state = make(state, {
    kind: 'markdown',
    title: 'In a live Space',
    spaceId: 1,
  }).state;
  state = make(state, {
    kind: 'markdown',
    title: 'In a gone Space',
    spaceId: 9,
  }).state;
  state = make(state, {
    kind: 'markdown',
    title: 'In no Space',
    spaceId: null,
  }).state;
  const fixed = releaseMissingSpaces(state, [1, 2]);
  assert.deepEqual(
    fixed.artifacts.map((a) => [a.title, a.spaceId]),
    [
      ['In a live Space', 1],
      ['In a gone Space', null],
      ['In no Space', null],
    ],
  );
  // Nothing wrong: the same object comes back (no needless save).
  assert.equal(releaseMissingSpaces(fixed, [1, 2]), fixed);
  assert.equal(
    releaseMissingSpaces(defaultArtifacts(), []).artifacts.length,
    0,
  );
});
