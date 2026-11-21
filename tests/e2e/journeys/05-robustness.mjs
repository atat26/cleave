// When a page of the app, or a tab, crashes.
import { assert, openTab, sleep, waitFor } from '../lib/driver.mjs';

const rootChildren = (app, part) =>
  app
    .pageEv(part, 'document.getElementById("root").children.length')
    .catch(() => 0);

export const journeys = [
  {
    name: 'robustness: a crashed sidebar page is loaded again',
    async run({ app }) {
      await waitFor(
        'the sidebar to draw',
        async () => (await rootChildren(app, '/#sidebar')) > 0,
        {
          timeout: 30000,
        },
      );
      // Kill the sidebar's page process the way the system or the task manager could.
      await app.pageSend('/#sidebar', 'Page.crash').catch(() => undefined);
      app.dropConnections();
      await sleep(1500);
      // It is loaded again by the app, and draws again.
      await waitFor(
        'the sidebar to be back',
        async () => {
          app.dropConnections();
          return (await rootChildren(app, '/#sidebar')) > 0;
        },
        { timeout: 30000, every: 1000 },
      );
      // And the app still answers.
      const state = await app.state();
      assert.ok(Array.isArray(state.tabs));
    },
  },
  {
    name: 'robustness: a crashed tab shows the "this page stopped" page, and can be reloaded',
    async run({ app, site }) {
      const tab = await openTab(app, site.ip('/about'));
      await app
        .pageSend(site.ip('/about'), 'Page.crash')
        .catch(() => undefined);
      app.dropConnections();
      // A page of ours takes its place (an inline page, not the site).
      await waitFor(
        'the crash page',
        async () =>
          (await app.targets()).some(
            (t) => t.type === 'page' && t.url.startsWith('data:text/html'),
          ),
        { timeout: 20000, every: 500 },
      );
      // The tab still knows where it was, so Reload brings it back.
      const state = await app.state();
      assert.ok(
        state.tabs.find((t) => t.id === tab.id)?.url.includes('/about'),
      );
      await app.api('removeTab', tab.id);
    },
  },
];
