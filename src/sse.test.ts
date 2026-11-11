import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSseParser } from './sse.ts';

const datas = (events: { data: string }[]) => events.map((e) => e.data);

test('a complete event comes out once its blank line arrives', () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push('data: hello\n'), []); // not finished yet
  assert.deepEqual(datas(parser.push('\n')), ['hello']);
});

test('events split at any point still come out whole', () => {
  const text = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n';
  // Cut the text at every possible position: the result must always be the same.
  for (let cut = 0; cut <= text.length; cut++) {
    const parser = createSseParser();
    const got = [
      ...parser.push(text.slice(0, cut)),
      ...parser.push(text.slice(cut)),
    ];
    assert.deepEqual(
      datas(got),
      ['{"a":1}', '{"b":2}', '[DONE]'],
      `cut at ${cut}`,
    );
  }
});

test('Windows (\\r\\n) and old Mac (\\r) line endings work, even split in half', () => {
  const crlf = 'data: one\r\n\r\ndata: two\r\n\r\n';
  const parser = createSseParser();
  assert.deepEqual(datas([...parser.push(crlf)]), ['one', 'two']);

  // A "\r" at the end of a piece followed by "\n" in the next is ONE line break.
  const split = createSseParser();
  assert.deepEqual(split.push('data: x\r'), []);
  assert.deepEqual(split.push('\n'), []); // the line ended; the event is not done
  assert.deepEqual(datas(split.push('\r\n')), ['x']);

  // A lone "\r" at the very end is held back (a "\n" might follow), so the last
  // event comes out when the stream ends.
  const cr = createSseParser();
  assert.deepEqual(datas(cr.push('data: y\r\rdata: z\r\r')), ['y']);
  assert.deepEqual(datas(cr.flush()), ['z']);
});

test('comment lines (keep-alives) are ignored', () => {
  const parser = createSseParser();
  const got = parser.push(
    ': OPENROUTER PROCESSING\n\n: another\ndata: real\n\n: trailing comment\n\n',
  );
  assert.deepEqual(datas(got), ['real']);
});

test('several data lines join with a newline; other fields are ignored', () => {
  const parser = createSseParser();
  const got = parser.push(
    'event: message\nid: 7\nretry: 100\ndata: a\ndata: b\n\n',
  );
  assert.deepEqual(datas(got), ['a\nb']);
});

test('only one leading space after the colon is removed', () => {
  const parser = createSseParser();
  assert.deepEqual(datas(parser.push('data:  two spaces\n\ndata:none\n\n')), [
    ' two spaces',
    'none',
  ]);
});

test('blank lines with no data produce nothing', () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push('\n\n\n'), []);
});

test('flush gives back an unfinished last event, and nothing if there is none', () => {
  const parser = createSseParser();
  parser.push('data: partial');
  assert.deepEqual(datas(parser.flush()), ['partial']);
  assert.deepEqual(createSseParser().flush(), []);
  const tidy = createSseParser();
  tidy.push('data: done\n\n');
  assert.deepEqual(tidy.flush(), []);
});

test('garbage never throws', () => {
  const parser = createSseParser();
  for (const junk of [
    '\u0000\u0001',
    'no colon at all\n',
    ':\n',
    'data\n\n',
    '\n:\n\n',
  ]) {
    assert.doesNotThrow(() => parser.push(junk));
  }
});
