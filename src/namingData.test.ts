import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addUserMessage,
  appendToMessage,
  byRecency,
  newConversation,
  applyAiName,
  chatNamingMaterial,
  defaultChats,
  findConversation,
  isFirstExchange,
  parseChats,
  renameConversation,
  setConversationEmoji,
  startAssistantMessage,
} from './chats.ts';

const chatOf = (state: ReturnType<typeof defaultChats>) =>
  findConversation(state, state.activeId)!;

test('the assistant names a chat and picks its emoji', () => {
  const chats = defaultChats(1);
  const named = applyAiName(
    chats,
    chats.activeId,
    { name: 'Laptop deals', emoji: '💻' },
    false,
  );
  assert.equal(chatOf(named).title, 'Laptop deals');
  assert.equal(chatOf(named).emoji, '💻');
  assert.equal(chatOf(named).titleByUser, false);
});

test('automatic naming leaves what you chose yourself alone', () => {
  let chats = defaultChats(1);
  chats = renameConversation(chats, chats.activeId, 'My own name');
  chats = setConversationEmoji(chats, chats.activeId, '🚀');
  const auto = applyAiName(
    chats,
    chats.activeId,
    { name: 'AI name', emoji: '💻' },
    false,
  );
  assert.equal(chatOf(auto).title, 'My own name');
  assert.equal(chatOf(auto).emoji, '🚀');
  // Only the part you chose is protected.
  let onlyName = renameConversation(defaultChats(1), 1, 'Mine');
  onlyName = applyAiName(onlyName, 1, { name: 'AI name', emoji: '💻' }, false);
  assert.equal(chatOf(onlyName).title, 'Mine');
  assert.equal(chatOf(onlyName).emoji, '💻');
});

test("the name-it button replaces your choice, and it then counts as the assistant's", () => {
  let chats = defaultChats(1);
  chats = renameConversation(chats, 1, 'Mine');
  chats = setConversationEmoji(chats, 1, '🚀');
  const forced = applyAiName(chats, 1, { name: 'AI name', emoji: '💻' }, true);
  assert.equal(chatOf(forced).title, 'AI name');
  assert.equal(chatOf(forced).emoji, '💻');
  assert.equal(chatOf(forced).titleByUser, false);
  assert.equal(chatOf(forced).emojiByUser, false);
  // A retry may rename it again now.
  const again = applyAiName(forced, 1, { name: 'Newer', emoji: null }, false);
  assert.equal(chatOf(again).title, 'Newer');
  assert.equal(chatOf(again).emoji, '💻');
});

test('a name or emoji that is missing or invalid changes nothing', () => {
  const chats = defaultChats(1);
  const same = applyAiName(chats, 1, { name: null, emoji: 'nope' }, true);
  assert.equal(chatOf(same).title, chatOf(chats).title);
  assert.equal(chatOf(same).emoji, null);
});

test('the first exchange is found, and the naming material holds the start of it', () => {
  let chats = defaultChats(1);
  assert.equal(isFirstExchange(chatOf(chats)), false);
  const sent = addUserMessage(chats, 1, 'Find a cheap laptop under $500', 10)!;
  chats = sent.state;
  assert.equal(isFirstExchange(chatOf(chats)), true);
  const reply = startAssistantMessage(chats, 1, 'm', 11)!;
  chats = appendToMessage(reply.state, 1, reply.id, 'Here are some options');
  const material = chatNamingMaterial(chatOf(chats));
  assert.match(material, /User: Find a cheap laptop/);
  assert.match(material, /Assistant: Here are some options/);
  chats = addUserMessage(chats, 1, 'second', 12)!.state;
  assert.equal(isFirstExchange(chatOf(chats)), false);
});

test('the "chosen by you" marks survive saving', () => {
  let chats = renameConversation(defaultChats(1), 1, 'Mine');
  chats = setConversationEmoji(chats, 1, '🚀');
  const back = chatOf(parseChats(JSON.parse(JSON.stringify(chats))));
  assert.equal(back.titleByUser, true);
  assert.equal(back.emojiByUser, true);
});

test('chats are listed by recent use, so an old chat that gets a message goes back to the top', () => {
  let chats = defaultChats(1000);
  const first = chats.activeId;
  const second = newConversation(chats, 2000);
  chats = second.state;
  const third = newConversation(chats, 3000);
  chats = third.state;
  assert.deepEqual(
    byRecency(chats.conversations).map((c) => c.id),
    [third.id, second.id, first],
  );
  // A message in the oldest chat brings it to the top.
  chats = addUserMessage(chats, first, 'hello again', 4000)!.state;
  assert.deepEqual(
    byRecency(chats.conversations).map((c) => c.id),
    [first, third.id, second.id],
  );
  // The same moment: the newer chat first. The list given is not changed.
  const same = [
    { id: 1, updatedAt: 5 },
    { id: 2, updatedAt: 5 },
  ];
  assert.deepEqual(
    byRecency(same).map((c) => c.id),
    [2, 1],
  );
  assert.deepEqual(
    same.map((c) => c.id),
    [1, 2],
  );
});
