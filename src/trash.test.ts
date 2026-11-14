import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createArtifact,
  defaultArtifacts,
  deleteArtifact,
  emptyArtifactTrash,
  findArtifact,
  MAX_ARTIFACT_TRASH,
  parseArtifacts,
  purgeArtifact,
  purgeOldArtifacts,
  restoreArtifact,
} from './artifacts.ts';
import {
  addUserMessage,
  defaultChats,
  deleteConversation,
  emptyChatTrash,
  findConversation,
  MAX_TRASH,
  newConversation,
  parseChats,
  purgeConversation,
  purgeOldChats,
  renameConversation,
  restoreConversation,
} from './chats.ts';

const DAY = 24 * 60 * 60_000;

function twoChats() {
  let chats = defaultChats(1000);
  const first = chats.activeId;
  chats = renameConversation(chats, first, 'Laptop deals');
  chats = addUserMessage(chats, first, 'find me a laptop', 1100)!.state;
  const second = newConversation(chats, 2000);
  return { chats: second.state, first, second: second.id };
}

test('a deleted chat waits in the trash with its messages, not gone', () => {
  const { chats, first, second } = twoChats();
  const after = deleteConversation(chats, first, 5000);
  assert.equal(findConversation(after, first), undefined);
  assert.equal(after.trash.length, 1);
  assert.equal(after.trash[0].id, first);
  assert.equal(after.trash[0].deletedAt, 5000);
  assert.equal(after.trash[0].messages.length, 1);
  assert.equal(after.activeId, second);
});

test('deleting the last chat leaves a fresh one and keeps the old in the trash', () => {
  const only = defaultChats(1000);
  const after = deleteConversation(only, only.activeId, 5000);
  assert.equal(after.conversations.length, 1);
  assert.notEqual(after.conversations[0].id, only.activeId);
  assert.equal(after.trash.length, 1);
});

test('a deleted chat comes back whole, once, and only if it is in the trash', () => {
  const { chats, first } = twoChats();
  const deleted = deleteConversation(chats, first, 5000);
  const back = restoreConversation(deleted, first);
  assert.equal(findConversation(back, first)?.title, 'Laptop deals');
  assert.equal(findConversation(back, first)?.messages.length, 1);
  assert.equal(back.trash.length, 0);
  assert.equal('deletedAt' in back.conversations.at(-1)!, false);
  assert.equal(restoreConversation(back, first), back);
  assert.equal(restoreConversation(deleted, 9999), deleted);
});

test('a chat can be deleted for good, the trash emptied, and old ones purged', () => {
  const { chats, first, second } = twoChats();
  let state = deleteConversation(chats, first, 1 * DAY);
  state = deleteConversation(state, second, 20 * DAY);
  assert.equal(state.trash.length, 2);
  assert.equal(purgeConversation(state, 9999), state);
  assert.deepEqual(
    purgeConversation(state, first).trash.map((c) => c.id),
    [second],
  );
  // 31 days after the first was deleted, only it is purged.
  const purged = purgeOldChats(state, 32 * DAY, 30);
  assert.deepEqual(
    purged.trash.map((c) => c.id),
    [second],
  );
  assert.equal(purgeOldChats(state, 2 * DAY, 30), state);
  assert.equal(emptyChatTrash(state).trash.length, 0);
  assert.equal(emptyChatTrash(defaultChats()).trash.length, 0);
});

test('the chat trash is capped, and survives saving', () => {
  let chats = defaultChats(1000);
  for (let i = 0; i < MAX_TRASH + 3; i++) {
    const made = newConversation(chats, 2000 + i);
    chats = deleteConversation(made.state, made.id, 3000 + i);
  }
  assert.equal(chats.trash.length, MAX_TRASH);
  const saved = parseChats(JSON.parse(JSON.stringify(chats)), 99999);
  assert.equal(saved.trash.length, MAX_TRASH);
  assert.equal(saved.trash[0].deletedAt, chats.trash[0].deletedAt);
  // An id in the trash is never reused for a new chat.
  const next = newConversation(saved, 9999);
  assert.ok(!saved.trash.some((c) => c.id === next.id));
});

test('junk in a saved chat trash is dropped', () => {
  const { chats, first } = twoChats();
  const deleted = deleteConversation(chats, first, 5000);
  const raw = JSON.parse(JSON.stringify(deleted));
  raw.trash.push('junk', { id: 'x' }, { ...raw.trash[0] }); // a duplicate id
  assert.equal(parseChats(raw, 9000).trash.length, 1);
  delete raw.trash;
  assert.equal(parseChats(raw, 9000).trash.length, 0);
});

function twoArtifacts() {
  let state = defaultArtifacts();
  const a = createArtifact(
    state,
    {
      kind: 'markdown',
      title: 'Plan',
      content: '# Plan',
      emoji: '📚',
      spaceId: 7,
    },
    1,
  );
  assert.ok(a.ok);
  state = a.state;
  const b = createArtifact(
    state,
    { kind: 'text', title: 'Notes', content: 'n' },
    2,
  );
  assert.ok(b.ok);
  return { state: b.state, planId: a.artifact.id, notesId: b.artifact.id };
}

test('a deleted artifact waits in the trash with its text', () => {
  const { state, planId } = twoArtifacts();
  const after = deleteArtifact(state, planId, 5000);
  assert.equal(findArtifact(after, planId), undefined);
  assert.equal(after.trash.length, 1);
  assert.equal(after.trash[0].content, '# Plan');
  assert.equal(after.trash[0].deletedAt, 5000);
  assert.equal(deleteArtifact(state, 9999, 1), state);
});

test('a deleted artifact comes back whole, to its Space if that still exists', () => {
  const { state, planId } = twoArtifacts();
  const deleted = deleteArtifact(state, planId, 5000);
  const home = restoreArtifact(deleted, planId, (id) => id === 7);
  assert.equal(findArtifact(home, planId)?.spaceId, 7);
  assert.equal(findArtifact(home, planId)?.emoji, '📚');
  assert.equal(findArtifact(home, planId)?.content, '# Plan');
  assert.equal(home.trash.length, 0);
  // If its Space is gone it comes back outside every Space.
  const lost = restoreArtifact(deleted, planId, () => false);
  assert.equal(findArtifact(lost, planId)?.spaceId, null);
  assert.equal(
    restoreArtifact(deleted, 9999, () => true),
    deleted,
  );
});

test('an artifact can be deleted for good, the trash emptied, and old ones purged', () => {
  const { state, planId, notesId } = twoArtifacts();
  let s = deleteArtifact(state, planId, 1 * DAY);
  s = deleteArtifact(s, notesId, 20 * DAY);
  assert.deepEqual(
    purgeArtifact(s, planId).trash.map((a) => a.id),
    [notesId],
  );
  assert.equal(purgeArtifact(s, 9999), s);
  assert.deepEqual(
    purgeOldArtifacts(s, 32 * DAY, 30).trash.map((a) => a.id),
    [notesId],
  );
  assert.equal(purgeOldArtifacts(s, 2 * DAY, 30), s);
  assert.equal(emptyArtifactTrash(s).trash.length, 0);
});

test('the artifact trash is capped, survives saving, and drops junk', () => {
  let state = defaultArtifacts();
  for (let i = 0; i < MAX_ARTIFACT_TRASH + 3; i++) {
    const made = createArtifact(state, { kind: 'text', title: `T${i}` }, i);
    assert.ok(made.ok);
    state = deleteArtifact(made.state, made.artifact.id, 1000 + i);
  }
  assert.equal(state.trash.length, MAX_ARTIFACT_TRASH);
  const saved = parseArtifacts(JSON.parse(JSON.stringify(state)));
  assert.equal(saved.trash.length, MAX_ARTIFACT_TRASH);
  assert.ok(saved.nextId > Math.max(...saved.trash.map((a) => a.id)));
  const raw = JSON.parse(JSON.stringify(state));
  raw.trash.push('junk', { id: 'x' }, { ...raw.trash[0] });
  assert.equal(parseArtifacts(raw).trash.length, MAX_ARTIFACT_TRASH);
});
