// The things a person does, as small functions the journeys share.
import assert from 'node:assert/strict';
import { sleep, waitFor } from './app.mjs';

export { assert, sleep, waitFor };

export const tabsOf = async (app) => (await app.state()).tabs;
export const liveTabs = async (app) =>
  (await tabsOf(app)).filter((t) => !t.closed);

// Open a new tab (in a Space, or none) and load an address in it. Returns the tab.
export async function openTab(app, url, spaceId = null) {
  const before = new Set((await tabsOf(app)).map((t) => t.id));
  await app.api('newTab', spaceId);
  const tab = await waitFor('the new tab', async () => {
    const s = await app.state();
    const active = s.active;
    return active?.kind === 'tab' && !before.has(active.id)
      ? s.tabs.find((t) => t.id === active.id)
      : null;
  });
  await app.api('navigate', url);
  return waitFor(
    `the page ${url}`,
    async () => {
      const t = (await tabsOf(app)).find((x) => x.id === tab.id);
      return t && t.url.startsWith(url) && !t.loading && t.title ? t : null;
    },
    { timeout: 20000 },
  );
}

// A new Space with a name. Returns it.
export async function makeSpace(app, name) {
  const before = new Set((await app.state()).spaces.map((s) => s.id));
  await app.api('newSpace');
  const made = await waitFor('the new Space', async () =>
    (await app.state()).spaces.find((s) => !before.has(s.id)),
  );
  await app.api('renameSpace', made.id, name);
  await waitFor('the Space name', async () =>
    (await app.state()).spaces.find((s) => s.id === made.id && s.name === name),
  );
  return made;
}

// ---- the assistant ------------------------------------------------------------------------

// A new chat, with the given tabs linked to it. Returns its id. (Asking for a new chat while the
// current one is still empty gives that same chat, so any old links on it are removed first.)
export async function newChat(app, { tabs = [] } = {}) {
  await app.api('newChat');
  await sleep(400);
  const state = await app.state();
  const id = state.chats.activeId;
  assert.ok(id, 'no chat is open');
  for (const ref of state.chats.refs ?? []) {
    await app.api('chatUnlink', id, ref.kind, ref.id);
  }
  for (const tab of tabs) {
    await app.api('chatLink', id, 'tab', tab.id);
    await sleep(200);
  }
  return id;
}

export const messagesOf = (app, chatId) => app.api('chatMessages', chatId);

// Send a message and wait for the reply to finish. `decide(part)` answers each approval card
// ('allow', 'allow-rest' or 'deny'; default 'deny', so a test never allows anything by accident).
// Returns { reply, cards } where cards lists every card that waited.
export async function ask(
  app,
  chatId,
  text,
  { decide = () => 'deny', timeout = 30000 } = {},
) {
  const sent = await app.api('chatSend', chatId, text, []);
  assert.ok(sent?.ok, `could not send: ${JSON.stringify(sent)}`);
  return settle(app, chatId, { decide, timeout });
}

// Try again after a failed reply (the Retry button), and wait for the new reply to finish.
export async function retry(
  app,
  chatId,
  { decide = () => 'deny', timeout = 30000 } = {},
) {
  const sent = await app.api('chatRetry', chatId);
  assert.ok(sent?.ok, `could not retry: ${JSON.stringify(sent)}`);
  return settle(app, chatId, { decide, timeout });
}

// Answer the cards that wait, and wait for the newest reply to finish.
async function settle(app, chatId, { decide, timeout }) {
  const cards = [];
  const answered = new Set();
  const reply = await waitFor(
    'the reply to finish',
    async () => {
      const messages = await messagesOf(app, chatId);
      const last = [...messages].reverse().find((m) => m.role === 'assistant');
      if (!last) return null;
      for (const part of last.parts) {
        if (part.type === 'tool' && part.status === 'waiting') {
          const key = `${last.id}:${part.id}`;
          if (!answered.has(key)) {
            answered.add(key);
            const decision = decide(part);
            cards.push({
              name: part.name,
              ask: part.ask,
              risky: part.risky,
              card: part.card,
              decision,
            });
            await app.api('chatDecide', chatId, last.id, part.id, decision);
          }
        }
      }
      const s = await app.state();
      const generating = s.chats.conversations.find(
        (c) => c.id === chatId,
      )?.generating;
      return !generating &&
        last.status !== 'streaming' &&
        last.status !== 'waiting'
        ? last
        : null;
    },
    { timeout, every: 250 },
  );
  return { reply, cards };
}

// The tool steps of a reply, by name.
export const toolParts = (reply, name) =>
  reply.parts.filter(
    (p) => p.type === 'tool' && (name === undefined || p.name === name),
  );
export const textOf = (reply) =>
  reply.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n') ||
  reply.content ||
  '';
