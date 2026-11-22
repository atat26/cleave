// Last on purpose: it quits the app and starts it again on the same data, to see what is kept.
import {
  ask,
  assert,
  makeSpace,
  messagesOf,
  newChat,
  openTab,
  sleep,
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

// Text typed into a document in the last moment before closing must not be lost (the editor saves
// half a second after you stop typing; closing used to beat it).
journeys.push({
  name: 'restart: typing in a document right before closing is kept',
  async run(ctx) {
    const { app } = ctx;
    const id = await app.api('artifactCreate', 'text', 'E2E typing', null);
    assert.ok(id, 'the document was not made');
    // (A chat-only window has no room for the editor.)
    await app.api('setViewMode', 'both');
    await app.api('artifactOpen', id);
    // Wait for the editor to load, then type the way the page sees it (a new value and an input event).
    await waitFor(
      'the editor',
      async () =>
        app.ev(
          `document.querySelector("textarea[aria-label^='Edit ']") !== null`,
        ),
      { timeout: 45000, every: 500 },
    ).catch(async (error) => {
      const seen = await app
        .ev(
          `JSON.stringify({ root: document.getElementById('root').children.length, text: document.body.innerText.slice(0, 120), textareas: document.querySelectorAll('textarea').length })`,
        )
        .catch((e) => String(e));
      const state = await app.state().catch(() => null);
      throw new Error(
        `${error.message}. The page: ${seen}. Active: ${JSON.stringify(state?.active)}, view: ${state?.viewMode}, tabs: ${JSON.stringify(state?.artifactTabs)}`,
      );
    });
    await sleep(500);
    const closeNow = await app.prepareClose();
    await app.ev(`(() => {
      const box = document.querySelector("textarea[aria-label^='Edit ']");
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      set.call(box, 'typed just before closing');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    // Close the window in the same moment (the editor waits half a second before saving).
    closeNow();
    const after = await ctx.restart();
    const doc = await after.api('artifactRead', id);
    assert.equal(doc.content, 'typed just before closing');
  },
});
