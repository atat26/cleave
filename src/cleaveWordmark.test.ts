import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// The wordmark is drawn in CleaveWordmark.tsx (a test cannot load .tsx, so this reads it as text) and
// must stay the brand's own drawing in assets/cleave-wordmark.svg: letters are never redrawn or retyped.
const svg = readFileSync('assets/cleave-wordmark.svg', 'utf8');
const component = readFileSync('src/CleaveWordmark.tsx', 'utf8');

test('every shape of the brand wordmark is in the component, unchanged', () => {
  const shapes = [
    ...svg.matchAll(/ d="([^"]+)"/g),
    ...svg.matchAll(/<circle ([^/]+)\/>/g),
    ...svg.matchAll(/<ellipse ([^/]+)\/>/g),
  ].map((m) => m[1]);
  assert.ok(shapes.length >= 13, 'the brand file was read');
  for (const shape of shapes) {
    // Circles and ellipses are written as attributes in the component, so compare their numbers.
    const numbers = shape.match(/-?\d+(\.\d+)?/g) ?? [];
    if (shape.includes('=')) {
      for (const n of numbers) assert.ok(component.includes(`"${n}"`), n);
    } else {
      assert.ok(component.includes(shape), `missing shape ${shape}`);
    }
  }
  assert.ok(component.includes('translate(246 70) scale(0.5)'));
  assert.ok(component.includes('viewBox="0 -8 464 130"'));
});

test('the colours come from the theme, so the logo is right in light and dark', () => {
  assert.ok(component.includes('var(--cleave-letters)'));
  assert.ok(component.includes('var(--cleave-line)'));
  assert.ok(!component.includes('#14142b'));
  assert.ok(!component.includes('#2F5BFF'));
});
