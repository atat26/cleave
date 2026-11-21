import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stricterLevel } from './toolPolicy.ts';
import type { ApprovalLevel } from './toolPolicy.ts';

const LEVELS: ApprovalLevel[] = ['never', 'ask', 'if-safe', 'always'];

test('the stricter of two levels: never, then ask, then allow if safe, then always allow', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    for (let j = 0; j < LEVELS.length; j++) {
      assert.equal(
        stricterLevel(LEVELS[i], LEVELS[j]),
        LEVELS[Math.min(i, j)],
        `${LEVELS[i]} and ${LEVELS[j]}`,
      );
    }
  }
});
