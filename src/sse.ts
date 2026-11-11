// A parser for server-sent events (SSE): the format streaming chat replies come
// in. Text arrives in arbitrary pieces (a piece can end in the middle of a line),
// so the parser keeps what it has not finished yet and returns complete events as
// they become available. Pure code, no network, so it is easy to test.
//
// The format (the parts we need):
//   - an event is one or more lines "data: ...", ended by a blank line
//   - lines starting with ":" are comments (keep-alives) and are ignored
//   - other fields ("event:", "id:", "retry:") are not used here and are ignored
//   - lines end with \n, \r\n or \r

export interface SseEvent {
  // The event's data. Several "data:" lines are joined with a newline.
  data: string;
}

export function createSseParser() {
  let buffer = '';
  let dataLines: string[] = [];

  const events: SseEvent[] = [];

  const handleLine = (line: string) => {
    if (line === '') {
      // A blank line ends the event.
      if (dataLines.length > 0) events.push({ data: dataLines.join('\n') });
      dataLines = [];
      return;
    }
    if (line.startsWith(':')) return; // Comment / keep-alive.
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  };

  const take = () => events.splice(0, events.length);

  return {
    // Feed the next piece of text; get back any events that are now complete.
    push(chunk: string): SseEvent[] {
      buffer += chunk;
      let start = 0;
      for (;;) {
        let end = start;
        while (
          end < buffer.length &&
          buffer[end] !== '\n' &&
          buffer[end] !== '\r'
        ) {
          end++;
        }
        if (end >= buffer.length) break; // No complete line yet.
        // A "\r" at the very end might be the first half of "\r\n": wait.
        if (buffer[end] === '\r' && end === buffer.length - 1) break;
        const line = buffer.slice(start, end);
        start =
          buffer[end] === '\r' && buffer[end + 1] === '\n' ? end + 2 : end + 1;
        handleLine(line);
      }
      buffer = buffer.slice(start);
      return take();
    },

    // The stream ended: treat anything left over as a final line and event.
    flush(): SseEvent[] {
      if (buffer !== '') handleLine(buffer.replace(/\r$/, ''));
      buffer = '';
      handleLine('');
      return take();
    },
  };
}
