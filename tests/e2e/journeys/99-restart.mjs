// Last on purpose: it quits the app and starts it again on the same data, to see what is kept.
import {
  ask,
  assert,
  makeSpace,
  messagesOf,
  newChat,
  openTab,
  textOf,
  waitFor,
} from '../lib/driver.mjs';

export const journeys = [
  {
    name: 'restart: Spaces, tabs, a chat, site trust, theme, the key and the model are all still there',
    async run(ctx) {
      const { app, site, model } = ctx;
      const space = await makeSpace(app, 'E2E Persist');
      await openTab(app, site.ip('/price'), space.id);
      model.script([{ text: 'Remember this answer.' }]);
      const chat = await newChat(app);
      await ask(app, chat, 'A question that should be kept');
      await app.api('siteTrustSet', 'keep.example', 'trusted');
      const theme = await app.api('themeGet');
      const other = theme === 'dark' ? 'light' : 'dark';
      await app.api('themeSet', other);

      const after = await ctx.restart();

      const state = await after.state();
      const kept = state.spaces.find((s) => s.name === 'E2E Persist');
      assert.ok(kept, 'the Space is gone');
      assert.ok(
        state.tabs.some(
          (t) => t.spaceId === kept.id && t.url.includes('/price'),
        ),
        'the tab in the Space is gone',
      );
      const messages = await waitFor('the chat to load', async () => {
        const m = await messagesOf(after, chat);
        return m.length > 0 ? m : null;
      });
      assert.ok(
        messages.some(
          (m) => m.role === 'user' && m.content.includes('should be kept'),
        ),
      );
      assert.ok(
        textOf(messages.filter((m) => m.role === 'assistant').at(-1)).includes(
          'Remember this answer.',
        ),
      );
      assert.ok(
        JSON.stringify(await after.api('siteTrustList')).includes(
          'keep.example',
        ),
      );
      assert.equal(await after.api('themeGet'), other);
      const status = await after.api('llmStatus');
      assert.equal(status.hasKey, true, JSON.stringify(status));
      assert.ok(JSON.stringify(status).includes('fake/e2e-model'));
    },
  },
];
