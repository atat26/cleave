import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answerFor,
  askText,
  classify,
  decide,
  defaultPermissions,
  parsePermissions,
  resetSite,
  setAnswer,
  siteKey,
} from './permissions.ts';

test('asking kinds are asked about; harmless ones are fine; everything else is refused', () => {
  assert.deepEqual(classify('geolocation'), {
    verdict: 'ask',
    kinds: ['location'],
  });
  assert.deepEqual(classify('notifications'), {
    verdict: 'ask',
    kinds: ['notifications'],
  });
  assert.deepEqual(classify('clipboard-read'), {
    verdict: 'ask',
    kinds: ['clipboard'],
  });
  assert.deepEqual(classify('media', ['video', 'audio']), {
    verdict: 'ask',
    kinds: ['camera', 'microphone'],
  });
  assert.deepEqual(classify('media', ['audio']), {
    verdict: 'ask',
    kinds: ['microphone'],
  });
  assert.deepEqual(classify('media', []), { verdict: 'block' });
  assert.deepEqual(classify('fullscreen'), { verdict: 'allow' });
  assert.deepEqual(classify('clipboard-sanitized-write'), { verdict: 'allow' });
  for (const refused of [
    'usb',
    'serial',
    'hid',
    'midi',
    'display-capture',
    'x',
  ]) {
    assert.deepEqual(classify(refused), { verdict: 'block' }, refused);
  }
});

test('only secure sites (or this computer) have a key; it is up to host and port', () => {
  assert.equal(siteKey('https://a.example.com/x?y#z'), 'https://a.example.com');
  assert.equal(
    siteKey('https://a.example.com:8443/'),
    'https://a.example.com:8443',
  );
  assert.equal(siteKey('http://localhost:3000/p'), 'http://localhost:3000');
  assert.equal(siteKey('http://example.com/'), null);
  assert.equal(siteKey('file:///c:/x.html'), null);
  assert.equal(siteKey('not a url'), null);
});

test('decisions: remembered answers win, a block beats an allow, the rest is asked', () => {
  const site = 'https://a.com';
  let state = defaultPermissions();
  assert.deepEqual(decide(state, site, ['camera']), {
    verdict: 'ask',
    kinds: ['camera'],
  });
  state = setAnswer(state, site, 'camera', 'allow');
  assert.deepEqual(decide(state, site, ['camera']), { verdict: 'allow' });
  assert.deepEqual(decide(state, site, ['camera', 'microphone']), {
    verdict: 'ask',
    kinds: ['microphone'],
  });
  state = setAnswer(state, site, 'microphone', 'block');
  assert.deepEqual(decide(state, site, ['camera', 'microphone']), {
    verdict: 'block',
  });
  // Another site is unaffected; no site (an insecure page) is refused.
  assert.deepEqual(decide(state, 'https://b.com', ['camera']), {
    verdict: 'ask',
    kinds: ['camera'],
  });
  assert.deepEqual(decide(state, null, ['camera']), { verdict: 'block' });
});

test('answers can be forgotten, and a site can be reset', () => {
  const site = 'https://a.com';
  let state = setAnswer(defaultPermissions(), site, 'location', 'allow');
  assert.equal(answerFor(state, site, 'location'), 'allow');
  state = setAnswer(state, site, 'location', null);
  assert.deepEqual(state.sites, {});
  state = setAnswer(state, site, 'location', 'block');
  state = setAnswer(state, site, 'camera', 'allow');
  assert.deepEqual(resetSite(state, site).sites, {});
  assert.equal(resetSite(state, 'https://zzz.com'), state);
});

test('the list is capped, dropping the oldest sites', () => {
  let state = defaultPermissions();
  for (let i = 0; i < 520; i++) {
    state = setAnswer(state, `https://s${i}.com`, 'camera', 'allow');
  }
  const keys = Object.keys(state.sites);
  assert.equal(keys.length, 500);
  assert.equal(keys[0], 'https://s20.com');
});

test('whatever is on disk is repaired, never trusted', () => {
  const parsed = parsePermissions({
    sites: {
      'https://ok.com': { camera: 'allow', location: 'maybe', usb: 'allow' },
      'http://insecure.com': { camera: 'allow' },
      'https://empty.com': {},
      'https://bad.com': 5,
    },
  });
  assert.deepEqual(parsed.sites, { 'https://ok.com': { camera: 'allow' } });
  for (const junk of [null, 5, 'x', [], { sites: [] }, { sites: 3 }]) {
    assert.deepEqual(parsePermissions(junk), defaultPermissions());
  }
});

test('the question names the site and says what it wants, in plain words', () => {
  assert.equal(askText('a.com', ['camera']), 'a.com wants to use your camera');
  assert.equal(
    askText('a.com', ['camera', 'microphone']),
    'a.com wants to use your camera and microphone',
  );
  assert.equal(
    askText('a.com', ['location']),
    'a.com wants to know your location',
  );
});
