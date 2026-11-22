import assert from 'node:assert/strict';
import { test } from 'node:test';
import { feedbackUrl, ISSUES_URL, REPO_URL } from './feedback.ts';

test('each kind opens its own form, filled in with the version and the system', () => {
  const about = { version: '0.2.3', system: 'Windows 10.0.26200' };
  const bug = new URL(feedbackUrl('bug', about));
  assert.equal(bug.origin + bug.pathname, `${REPO_URL}/issues/new`);
  assert.equal(bug.searchParams.get('template'), 'bug.yml');
  assert.equal(bug.searchParams.get('version'), '0.2.3');
  assert.equal(bug.searchParams.get('system'), 'Windows 10.0.26200');
  const annoyance = new URL(feedbackUrl('annoyance', about));
  assert.equal(annoyance.searchParams.get('template'), 'annoyance.yml');
  assert.ok(ISSUES_URL.startsWith(REPO_URL));
});

test('odd values cannot change where the address goes, and are cut short', () => {
  const url = new URL(
    feedbackUrl('bug', {
      version: '1&template=evil.yml#x',
      system: 'a b\n'.repeat(100),
    }),
  );
  assert.equal(url.host, 'github.com');
  assert.equal(url.pathname, '/atat26/cleave/issues/new');
  assert.equal(url.searchParams.get('template'), 'bug.yml');
  assert.equal(url.searchParams.get('version'), '1&template=evil.yml#x');
  assert.ok((url.searchParams.get('system') ?? '').length <= 80);
});
