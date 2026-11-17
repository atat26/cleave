import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_HIGHLIGHT_CHARS,
  detectLanguage,
  highlight,
  languageFromName,
  languageFromTag,
  languageName,
} from './highlight.ts';
import type { LanguageId, TokenKind } from './highlight.ts';

const LANGUAGES: LanguageId[] = [
  'plain',
  'javascript',
  'typescript',
  'json',
  'html',
  'xml',
  'css',
  'python',
  'shell',
  'powershell',
  'sql',
  'c',
  'cpp',
  'java',
  'csharp',
  'go',
  'rust',
  'php',
  'ruby',
  'kotlin',
  'swift',
  'yaml',
  'toml',
  'markdown',
];

// The kind of the piece that holds `text` (the first one that contains it).
const kindOf = (
  language: LanguageId,
  code: string,
  text: string,
): TokenKind | undefined =>
  highlight(language, code).find((t) => t.text.includes(text))?.kind;

test('the pieces always join back into exactly the text given', () => {
  const samples = [
    '',
    'x',
    '  \n\t\n',
    'const a = `x ${y}` + "s\\"q" + \'z\'; // end\n/* open',
    '{"a": [1, 2.5e3, true, null], "b": {"c": "d"}}',
    '<!doctype html><html><head><style>a{color:#fff}</style></head><body onclick="x()"><script>let i = 1 < 2;</script><!-- c --><p>a &amp; b</p></body></html>',
    '<div class=a id="b" disabled/><br><input value=\'x\' ',
    'def f(x):\n    """doc\n    more"""\n    return f"{x}" # c\n@dec\nclass A: pass',
    '#!/bin/bash\nfor i in 1 2; do echo "$i" ${HOME} # c\ndone',
    'SELECT a, "b" FROM t WHERE x = \'y\' -- c\n/* x */',
    'a:\n  - b: 1\n  - "c"\n# c\nk: yes',
    '[section]\nkey = "v"\n; c',
    '# Title\n\n**bold** `code` [l](u)\n```js\nlet a\n```\n> q\n- item',
    'a{b:c;d:e!important}@media (x){p{margin:-1.5em}}',
    'fn main() { let r = r#"x"#; println!("{}", 1u32); }',
    'unterminated "string and \'quote and `tick and /* comment',
    'emoji 😀 and ünïcode — text',
  ];
  for (const language of LANGUAGES) {
    for (const code of samples) {
      const tokens = highlight(language, code);
      assert.equal(
        tokens.map((t) => t.text).join(''),
        code,
        `${language}: ${JSON.stringify(code)}`,
      );
      for (const t of tokens)
        assert.ok(t.text.length > 0, `${language} gave an empty piece`);
    }
  }
});

test('random text never breaks it (it always joins back, and always finishes)', () => {
  const alphabet = [
    '<',
    '>',
    '/',
    '"',
    "'",
    '`',
    '*',
    '#',
    '\n',
    ' ',
    '=',
    '-',
    '!',
    '{',
    '}',
    '(',
    ')',
    'a',
    'Z',
    '1',
    '$',
    '@',
    ':',
    '\\',
    '\t',
    '😀',
    '[',
    ']',
    '.',
  ];
  let seed = 12345;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let n = 0; n < 60; n++) {
    let code = '';
    const length = next() % 80;
    for (let i = 0; i < length; i++) code += alphabet[next() % alphabet.length];
    for (const language of LANGUAGES) {
      assert.equal(
        highlight(language, code)
          .map((t) => t.text)
          .join(''),
        code,
        `${language}: ${JSON.stringify(code)}`,
      );
    }
  }
});

test('JavaScript: comments, strings, numbers, keywords, literals, functions and types', () => {
  const code =
    'const total = add(1, 2.5) + "x"; // note\nreturn new Map(null) /* c */';
  assert.equal(kindOf('javascript', code, 'const'), 'keyword');
  assert.equal(kindOf('javascript', code, 'add'), 'function');
  assert.equal(kindOf('javascript', code, '2.5'), 'number');
  assert.equal(kindOf('javascript', code, '"x"'), 'string');
  assert.equal(kindOf('javascript', code, '// note'), 'comment');
  assert.equal(kindOf('javascript', code, '/* c */'), 'comment');
  assert.equal(kindOf('javascript', code, 'null'), 'literal');
  assert.equal(kindOf('javascript', code, 'Map'), 'function');
  assert.equal(kindOf('javascript', 'let m: Map = x', 'Map'), 'type');
  // A word inside a string or comment is not a keyword.
  assert.equal(
    kindOf('javascript', '"const x" // return', 'const x'),
    'string',
  );
});

test('TypeScript knows a few more keywords than JavaScript', () => {
  assert.equal(kindOf('typescript', 'interface A {}', 'interface'), 'keyword');
  assert.notEqual(
    kindOf('javascript', 'interface A {}', 'interface'),
    'keyword',
  );
});

test('JSON: keys are told apart from values', () => {
  const code = '{"name": "Ann", "age": 30, "ok": true, "none": null}';
  assert.equal(kindOf('json', code, '"name"'), 'attr');
  assert.equal(kindOf('json', code, '"Ann"'), 'string');
  assert.equal(kindOf('json', code, '30'), 'number');
  assert.equal(kindOf('json', code, 'true'), 'literal');
});

test('HTML: tags, attributes, values, comments, and the code inside script and style', () => {
  const code =
    '<a href="x" class=y>t</a><!-- c --><script>let n = 1;</script><style>p{color:red}</style>';
  assert.equal(kindOf('html', code, 'a'), 'tag');
  assert.equal(kindOf('html', code, 'href'), 'attr');
  assert.equal(kindOf('html', code, '"x"'), 'string');
  assert.equal(kindOf('html', code, '<!-- c -->'), 'comment');
  // Inside <script>: JavaScript. Inside <style>: CSS.
  assert.equal(kindOf('html', code, 'let'), 'keyword');
  assert.equal(
    highlight('html', code).find((t) => t.text === 'color')?.kind,
    'attr',
  );
  // A "<" that is not a tag stays plain.
  assert.deepEqual(
    highlight('html', 'a < b').map((t) => t.kind),
    ['plain'],
  );
});

test('Python: triple quotes, decorators, keywords and None', () => {
  const code =
    '@app.route("/")\ndef go(x):\n    """doc"""\n    return None # c';
  assert.equal(kindOf('python', code, '@app.route'), 'function');
  assert.equal(kindOf('python', code, 'def'), 'keyword');
  assert.equal(kindOf('python', code, '"""doc"""'), 'string');
  assert.equal(kindOf('python', code, 'None'), 'literal');
  assert.equal(kindOf('python', code, '# c'), 'comment');
});

test('SQL words are found in any letter case; shell variables are marked', () => {
  assert.equal(kindOf('sql', 'select a from t', 'select'), 'keyword');
  assert.equal(kindOf('sql', 'SeLeCt a', 'SeLeCt'), 'keyword');
  assert.equal(kindOf('shell', 'echo $HOME # note', '$HOME'), 'attr');
  assert.equal(kindOf('shell', 'echo $HOME # note', '# note'), 'comment');
  // A # inside a word is not a comment.
  assert.notEqual(kindOf('shell', 'echo a#b', 'a#b'), 'comment');
});

test('YAML keys, Markdown headings and fences', () => {
  assert.equal(kindOf('yaml', 'name: x\nlist:\n  - a: 1', 'name'), 'attr');
  assert.equal(kindOf('yaml', 'name: x\nlist:\n  - a: 1', 'a'), 'attr');
  assert.equal(kindOf('markdown', '# Title\ntext', '# Title'), 'keyword');
  assert.equal(
    kindOf('markdown', 'a\n```js\nlet x\n```\nb', 'let x'),
    'string',
  );
});

test('plain text and very large text are left as they are', () => {
  assert.deepEqual(highlight('plain', 'const x = 1'), [
    { kind: 'plain', text: 'const x = 1' },
  ]);
  assert.deepEqual(highlight('javascript', ''), []);
  const big = 'const x = 1;\n'.repeat(Math.ceil(MAX_HIGHLIGHT_CHARS / 12) + 10);
  assert.ok(big.length > MAX_HIGHLIGHT_CHARS);
  assert.deepEqual(highlight('javascript', big), [
    { kind: 'plain', text: big },
  ]);
});

test('a language comes from a file name, a code fence label, or what the text looks like', () => {
  assert.equal(languageFromName('calc.py'), 'python');
  assert.equal(languageFromName('src/App.TSX'), 'typescript');
  assert.equal(languageFromName('C:\\x\\run.ps1'), 'powershell');
  assert.equal(languageFromName('Dockerfile'), 'shell');
  assert.equal(languageFromName('notes'), null);
  assert.equal(languageFromName('trailing.'), null);
  assert.equal(languageFromName('x.unknownext'), null);
  assert.equal(languageFromTag('js'), 'javascript');
  assert.equal(languageFromTag('C++'), 'cpp');
  assert.equal(languageFromTag('Python3 title="x"'), 'python');
  assert.equal(languageFromTag(''), null);
  assert.equal(languageFromTag('klingon'), null);

  assert.equal(detectLanguage('html', 'x', ''), 'html');
  assert.equal(detectLanguage('markdown', 'x.py', ''), 'markdown');
  assert.equal(detectLanguage('text', 'x', 'def f(): pass'), 'plain');
  assert.equal(detectLanguage('code', 'calc.rs', ''), 'rust');
  assert.equal(
    detectLanguage('code', 'Untitled', '#!/usr/bin/env python3\nprint(1)'),
    'python',
  );
  assert.equal(detectLanguage('code', 'Untitled', '{"a": 1}'), 'json');
  assert.equal(detectLanguage('code', 'Untitled', '{ not json'), 'plain');
  assert.equal(
    detectLanguage('code', 'Untitled', 'import os\nprint(os.name)'),
    'python',
  );
  assert.equal(
    detectLanguage('code', 'Untitled', 'const a = 1;'),
    'javascript',
  );
  assert.equal(
    detectLanguage('code', 'Untitled', '<!DOCTYPE html><p>x'),
    'html',
  );
  assert.equal(detectLanguage('code', 'Untitled', 'SELECT * FROM t'), 'sql');
  assert.equal(detectLanguage('code', 'Untitled', 'just some words'), 'plain');
  assert.equal(languageName('csharp'), 'C#');
  assert.equal(languageName('plain'), 'Plain text');
});
