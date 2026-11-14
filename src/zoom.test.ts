import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultZoomSettings,
  MAX_ZOOM,
  MIN_ZOOM,
  parseZoomSettings,
  stepZoom,
  withSiteZoom,
  zoomFor,
  zoomHost,
  zoomLabel,
} from './zoom.ts';

test('zoom steps through the usual levels, in both directions', () => {
  assert.equal(stepZoom(1, 1), 1.1);
  assert.equal(stepZoom(1.1, 1), 1.25);
  assert.equal(stepZoom(1, -1), 0.9);
  assert.equal(stepZoom(0.9, -1), 0.8);
  assert.equal(stepZoom(0.5, 1), 0.67);
});

test('zoom stops at the ends', () => {
  assert.equal(stepZoom(MAX_ZOOM, 1), MAX_ZOOM);
  assert.equal(stepZoom(MIN_ZOOM, -1), MIN_ZOOM);
});

test('a zoom between steps moves to the nearest step in that direction', () => {
  assert.equal(stepZoom(1.2, 1), 1.25);
  assert.equal(stepZoom(1.2, -1), 1.1);
  assert.equal(stepZoom(10, -1), MAX_ZOOM);
  assert.equal(stepZoom(0.01, 1), MIN_ZOOM);
});

test('the label is a whole percent', () => {
  assert.equal(zoomLabel(1), '100%');
  assert.equal(zoomLabel(1.25), '125%');
  assert.equal(zoomLabel(0.67), '67%');
});

test('a page belongs to its host name; anything else has none', () => {
  assert.equal(
    zoomHost('https://Docs.Example.com/a/b?x=1'),
    'docs.example.com',
  );
  assert.equal(zoomHost('http://localhost:3000/'), 'localhost');
  for (const url of [
    'about:blank',
    'file:///c:/a.txt',
    'nonsense',
    '',
    'chrome://x',
  ]) {
    assert.equal(zoomHost(url), null);
  }
});

test('a site keeps its zoom, and going back to 100% forgets it', () => {
  let settings = defaultZoomSettings();
  settings = withSiteZoom(settings, 'a.example', 1.5);
  assert.equal(zoomFor(settings, 'a.example'), 1.5);
  assert.equal(zoomFor(settings, 'b.example'), 1);
  assert.equal(zoomFor(settings, null), 1);
  settings = withSiteZoom(settings, 'a.example', 1);
  assert.deepEqual(settings.sites, {});
});

test('a bad zoom or site changes nothing', () => {
  const settings = withSiteZoom(defaultZoomSettings(), 'a.example', 2);
  assert.equal(withSiteZoom(settings, 'a.example', 99), settings);
  assert.equal(withSiteZoom(settings, 'a.example', Number.NaN), settings);
  assert.equal(withSiteZoom(settings, null, 2), settings);
});

test('junk in the saved file is dropped, good entries survive', () => {
  const parsed = parseZoomSettings({
    version: 1,
    sites: {
      'good.example': 1.25,
      'Mixed.Example': 0.5,
      'default.example': 1,
      'too-big.example': 50,
      'text.example': 'big',
      '': 2,
    },
  });
  assert.deepEqual(parsed.sites, {
    'good.example': 1.25,
    'mixed.example': 0.5,
  });
  for (const junk of [null, 5, 'x', [], {}, { sites: null }, { sites: [] }]) {
    assert.deepEqual(parseZoomSettings(junk).sites, {});
  }
});
