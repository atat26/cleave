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

// The conversation box of the chat that is showing: where it is scrolled to, and how tall it is.
const LIST = `document.querySelector(".chat-messages")`;
const scrollInfo = (app) =>
  app.ev(`(() => {
    const el = ${LIST};
    return el ? { top: Math.round(el.scrollTop), max: el.scrollHeight - el.clientHeight } : null;
  })()`);
const setScrollTop = (app, top) =>
  app.ev(`(() => { const el = ${LIST}; el.scrollTop = ${top}; })()`);

export const journeys = [
  {
    name: 'interface: shrinking the chat and opening it again keeps where you were reading (#138)',
    async run({ app, site, model }) {
      await app.api('setViewMode', 'both');
      const page = await openTab(app, site.ip('/about'));
      const lines = Array.from(
        { length: 60 },
        (_, i) => `Paragraph ${i + 1} of a long answer.`,
      ).join('\n\n');
      model.script([{ text: lines }]);
      const chat = await newChat(app);
      await ask(app, chat, 'Write a long answer');
      // Show the chat on its own (the whole window), where the list is drawn and long.
      const open = async () => {
        await app.api('setViewMode', 'chat');
        return waitFor('a long conversation', async () => {
          const info = await scrollInfo(app);
          return info && info.max > 600 ? info : null;
        });
      };
      // Back to the page with the slim chat bar: the list is taken away.
      const shrink = async () => {
        await app.api('setViewMode', 'both');
        await waitFor(
          'the list to go',
          async () => (await scrollInfo(app)) === null,
        );
      };
      const long = await open();
      // A chat opens at the bottom.
      assert.ok(
        Math.abs(long.top - long.max) < 5,
        'it should start at the bottom',
      );

      // Scroll up to read something, then shrink the chat and open it again.
      const place = Math.round(long.max / 3);
      await setScrollTop(app, place);
      await sleep(300);
      await shrink();
      const back = await open();
      assert.ok(
        Math.abs(back.top - place) < 5,
        'it should be where you left it (' + place + '), not at ' + back.top,
      );

      // Scrolled to the bottom, it opens at the bottom again.
      await setScrollTop(app, back.max);
      await sleep(300);
      await shrink();
      const bottom = await open();
      assert.ok(
        Math.abs(bottom.top - bottom.max) < 5,
        'it should be at the bottom',
      );
      await app.api('setViewMode', 'both');
      await app.api('removeTab', page.id);
    },
  },
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
