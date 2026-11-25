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
  {
    name: 'assistant: a document call cut off by the length limit is not run, and the model is told how to build it in parts',
    async run({ app, model }) {
      const chat = await newChat(app);
      model.script([
        {
          // The reply ran out of room while the document was being written.
          tools: [
            {
              name: 'create_artifact',
              args: '{"title": "Long notes", "kind": "markdown", "content": "# Part one. Some text that never ends',
            },
          ],
          finish: 'length',
        },
        // The model starts again with a shorter first part, as it was told.
        {
          tools: [
            {
              name: 'create_artifact',
              args: {
                title: 'Long notes',
                kind: 'markdown',
                content: '# Part one\n\n(more to come)',
              },
            },
          ],
        },
        { text: 'Made the first part.' },
      ]);
      const { reply, cards } = await ask(app, chat, 'Write long notes', {
        decide: () => 'allow',
      });
      // The cut-off call was refused with no card; only the good call asked.
      assert.equal(cards.length, 1);
      const parts = toolParts(reply, 'create_artifact');
      assert.equal(parts.length, 2);
      assert.equal(parts[0].status, 'error');
      assert.equal(parts[0].blocked, true);
      assert.equal(parts[1].status, 'ok');
      // What the model was told after the cut-off call.
      const told = model.requests[1].messages.filter((m) => m.role === 'tool');
      assert.match(String(told[0].content), /cut off before it ended/);
      assert.match(String(told[0].content), /edit_artifact/);
      // Nothing half-written was saved: one artifact, whole.
      const made = (await app.state()).artifacts.filter(
        (a) => a.title === 'Long notes',
      );
      assert.equal(made.length, 1);
      assert.equal(model.unscripted, 0);
      await app.api('artifactDelete', made[0].id);
    },
  },
];
