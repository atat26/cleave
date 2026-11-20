// Serves the fixture pages on the owner's own machine (127.0.0.1 only):
//   node tests/pipeline/serve.mjs
import http from 'node:http';
import { PAGES, PORT } from './fixtures.mjs';

const server = http.createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const make = PAGES[path];
  if (!make) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(make());
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `Fixture pages on http://127.0.0.1:${PORT}/ (${Object.keys(PAGES).length} pages)`,
  );
});
