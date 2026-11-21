// End-to-end tests: starts the real app on a throwaway data folder, with a fake web site and a fake
// model on this computer, and runs "journeys" (things a person does) against it.
//
//   npm.cmd run test:e2e                 every journey
//   npm.cmd run test:e2e -- --only tabs  just the journeys whose name contains "tabs"
//   npm.cmd run test:e2e -- --list       the journeys
//   npm.cmd run test:e2e -- --keep       keep the throwaway data folder afterwards (to look at it)
//
// Close the Cleave development copy (npm start) first: the tests use the same dev server port.
// Nothing here uses the network or a real model, and it never touches your own data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp, removeFolder, sleep, waitFor } from './lib/app.mjs';
import { startFakeModel, FAKE_KEY, FAKE_MODEL } from './lib/fakeModel.mjs';
import { startSite } from './lib/site.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')
    ? args[i + 1]
    : null;
};

// The journeys, in order (file names start with a number). A journey is
// { name, run(ctx) }; it throws to fail.
const files = fs
  .readdirSync(path.join(here, 'journeys'))
  .filter((f) => f.endsWith('.mjs'))
  .sort();
const all = [];
for (const file of files) {
  const module = await import(`./journeys/${file}`);
  for (const journey of module.journeys) all.push(journey);
}

if (flag('list')) {
  for (const j of all) console.log(j.name);
  process.exit(0);
}
const only = opt('only');
const chosen = only ? all.filter((j) => j.name.includes(only)) : all;
if (chosen.length === 0) {
  console.error(`No journey matches "${only}".`);
  process.exit(2);
}

const site = await startSite();
const model = await startFakeModel();
let app = null;
const results = [];
let folder = null;

// Starting (and restarting) the app: always the same throwaway folder and fake model.
async function launch() {
  app = await startApp({
    profile: folder ?? undefined,
    env: { AIB_API_BASE: model.base },
  });
  folder = app.folder;
  // Safety: this must be the throwaway folder, never your own data.
  const info = await app.api('appInfo');
  if (info.dataFolder.toLowerCase() !== folder.toLowerCase()) {
    throw new Error(
      `The app is not using the throwaway folder (${info.dataFolder}). Stopping.`,
    );
  }
  return app;
}

try {
  console.log('Starting the app (the first start takes a little while)...');
  await launch();
  // The fake key and model, the way you would set them in Settings.
  const saved = await app.api('llmSaveKey', FAKE_KEY);
  if (!saved?.ok)
    throw new Error(`The fake key was not accepted: ${JSON.stringify(saved)}`);
  await app.api('llmSetModel', FAKE_MODEL);
  // Chromium writes the file holding the key that protects saved secrets ("Local State") a few
  // seconds after the first start. If the app is closed before that, a saved key can never be read
  // again. A person does not quit ten seconds after installing, so wait for the file here.
  await waitFor(
    'the app to save its encryption key file',
    async () => fs.existsSync(path.join(folder, 'Local State')),
    { timeout: 30000, every: 500 },
  );

  const ctx = {
    get app() {
      return app;
    },
    site,
    model,
    // Stop the app and start it again on the same data (to check what is kept).
    async restart() {
      const t0 = Date.now();
      const note = (what) =>
        flag('verbose') &&
        console.log(
          `    restart: ${what} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
        );
      await app.quit();
      note('quit');
      await launch();
      note('started again');
      return app;
    },
  };

  for (const journey of chosen) {
    const started = Date.now();
    model.reset();
    try {
      await journey.run(ctx);
      results.push({ name: journey.name, ok: true, ms: Date.now() - started });
      console.log(
        `  PASS  ${journey.name} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
      );
    } catch (error) {
      results.push({
        name: journey.name,
        ok: false,
        ms: Date.now() - started,
        error,
      });
      console.log(
        `  FAIL  ${journey.name}\n        ${String(error.message ?? error)
          .split('\n')
          .join('\n        ')}`,
      );
      // Where it failed (the line in the journey file), when asked.
      if (flag('verbose')) {
        console.log(
          String(error.stack ?? '')
            .split('\n')
            .filter((line) => line.includes('journeys'))
            .slice(0, 3)
            .join('\n'),
        );
      }
    }
  }
} catch (error) {
  console.error(`\nCould not run the tests: ${error.message}`);
  console.error(`The app's log is at ${app?.logFile ?? '(not started)'}`);
  results.push({ name: '(setup)', ok: false, error });
} finally {
  // End the run the way a person ends it, and check that closing was clean.
  if (app) {
    await app.quit().catch((error) => {
      console.log(
        `  FAIL  closing the app\n        ${String(error.message).split('\n').join('\n        ')}`,
      );
      results.push({ name: 'closing the app', ok: false, error });
    });
  }
  await model.close();
  await site.close();
  await sleep(300);
  if (folder && !flag('keep')) removeFolder(folder);
  else if (folder) console.log(`Kept the data folder: ${folder}`);
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length} of ${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(', ')}` : ''}.`,
);
process.exit(failed.length === 0 ? 0 : 1);
