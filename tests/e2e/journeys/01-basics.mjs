// The app starts, and the things around it work: tabs, Spaces, settings.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/app.mjs';
import {
  assert,
  liveTabs,
  makeSpace,
  openTab,
  sleep,
  tabsOf,
  waitFor,
} from '../lib/driver.mjs';

const version = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).version;

export const journeys = [
  {
    name: 'start-up: the window is there, on its own data, with the fake key saved',
    async run({ app }) {
      // The app's screens are several views; the sidebar is the main one.
      await waitFor(
        'the sidebar to draw',
        async () =>
          (await app.pageEv(
            'localhost:5173/#sidebar',
            'document.getElementById("root").children.length',
          )) > 0,
        { timeout: 20000 },
      );
      assert.equal(await app.ev('document.title'), 'Cleave');
      const info = await app.api('appInfo');
      assert.equal(info.version, version);
      assert.equal(info.installed, false);
      const status = await app.api('llmStatus');
      assert.equal(status.hasKey, true);
    },
  },
  {
    name: 'tabs: open pages, close one (gone) and one in a Space (kept as a link, then reopened)',
    async run({ app, site }) {
      const home = await openTab(app, site.ip('/'));
      assert.equal(home.title, 'E2E Home');
      const about = await openTab(app, site.ip('/about'));
      assert.equal(about.title, 'E2E About');
      assert.equal((await app.state()).active.id, about.id);
      await app.api('selectTab', home.id);
      await waitFor(
        'the first tab to be selected',
        async () => (await app.state()).active.id === home.id,
      );

      // Outside a Space, closing a tab removes it.
      await app.api('closeTab', about.id);
      await waitFor(
        'the tab to go',
        async () => !(await tabsOf(app)).some((t) => t.id === about.id),
      );

      // In a Space, a closed page stays there as a link, and reopens.
      const space = await makeSpace(app, 'E2E Reading');
      const kept = await openTab(app, site.ip('/price'), space.id);
      await app.api('closeTab', kept.id);
      await waitFor(
        'the tab to show as closed',
        async () =>
          (await tabsOf(app)).find((t) => t.id === kept.id)?.closed === true,
      );
      await app.api('reopenTab', kept.id);
      const back = await waitFor('the tab to come back', async () =>
        (await liveTabs(app)).find((t) => t.id === kept.id),
      );
      assert.ok(back.url.includes('/price'));
      await app.api('removeTab', kept.id);
      await app.api('removeTab', home.id);
    },
  },
  {
    name: 'spaces: make one, rename it, put a tab in it, move a tab between Spaces',
    async run({ app, site }) {
      const work = await makeSpace(app, 'E2E Work');
      const play = await makeSpace(app, 'E2E Play');
      const tab = await openTab(app, site.ip('/price'), work.id);
      assert.equal(
        (await tabsOf(app)).find((t) => t.id === tab.id).spaceId,
        work.id,
      );
      await app.api('moveTab', tab.id, play.id, null);
      await waitFor(
        'the tab to move',
        async () =>
          (await tabsOf(app)).find((t) => t.id === tab.id)?.spaceId === play.id,
      );
      await app.api('setSpaceCollapsed', play.id, true);
      await app.api('removeTab', tab.id);
    },
  },
  {
    name: 'settings: theme, tool levels and site trust are saved',
    async run({ app }) {
      const theme = await app.api('themeGet');
      await app.api('themeSet', theme === 'dark' ? 'light' : 'dark');
      assert.notEqual(await app.api('themeGet'), theme);
      await app.api('themeSet', theme);

      await app.api('toolsSetLevel', 'go_to', 'never');
      const tools = await app.api('toolsList');
      const goTo = (tools.tools ?? tools).find((t) => t.name === 'go_to');
      assert.equal(goTo.level, 'never');
      await app.api('toolsReset');

      await app.api('siteTrustSet', 'e2e.example', 'trusted');
      const sites = await app.api('siteTrustList');
      assert.ok(JSON.stringify(sites).includes('e2e.example'));
      await app.api('siteTrustSet', 'e2e.example', 'unknown');
    },
  },
];
