// Syntax highlighting: turn code into a list of coloured pieces. Pure and small on
// purpose (no library): it reads the text left to right with a few patterns per
// language. It is not a full parser, only good enough to colour comments, strings,
// numbers, keywords and names the way an editor would. One rule above all: the
// pieces always join back into exactly the text that was given, so highlighting can
// never change what you see or save.

export type TokenKind =
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'literal'
  | 'type'
  | 'function'
  | 'attr'
  | 'tag'
  | 'punct'
  | 'plain';

export interface Token {
  kind: TokenKind;
  text: string;
}

export type LanguageId =
  | 'plain'
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'xml'
  | 'css'
  | 'python'
  | 'shell'
  | 'powershell'
  | 'sql'
  | 'c'
  | 'cpp'
  | 'java'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'kotlin'
  | 'swift'
  | 'yaml'
  | 'toml'
  | 'markdown';

// Past this size the text is left uncoloured (colouring it on every key press would
// slow typing down).
export const MAX_HIGHLIGHT_CHARS = 200_000;

// ---- Language names -------------------------------------------------------------

const NAMES: Record<LanguageId, string> = {
  plain: 'Plain text',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  python: 'Python',
  shell: 'Shell',
  powershell: 'PowerShell',
  sql: 'SQL',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
  kotlin: 'Kotlin',
  swift: 'Swift',
  yaml: 'YAML',
  toml: 'TOML',
  markdown: 'Markdown',
};

export const languageName = (id: LanguageId): string => NAMES[id];

// File endings, and the names fenced code blocks use ("```py"), to languages.
const BY_EXTENSION: Record<string, LanguageId> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  vue: 'html',
  svelte: 'html',
  xml: 'xml',
  svg: 'xml',
  xsl: 'xml',
  plist: 'xml',
  css: 'css',
  scss: 'css',
  less: 'css',
  py: 'python',
  pyw: 'python',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  sql: 'sql',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  java: 'java',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'toml',
  cfg: 'toml',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'plain',
  log: 'plain',
  csv: 'plain',
  text: 'plain',
};

const BY_TAG: Record<string, LanguageId> = {
  javascript: 'javascript',
  node: 'javascript',
  typescript: 'typescript',
  python: 'python',
  python3: 'python',
  py3: 'python',
  shell: 'shell',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  console: 'shell',
  powershell: 'powershell',
  pwsh: 'powershell',
  'c++': 'cpp',
  'c#': 'csharp',
  csharp: 'csharp',
  golang: 'go',
  rust: 'rust',
  ruby: 'ruby',
  kotlin: 'kotlin',
  yaml: 'yaml',
  toml: 'toml',
  json: 'json',
  html: 'html',
  xml: 'xml',
  css: 'css',
  sql: 'sql',
  php: 'php',
  swift: 'swift',
  java: 'java',
  markdown: 'markdown',
  plaintext: 'plain',
  text: 'plain',
  ...BY_EXTENSION,
};

// The language a file name suggests ("calc.py" is Python), or null.
export function languageFromName(name: string): LanguageId | null {
  const base = name.trim().split(/[\\/]/).pop() ?? '';
  if (/^dockerfile$/i.test(base) || /^makefile$/i.test(base)) return 'shell';
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return null;
  return BY_EXTENSION[base.slice(dot + 1).toLowerCase()] ?? null;
}

// The language a code fence's label means ("```js"), or null.
export function languageFromTag(tag: string): LanguageId | null {
  const key = tag.trim().toLowerCase().split(/\s+/)[0] ?? '';
  return key === '' ? null : (BY_TAG[key] ?? null);
}

// The language of an artifact: HTML and Markdown are known from their kind; code
// from the ending of its name, then from what its first lines look like.
export function detectLanguage(
  kind: 'markdown' | 'text' | 'html' | 'code',
  title: string,
  content: string,
): LanguageId {
  if (kind === 'html') return 'html';
  if (kind === 'markdown') return 'markdown';
  const named = languageFromName(title);
  if (named !== null) return named;
  if (kind === 'text') return 'plain';
  const head = content.slice(0, 2000).trimStart();
  const first = head.split('\n', 1)[0] ?? '';
  if (/^#!.*\b(python|python3)\b/.test(first)) return 'python';
  if (/^#!.*\b(bash|sh|zsh)\b/.test(first)) return 'shell';
  if (/^#!.*\bnode\b/.test(first)) return 'javascript';
  if (head.startsWith('<?php')) return 'php';
  if (/^<!doctype html|^<html[\s>]/i.test(head)) return 'html';
  if (/^<\?xml|^<svg[\s>]/i.test(head)) return 'xml';
  if (/^[[{]/.test(head)) {
    try {
      JSON.parse(content);
      return 'json';
    } catch {
      // Not JSON; fall through.
    }
  }
  if (/^(def |class |import |from \w+ import |if __name__)/m.test(head)) {
    return 'python';
  }
  if (/^(const|let|var|function|import|export)\s/m.test(head)) {
    return 'javascript';
  }
  if (/^(select|insert|update|delete|create)\s/i.test(head)) return 'sql';
  if (/^(package main|func )/m.test(head)) return 'go';
  if (/^#include\s*[<"]/m.test(head)) return 'c';
  if (/^[\w.-]+:\s/m.test(head) && !/[{};]/.test(head)) return 'yaml';
  return 'plain';
}

// ---- Patterns -------------------------------------------------------------------

interface Rule {
  kind: TokenKind;
  re: RegExp; // always sticky
}
const rule = (kind: TokenKind, source: RegExp | string, flags = ''): Rule => ({
  kind,
  re: new RegExp(
    typeof source === 'string' ? source : source.source,
    `y${flags}`,
  ),
});

const BLOCK_COMMENT = rule('comment', /\/\*[\s\S]*?(?:\*\/|$)/);
const SLASH_COMMENT = rule('comment', /\/\/[^\n]*/);
const HASH_COMMENT = rule('comment', /#[^\n]*/);
const DQ = rule('string', /"(?:[^"\\\n]|\\.)*"?/);
const SQ = rule('string', /'(?:[^'\\\n]|\\.)*'?/);
const TEMPLATE = rule('string', /`(?:[^`\\]|\\[\s\S])*`?/);
const NUMBER = rule(
  'number',
  /0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[a-zA-Z]*|\.\d+(?:[eE][+-]?\d+)?/,
);
const PUNCT = rule('punct', /[{}()[\].,;:<>+\-*/%=!&|^~?@#\\]+/);

interface Family {
  rules: Rule[];
  // Words: matched as names, then told apart by these lists.
  keywords: Set<string>;
  literals: Set<string>;
  // A capitalised name is a type.
  capitalTypes: boolean;
  // Compare words without regard to letter case.
  ignoreCase: boolean;
}

const words = (text: string): Set<string> =>
  new Set(text.split(/\s+/).filter(Boolean));

const WORD = /[A-Za-z_$][\w$]*/y;

const JS_KEYWORDS = words(
  'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield as get set',
);
const TS_EXTRA = words(
  'interface type enum implements namespace declare readonly abstract public private protected keyof infer is satisfies override',
);
const LITERALS_JS = words('true false null undefined NaN Infinity');

function cStyle(
  keywords: string,
  literals: string,
  extra: Rule[] = [],
): Family {
  return {
    rules: [BLOCK_COMMENT, SLASH_COMMENT, ...extra, DQ, SQ, NUMBER, PUNCT],
    keywords: words(keywords),
    literals: words(literals),
    capitalTypes: true,
    ignoreCase: false,
  };
}

const FAMILIES: Record<LanguageId, Family> = {
  plain: {
    rules: [],
    keywords: words(''),
    literals: words(''),
    capitalTypes: false,
    ignoreCase: false,
  },
  javascript: {
    rules: [BLOCK_COMMENT, SLASH_COMMENT, TEMPLATE, DQ, SQ, NUMBER, PUNCT],
    keywords: JS_KEYWORDS,
    literals: LITERALS_JS,
    capitalTypes: true,
    ignoreCase: false,
  },
  typescript: {
    rules: [BLOCK_COMMENT, SLASH_COMMENT, TEMPLATE, DQ, SQ, NUMBER, PUNCT],
    keywords: new Set([...JS_KEYWORDS, ...TS_EXTRA]),
    literals: LITERALS_JS,
    capitalTypes: true,
    ignoreCase: false,
  },
  json: {
    rules: [rule('attr', /"(?:[^"\\\n]|\\.)*"(?=\s*:)/), DQ, NUMBER, PUNCT],
    keywords: words(''),
    literals: words('true false null'),
    capitalTypes: false,
    ignoreCase: false,
  },
  // html and xml are handled by their own function below; these are placeholders.
  html: {
    rules: [],
    keywords: words(''),
    literals: words(''),
    capitalTypes: false,
    ignoreCase: false,
  },
  xml: {
    rules: [],
    keywords: words(''),
    literals: words(''),
    capitalTypes: false,
    ignoreCase: false,
  },
  css: {
    rules: [
      BLOCK_COMMENT,
      DQ,
      SQ,
      rule('keyword', /@[\w-]+/),
      rule('number', /#[\da-fA-F]{3,8}\b/),
      rule('attr', /-?[a-zA-Z][\w-]*(?=\s*:\s*[^;{}]*[;}])/),
      rule('number', /-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/),
      rule('keyword', /!important/),
      PUNCT,
    ],
    keywords: words(''),
    literals: words(''),
    capitalTypes: false,
    ignoreCase: false,
  },
  python: {
    rules: [
      HASH_COMMENT,
      rule('string', /[rRbBuUfF]{0,2}("""|''')[\s\S]*?(?:\1|$)/),
      rule('string', /[rRbBuUfF]{1,2}(?=["'])/),
      DQ,
      SQ,
      rule('function', /@[\w.]+/),
      NUMBER,
      PUNCT,
    ],
    keywords: words(
      'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
    ),
    literals: words('True False None self cls'),
    capitalTypes: true,
    ignoreCase: false,
  },
  shell: {
    rules: [
      rule('comment', /(?<=^|\s)#[^\n]*/),
      DQ,
      SQ,
      rule('attr', /\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@#?$!*-])/),
      NUMBER,
      PUNCT,
    ],
    keywords: words(
      'if then else elif fi for while until do done case esac in function select return exit break continue local export readonly unset source alias echo cd set shift trap',
    ),
    literals: words('true false'),
    capitalTypes: false,
    ignoreCase: false,
  },
  powershell: {
    rules: [
      HASH_COMMENT,
      rule('comment', /<#[\s\S]*?(?:#>|$)/),
      DQ,
      SQ,
      rule('attr', /\$(?:\{[^}\n]*\}|[A-Za-z_][\w:]*|[?$^_])/),
      rule('keyword', /-[A-Za-z]+\b/),
      NUMBER,
      PUNCT,
    ],
    keywords: words(
      'begin break catch class continue data do dynamicparam else elseif end exit filter finally for foreach from function if in param process return switch throw trap try until using var while',
    ),
    literals: words('true false null'),
    capitalTypes: false,
    ignoreCase: true,
  },
  sql: {
    rules: [
      rule('comment', /--[^\n]*/),
      BLOCK_COMMENT,
      SQ,
      rule('string', /"[^"\n]*"?/),
      NUMBER,
      PUNCT,
    ],
    keywords: words(
      'select from where and or not in is like between join inner left right outer full cross on as group by order having limit offset insert into values update set delete create table drop alter add column index view primary key foreign references unique default distinct union all exists case when then else end with begin commit rollback grant revoke asc desc count sum avg min max',
    ),
    literals: words('null true false'),
    capitalTypes: false,
    ignoreCase: true,
  },
  c: cStyle(
    'auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while',
    'NULL true false',
    [rule('keyword', /#\s*[a-z]+/)],
  ),
  cpp: cStyle(
    'alignas alignof auto break case catch class const constexpr continue decltype default delete do else enum explicit export extern for friend goto if inline mutable namespace new noexcept operator private protected public register return sizeof static struct switch template this throw try typedef typeid typename union using virtual volatile while override final',
    'nullptr NULL true false',
    [rule('keyword', /#\s*[a-z]+/)],
  ),
  java: cStyle(
    'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits',
    'true false null',
  ),
  csharp: cStyle(
    'abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual volatile while async await var record init get set',
    'true false null',
  ),
  go: cStyle(
    'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    'true false nil iota',
    [rule('string', /`[^`]*`?/)],
  ),
  rust: cStyle(
    'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
    'true false None Some Ok Err',
    [rule('string', /r#*"[\s\S]*?(?:"#*|$)/)],
  ),
  php: {
    rules: [
      BLOCK_COMMENT,
      SLASH_COMMENT,
      HASH_COMMENT,
      DQ,
      SQ,
      rule('attr', /\$[A-Za-z_]\w*/),
      NUMBER,
      PUNCT,
    ],
    keywords: words(
      'abstract and as break case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include include_once instanceof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while xor yield',
    ),
    literals: words('true false null TRUE FALSE NULL'),
    capitalTypes: true,
    ignoreCase: false,
  },
  ruby: {
    rules: [
      HASH_COMMENT,
      DQ,
      SQ,
      rule('literal', /:[A-Za-z_]\w*[?!]?/),
      rule('attr', /@{1,2}[A-Za-z_]\w*/),
      NUMBER,
      PUNCT,
    ],
    keywords: words(
      'alias and begin break case class def defined do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield require require_relative puts attr_accessor',
    ),
    literals: words('true false nil'),
    capitalTypes: true,
    ignoreCase: false,
  },
  kotlin: cStyle(
    'abstract annotation as break by catch class companion const constructor continue crossinline data do else enum external final finally for fun get if import in infix init inline inner interface internal is lateinit noinline object open operator out override package private protected public reified return sealed set super suspend this throw try typealias val var vararg when where while',
    'true false null',
  ),
  swift: cStyle(
    'actor as associatedtype async await break case catch class continue default defer deinit do else enum extension fallthrough fileprivate final for func guard if import in indirect init inout internal is let mutating nonmutating open operator override private protocol public repeat rethrows return self Self static struct subscript super switch throw throws try typealias var weak where while',
    'true false nil',
  ),
  yaml: {
    rules: [
      HASH_COMMENT,
      DQ,
      SQ,
      rule('attr', /(?<=(?:^|\n)[ \t-]*)[\w./-]+(?=[ \t]*:(?:\s|$))/),
      NUMBER,
      PUNCT,
    ],
    keywords: words(''),
    literals: words('true false null yes no on off'),
    capitalTypes: false,
    ignoreCase: true,
  },
  toml: {
    rules: [
      HASH_COMMENT,
      rule('comment', /;[^\n]*/),
      rule('keyword', /(?<=^|\n)[ \t]*\[[^\]\n]*\]/),
      DQ,
      SQ,
      rule('attr', /(?<=^|\n)[ \t]*[\w.-]+(?=[ \t]*=)/),
      NUMBER,
      PUNCT,
    ],
    keywords: words(''),
    literals: words('true false'),
    capitalTypes: false,
    ignoreCase: false,
  },
  markdown: {
    rules: [
      rule(
        'string',
        /(?<=^|\n)(```|~~~)[^\n]*(?:\n[\s\S]*?(?:\n\1[^\n]*|$)|$)/,
      ),
      rule('keyword', /(?<=^|\n)#{1,6}[ \t][^\n]*/),
      rule('string', /`[^`\n]+`/),
      rule('type', /\*\*[^*\n]+\*\*|__[^_\n]+__/),
      rule('function', /\[[^\]\n]*\]\([^)\n]*\)/),
      rule('comment', /(?<=^|\n)>[^\n]*/),
      rule('punct', /(?<=^|\n)[ \t]*(?:[-*+]|\d+\.)(?=[ \t])/),
    ],
    keywords: words(''),
    literals: words(''),
    capitalTypes: false,
    ignoreCase: false,
  },
};

// ---- The scanner ------------------------------------------------------------------

// Add a piece, joining it to the one before when they are the same kind.
function push(out: Token[], kind: TokenKind, text: string): void {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.text += text;
  else out.push({ kind, text });
}

function scan(family: Family, code: string, out: Token[]): void {
  let i = 0;
  while (i < code.length) {
    let matched = false;
    for (const r of family.rules) {
      r.re.lastIndex = i;
      const m = r.re.exec(code);
      if (m && m[0].length > 0) {
        push(out, r.kind, m[0]);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    WORD.lastIndex = i;
    const w = WORD.exec(code);
    if (w) {
      const word = w[0];
      const key = family.ignoreCase ? word.toLowerCase() : word;
      let kind: TokenKind = 'plain';
      if (family.keywords.has(key)) kind = 'keyword';
      else if (family.literals.has(key)) kind = 'literal';
      else if (code[i + word.length] === '(') kind = 'function';
      else if (family.capitalTypes && /^[A-Z][A-Za-z0-9_$]*[a-z]/.test(word))
        kind = 'type';
      push(out, kind, word);
      i += word.length;
      continue;
    }
    // Anything else (spaces, other letters, symbols): one piece of plain text.
    push(out, 'plain', code[i]);
    i += 1;
  }
}

// HTML and XML: tags, attributes and their values, comments, and the code inside
// <script> and <style>.
function scanMarkup(code: string, out: Token[]): void {
  let i = 0;
  while (i < code.length) {
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i + 4);
      const stop = end < 0 ? code.length : end + 3;
      push(out, 'comment', code.slice(i, stop));
      i = stop;
      continue;
    }
    if (code.startsWith('<!', i) || code.startsWith('<?', i)) {
      const end = code.indexOf('>', i);
      const stop = end < 0 ? code.length : end + 1;
      push(out, 'keyword', code.slice(i, stop));
      i = stop;
      continue;
    }
    const open = /<\/?([A-Za-z][\w:-]*)/y;
    open.lastIndex = i;
    const tag = code[i] === '<' ? open.exec(code) : null;
    if (!tag) {
      const next = code.indexOf('<', i + 1);
      const stop = next < 0 ? code.length : next;
      push(out, 'plain', code.slice(i, stop));
      i = stop;
      continue;
    }
    const closing = tag[0].startsWith('</');
    push(out, 'punct', closing ? '</' : '<');
    push(out, 'tag', tag[1]);
    i += tag[0].length;
    // Attributes, up to the end of the tag.
    while (i < code.length && code[i] !== '>') {
      if (code.startsWith('/>', i)) break;
      const rest = code.slice(i);
      const space = /^\s+/.exec(rest);
      if (space) {
        push(out, 'plain', space[0]);
        i += space[0].length;
        continue;
      }
      const name = /^[^\s=>/"']+/.exec(rest);
      if (name) {
        push(out, 'attr', name[0]);
        i += name[0].length;
        continue;
      }
      const eq = /^=\s*/.exec(rest);
      if (eq) {
        push(out, 'punct', eq[0]);
        i += eq[0].length;
        const value = /^(?:"[^"]*"?|'[^']*'?|[^\s>]+)/.exec(code.slice(i));
        if (value) {
          push(out, 'string', value[0]);
          i += value[0].length;
        }
        continue;
      }
      push(out, 'plain', code[i]);
      i += 1;
    }
    const end = code.startsWith('/>', i) ? '/>' : code[i] === '>' ? '>' : '';
    push(out, 'punct', end);
    i += end.length;
    // What is inside <script> and <style> is code of its own.
    const name = tag[1].toLowerCase();
    if (!closing && end === '>' && (name === 'script' || name === 'style')) {
      const close = new RegExp(`</${name}`, 'i');
      const found = close.exec(code.slice(i));
      const stop = found ? i + found.index : code.length;
      const inner = code.slice(i, stop);
      scan(FAMILIES[name === 'script' ? 'javascript' : 'css'], inner, out);
      i = stop;
    }
  }
}

// The coloured pieces of `code` in `language`. They always join back into `code`.
export function highlight(language: LanguageId, code: string): Token[] {
  if (code === '') return [];
  if (language === 'plain' || code.length > MAX_HIGHLIGHT_CHARS) {
    return [{ kind: 'plain', text: code }];
  }
  const out: Token[] = [];
  if (language === 'html' || language === 'xml') scanMarkup(code, out);
  else scan(FAMILIES[language], code, out);
  return out;
}
