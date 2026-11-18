import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answerFor,
  badgesFor,
  cardMayTakeFocus,
  cleanCard,
  MAX_CARD_LIST,
  MAX_CARD_TEXT,
  nextLine,
} from './approvalCard.ts';

test('card details are cut to known fields and sizes, and nothing odd gets through', () => {
  assert.equal(cleanCard(null), undefined);
  assert.equal(cleanCard('text'), undefined);
  assert.equal(cleanCard({}), undefined);
  assert.equal(cleanCard({ text: { label: 'x', value: '' } }), undefined);
  const card = cleanCard({
    text: {
      label: 'Text to type',
      value: 'a'.repeat(MAX_CARD_TEXT + 50),
      extra: 1,
    },
    destination: 'https://shop.example/a',
    list: Array.from({ length: 30 }, (_, i) => `line ${i}`),
    more: 5,
    askAgain: true,
    evil: '<script>',
  });
  assert.equal(card?.text?.value.length, MAX_CARD_TEXT);
  assert.equal(card?.list?.length, MAX_CARD_LIST);
  assert.equal(card?.more, 5);
  assert.equal(card?.askAgain, true);
  assert.equal('evil' in (card ?? {}), false);
  // Wrong kinds are dropped.
  const odd = cleanCard({
    list: [1, 'ok', null],
    more: -2,
    askAgain: 'yes',
    destination: 5,
  });
  assert.deepEqual(odd, { list: ['ok'] });
});

test('badges say why it is risky, what kind of thing it is, and when it asks again', () => {
  assert.deepEqual(badgesFor('click', false), ['Changes a page']);
  assert.deepEqual(badgesFor('click', true), [
    "Can't be undone",
    'Changes a page',
  ]);
  assert.deepEqual(badgesFor('press_key', true), [
    'Might submit a form',
    'Changes a page',
  ]);
  assert.deepEqual(badgesFor('close_tab', true), [
    'Closes something you have open',
    'Closes a tab',
  ]);
  assert.deepEqual(badgesFor('search_history', false), ['Your own data']);
  assert.deepEqual(badgesFor('create_skill', true, { askAgain: true }), [
    'Makes a skill',
    'Asks again: it read web pages',
  ]);
  assert.deepEqual(badgesFor('some_new_tool', false), []);
});

test('every tool that asks has a line saying what happens next', () => {
  assert.match(nextLine('click'), /in the page/);
  assert.match(nextLine('close_tab'), /open it again/);
  assert.match(nextLine('search_chats'), /your chosen model/);
  assert.match(nextLine('create_artifact'), /saves this/);
  assert.equal(nextLine('mystery'), 'It does this, then carries on.');
});

test('Enter allows, Shift+Enter allows the rest, Esc refuses; a risky card needs Ctrl+Enter', () => {
  assert.equal(answerFor({ key: 'Enter' }, false), 'allow');
  assert.equal(
    answerFor({ key: 'Enter', shiftKey: true }, false),
    'allow-rest',
  );
  assert.equal(answerFor({ key: 'Escape' }, false), 'deny');
  assert.equal(answerFor({ key: 'Escape' }, true), 'deny');
  // Risky: a plain or Shift+Enter does nothing; Ctrl+Enter (or Cmd+Enter) allows just this one.
  assert.equal(answerFor({ key: 'Enter' }, true), null);
  assert.equal(answerFor({ key: 'Enter', shiftKey: true }, true), null);
  assert.equal(answerFor({ key: 'Enter', ctrlKey: true }, true), 'allow');
  assert.equal(answerFor({ key: 'Enter', metaKey: true }, true), 'allow');
  assert.equal(
    answerFor({ key: 'Enter', ctrlKey: true, shiftKey: true }, true),
    'allow',
  );
  // Anything else, and Alt combinations, mean nothing.
  assert.equal(answerFor({ key: 'a' }, false), null);
  assert.equal(answerFor({ key: ' ' }, false), null);
  assert.equal(answerFor({ key: 'Enter', altKey: true }, false), null);
});

test('a new card takes the keyboard only when you are not typing', () => {
  assert.equal(cardMayTakeFocus(null), true);
  assert.equal(cardMayTakeFocus({ tagName: 'BODY' }), true);
  assert.equal(cardMayTakeFocus({ tagName: 'BUTTON' }), true);
  assert.equal(cardMayTakeFocus({ tagName: 'TEXTAREA' }), false);
  assert.equal(
    cardMayTakeFocus({ tagName: 'DIV', isContentEditable: true }),
    false,
  );
  assert.equal(cardMayTakeFocus({ tagName: 'INPUT', type: 'text' }), false);
  assert.equal(cardMayTakeFocus({ tagName: 'INPUT' }), false);
  assert.equal(cardMayTakeFocus({ tagName: 'INPUT', type: 'checkbox' }), true);
});
