// Things you do with the interface itself: the message box, the address bar.
import {
  ask,
  assert,
  newChat,
  openTab,
  sleep,
  waitFor,
} from '../lib/driver.mjs';

// The message box of the chat that is showing.
const BOX = `document.querySelector("[role=textbox][aria-label=Message]")`;

// Type into the message box the way a person does (the page sees an input event).
const typeInBox = (app, text) =>
  app.ev(`(() => {
    const box = ${BOX};
    box.focus();
    box.textContent = ${JSON.stringify(text)};
    box.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
const boxText = (app) => app.ev(`${BOX}?.textContent ?? null`);

export const journeys = [
  {
    name: 'interface: each chat keeps its own draft',
    async run({ app, site, model }) {
      await app.api('setViewMode', 'both');
      // (The chat bar shows over a page, not over a new-tab page.)
      const page = await openTab(app, site.ip('/about'));
      model.script([{ text: 'First chat answer.' }]);
      const a = await newChat(app);
      await ask(app, a, 'Hello from chat A');

      await waitFor(
        'the message box',
        async () => (await boxText(app)) !== null,
      );
      await typeInBox(app, 'unsent draft for A');
      assert.equal(await boxText(app), 'unsent draft for A');

      // A second chat starts with an empty box, and has its own draft.
      model.script([{ text: 'Second chat answer.' }]);
      const b = await newChat(app);
      await waitFor(
        'an empty box in the new chat',
        async () => (await boxText(app)) === '',
      );
      // (A chat nobody has written in is dropped when you leave it, so this one gets a message.)
      await ask(app, b, 'Hello from chat B');
      await waitFor(
        'the box of chat B',
        async () => (await boxText(app)) === '',
      );
      await typeInBox(app, 'unsent draft for B');

      await app.api('selectChat', a);
      await waitFor(
        'chat A and its draft',
        async () => (await boxText(app)) === 'unsent draft for A',
      );
      await app.api('selectChat', b);
      await waitFor(
        'chat B and its draft',
        async () => (await boxText(app)) === 'unsent draft for B',
      );
      // Clear what was typed so it cannot leak into later journeys.
      await typeInBox(app, '');
      await app.api('selectChat', a);
      await waitFor(
        'chat A again',
        async () => (await boxText(app)) === 'unsent draft for A',
      );
      await typeInBox(app, '');
      await app.api('removeTab', page.id);
    },
  },
  {
    name: 'interface: the address bar shows the page again when you leave it, press Escape, or choose another tab',
    async run({ app, site }) {
      await app.api('setViewMode', 'both');
      const first = await openTab(app, site.ip('/about'));
      const second = await openTab(app, site.ip('/price'));
      const ADDRESS = `document.querySelector('input[aria-label="Address or search"]')`;
      const typeAddress = (text) =>
        app.ev(`(() => {
          const input = ${ADDRESS};
          input.focus();
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(input, ${JSON.stringify(text)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
      const addressText = () => app.ev(`${ADDRESS}.value`);
      const key = (name) =>
        app.ev(
          `${ADDRESS}.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(name)}, bubbles: true }))`,
        );

      await waitFor('the address of the second page', async () =>
        (await addressText()).includes('/price'),
      );
      // Escape puts the page's address back.
      await typeAddress('something typed');
      assert.equal(await addressText(), 'something typed');
      // The first Escape closes the suggestions that appeared, the next puts the address back.
      await key('Escape');
      await sleep(200);
      await key('Escape');
      await waitFor('Escape to restore the address', async () =>
        (await addressText()).includes('/price'),
      );
      // Choosing another tab while the box still has the keyboard shows that tab's address.
      await typeAddress('typed again');
      await app.api('selectTab', first.id);
      await waitFor("the other tab's address", async () =>
        (await addressText()).includes('/about'),
      );
      // Leaving the box drops what was typed.
      await typeAddress('typed once more');
      await app.ev(`${ADDRESS}.blur()`);
      await waitFor('the address after leaving the box', async () =>
        (await addressText()).includes('/about'),
      );
      await sleep(100);
      for (const tab of [first, second]) await app.api('removeTab', tab.id);
    },
  },
];
