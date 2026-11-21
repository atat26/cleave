# End-to-end tests

These start the real Cleave app on a **throwaway data folder** and use it the way a person does. They
never touch your own data, use no network and no real model.

```powershell
npm.cmd run test:e2e                   # every journey (about a minute)
npm.cmd run test:e2e -- --only assistant   # journeys whose name contains "assistant"
npm.cmd run test:e2e -- --list
npm.cmd run test:e2e -- --verbose      # timings and the line a journey failed on
npm.cmd run test:e2e -- --keep         # keep the throwaway data folder to look at it
```

Close the Cleave development copy (`npm start`) first: both use the same dev server port.

## How it works

- **The app** is the development copy (`npm start`) with `--user-data-dir=<new folder>`. It has to be
  the development copy: only that copy accepts the `AIB_` settings (the installed app ignores them on
  purpose). The run stops at once if the app is not using the throwaway folder.
- **A fake web site** (`lib/site.mjs`) answers on `127.0.0.1` and `localhost`, which Cleave treats as two
  different sites.
- **A fake model** (`lib/fakeModel.mjs`) stands in for OpenRouter. The app is started with
  `AIB_API_BASE` pointing at it (only an address on this computer is accepted, and only the
  development copy reads it). A test writes the "script" of what the model says and which tools it asks
  for, then checks what the app did: the cards it showed, what it refused, what it sent next.
  That is how the assistant's safety rules are tested without a real model: a page that gives orders, a
  model that obeys it, and a check that the app still asks.
- **Journeys** are in `journeys/` (file names start with a number; `99-restart` runs last because it
  quits and restarts the app). Each is `{ name, run(ctx) }` and fails by throwing.

## Adding a journey

1. Add `{ name, async run({ app, site, model }) { ... } }` to a file in `journeys/`.
2. Drive the app with `app.api('name', ...args)` (the same functions the screens use, from
   `src/preload.ts`) and read it with `app.state()`.
3. For the assistant: `model.script([...])`, then `ask(app, chat, 'text', { decide })` from
   `lib/driver.mjs`. Cards are denied unless `decide` says otherwise.
4. Check that it can fail: break the thing it tests and see the journey go red.

What this does not cover: how good a real model is (that is `tests/pipeline`, which runs real free
models), native dialogs (the backup folder pickers), and how things look.
