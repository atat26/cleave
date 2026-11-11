import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInline, parseMarkdown, safeLink } from './markdown.ts';
import type { Block, Inline } from './markdown.ts';

// A short text form of the pieces, so a test can say what it expects in one line.
function show(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return n.text;
        case 'strong':
          return `<b>${show(n.children)}</b>`;
        case 'em':
          return `<i>${show(n.children)}</i>`;
        case 'del':
          return `<s>${show(n.children)}</s>`;
        case 'code':
          return `<c>${n.text}</c>`;
        case 'link':
          return `<a ${n.url}>${show(n.children)}</a>`;
      }
    })
    .join('');
}

const types = (blocks: Block[]) => blocks.map((b) => b.type);

test('bold, italic, strikethrough and code', () => {
  assert.equal(
    show(parseInline('a **bold** and *it* and ~~gone~~ and `x`')),
    'a <b>bold</b> and <i>it</i> and <s>gone</s> and <c>x</c>',
  );
  assert.equal(
    show(parseInline('__also bold__ and _also italic_')),
    '<b>also bold</b> and <i>also italic</i>',
  );
  assert.equal(
    show(parseInline('**bold with *italic* inside**')),
    '<b>bold with <i>italic</i> inside</b>',
  );
  assert.equal(
    show(parseInline('``code with ` tick``')),
    '<c>code with ` tick</c>',
  );
});

test('things that are not formatting stay plain', () => {
  // Spaces inside the stars, a lone star, snake_case words, math.
  assert.equal(show(parseInline('2 * 3 * 4')), '2 * 3 * 4');
  assert.equal(
    show(parseInline('use snake_case_names here')),
    'use snake_case_names here',
  );
  assert.equal(show(parseInline('**not closed')), '**not closed');
  assert.equal(show(parseInline('`not closed')), '`not closed');
  assert.equal(show(parseInline('a \\*literal\\* star')), 'a *literal* star');
});

test('only plain web links are links; other kinds show just their words', () => {
  assert.equal(
    show(parseInline('[site](https://a.example/x?y=1)')),
    '<a https://a.example/x?y=1>site</a>',
  );
  for (const bad of [
    '[click](javascript:alert(1))',
    '[file](file:///C:/secret.txt)',
    '[data](data:text/html,hi)',
    '[creds](https://u:p@evil.example/)',
    '[rel](/just/a/path)',
  ]) {
    const out = show(parseInline(bad));
    assert.ok(!out.includes('<a '), bad);
  }
  // (The address stops at the first closing bracket, so one bracket is left over: harmless.)
  assert.equal(show(parseInline('[click](javascript:alert(1))')), 'click)');
  // The words of a link can be formatted; a bare address becomes a link.
  assert.equal(
    show(parseInline('[**big** news](https://a.example/)')),
    '<a https://a.example/><b>big</b> news</a>',
  );
  assert.equal(
    show(parseInline('see https://a.example/page.')),
    'see <a https://a.example/page>https://a.example/page</a>.',
  );
});

test('images are never loaded: they show as words', () => {
  assert.equal(
    show(parseInline('![a cat](https://tracker.example/cat.png)')),
    '[image: a cat]',
  );
  const all = JSON.stringify(parseInline('x ![](https://t.example/p.gif) y'));
  assert.ok(!all.includes('t.example'));
});

test('raw HTML is only text', () => {
  const nodes = parseInline(
    '<script>alert(1)</script> <img src=x onerror=alert(1)> <b>x</b>',
  );
  assert.equal(
    nodes.every((n) => n.type === 'text'),
    true,
  );
  assert.equal(
    show(nodes),
    '<script>alert(1)</script> <img src=x onerror=alert(1)> <b>x</b>',
  );
});

test('headings, rules, code blocks and quotes', () => {
  const blocks = parseMarkdown(
    '# Title\n\nSome **text**.\n\n## Part\n\n---\n\n> quoted\n> more\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\nafter',
  );
  assert.deepEqual(types(blocks), [
    'heading',
    'paragraph',
    'heading',
    'rule',
    'quote',
    'code',
    'paragraph',
  ]);
  const heading = blocks[0];
  assert.equal(heading.type === 'heading' && heading.level, 1);
  const code = blocks[5];
  assert.deepEqual(code.type === 'code' && [code.lang, code.text], [
    'js',
    'const a = 1;\n\nconst b = 2;',
  ]);
  // A # without a space is not a heading.
  assert.deepEqual(types(parseMarkdown('#hashtag')), ['paragraph']);
});

test('lists: bullets, numbers, nesting and items with several lines', () => {
  const [list] = parseMarkdown(
    '- one\n- two\n  - nested a\n  - nested b\n- three',
  );
  assert.ok(list.type === 'list');
  assert.equal(list.items.length, 3);
  assert.deepEqual(types(list.items[1]), ['paragraph', 'list']);
  const nested = list.items[1][1];
  assert.equal(nested.type === 'list' && nested.items.length, 2);

  const [numbered] = parseMarkdown('3. third\n4. fourth');
  assert.ok(
    numbered.type === 'list' && numbered.ordered && numbered.start === 3,
  );

  // A different kind of list after a blank line is a new list.
  assert.deepEqual(types(parseMarkdown('- a\n- b\n\n1. x\n2. y')), [
    'list',
    'list',
  ]);
});

test('tables with alignment', () => {
  const [table] = parseMarkdown(
    '| Name | Qty |\n|:-----|----:|\n| Apple | 3 |\n| Pear | 12 |',
  );
  assert.ok(table.type === 'table');
  assert.deepEqual(table.align, ['left', 'right']);
  assert.equal(show(table.header[0]), 'Name');
  assert.equal(table.rows.length, 2);
  assert.equal(show(table.rows[1][1]), '12');
  // Without a separator line it is just text.
  assert.deepEqual(types(parseMarkdown('| a | b |\n| c | d |')), ['paragraph']);
});

test('paragraph lines keep their line breaks', () => {
  const [p] = parseMarkdown('line one\nline two');
  assert.ok(p.type === 'paragraph');
  assert.equal(show(p.children), 'line one\nline two');
});

test('half-written Markdown from a reply that is still streaming never breaks', () => {
  const whole =
    '# Head\n\n**bold** and `code` and [link](https://a.example/x) and\n\n```js\nlet a = 1;\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- item\n  - sub';
  for (let end = 0; end <= whole.length; end++) {
    assert.doesNotThrow(
      () => parseMarkdown(whole.slice(0, end)),
      `cut at ${end}`,
    );
  }
  // An unclosed code block shows the rest as code.
  const [code] = parseMarkdown('```py\nprint(1)\nprint(2)');
  assert.deepEqual(code.type === 'code' && code.text, 'print(1)\nprint(2)');
});

test('hostile or huge input is cut down and stays fast', () => {
  const start = Date.now();
  for (const text of [
    '*'.repeat(50_000),
    '_a'.repeat(30_000),
    '['.repeat(20_000),
    '`'.repeat(30_000),
    '> '.repeat(5_000) + 'x',
    '- '.repeat(20_000),
    'x'.repeat(500_000),
    '| a |\n|---|\n'.repeat(5_000),
  ]) {
    assert.doesNotThrow(() => parseMarkdown(text));
  }
  assert.ok(Date.now() - start < 3000, 'took too long');
});

test('safeLink accepts plain web addresses only', () => {
  assert.equal(safeLink('https://a.example/p?q=1'), 'https://a.example/p?q=1');
  assert.equal(safeLink('ftp://a.example/'), null);
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('https://u:p@a.example/'), null);
  assert.equal(safeLink(''), null);
  assert.equal(safeLink('https://a.example/' + 'x'.repeat(3000)), null);
});
