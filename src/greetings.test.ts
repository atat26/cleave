import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allGreetings,
  dayPartOf,
  greetingChoices,
  greetingFor,
} from './greetings.ts';

const at = (day: number, hour: number) =>
  // 2026-11-15 is a Sunday.
  new Date(2026, 10, 15 + day, hour, 30);

test('the hour decides the time of day', () => {
  assert.equal(dayPartOf(4), 'night');
  assert.equal(dayPartOf(5), 'early');
  assert.equal(dayPartOf(8), 'morning');
  assert.equal(dayPartOf(12), 'midday');
  assert.equal(dayPartOf(14), 'afternoon');
  assert.equal(dayPartOf(18), 'evening');
  assert.equal(dayPartOf(22), 'night');
  assert.equal(dayPartOf(0), 'night');
});

test('every day and hour has lines to choose from, and a tab always gets the same one', () => {
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const when = at(day, hour);
      assert.ok(greetingChoices(when).length >= 6, `${day}/${hour}`);
      for (let seed = 0; seed < 12; seed++) {
        const line = greetingFor(when, seed);
        assert.ok(line.length > 5 && line.length <= 60, line);
        assert.equal(line, greetingFor(when, seed));
      }
    }
  }
});

test('different tabs can get different lines, and the line follows the day and the time', () => {
  const monday = at(1, 9);
  assert.ok(
    new Set([0, 1, 2, 3, 4, 5].map((s) => greetingFor(monday, s))).size > 3,
  );
  assert.ok(greetingChoices(monday).some((l) => l.includes('Monday')));
  assert.ok(greetingChoices(at(5, 9)).some((l) => l.includes('Friday')));
  assert.notDeepEqual(greetingChoices(at(1, 9)), greetingChoices(at(1, 23)));
  // A negative or odd seed still works.
  assert.ok(greetingFor(monday, -7).length > 0);
});

test('no line is repeated, and none uses emoji', () => {
  const all = allGreetings();
  assert.equal(new Set(all).size, all.length);
  for (const line of all) {
    assert.ok(!/\p{Extended_Pictographic}/u.test(line), line);
  }
});
