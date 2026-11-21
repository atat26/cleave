// When a reply goes wrong partway, or its chat is changed while it runs.
import {
  ask,
  assert,
  newChat,
  openTab,
  retry,
  textOf,
  toolParts,
} from '../lib/driver.mjs';

const systemText = (request) =>
  String(request.messages.find((m) => m.role === 'system')?.content ?? '');

export const journeys = [
  {
    name: 'assistant: a reply that fails after doing something is not forgotten, so Retry does not do it again',
    async run({ app, site, model }) {
      const tab = await openTab(app, site.ip('/form'));
      const chat = await newChat(app, { tabs: [tab] });
      model.script([
        { tools: [{ name: 'press_key', args: { tab: tab.id, key: 'Tab' } }] },
        { status: 429 }, // the model fails after the key was pressed
      ]);
      const first = await ask(app, chat, 'Press Tab', {
        decide: () => 'allow',
      });
      assert.equal(first.cards.length, 1);
      assert.equal(first.reply.status, 'error');
      assert.equal(toolParts(first.reply, 'press_key')[0].status, 'ok');

      // Retry: the failed reply is removed, but the model is told the key was already pressed.
      model.script([{ text: 'Already done, nothing more to do.' }]);
      const again = await retry(app, chat, { decide: () => 'deny' });
      assert.equal(again.cards.length, 0, 'it should not press the key again');
      assert.equal(textOf(again.reply), 'Already done, nothing more to do.');
      const sent = systemText(model.requests.at(-1));
      assert.match(sent, /What you already did/);
      assert.match(sent, /- Done: .*Tab/);
      await app.api('removeTab', tab.id);
    },
  },
];
