// Starts the real app on a throwaway data folder and drives it through Chromium's debugging port.
// It never touches your own data: the folder is new, and it is deleted afterwards.
//
// The app that runs is the development copy (`npm start`), because only that copy takes the AIB_
// settings the tests need (the fake model's address). The installed app ignores them on purpose.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Try again until `fn` gives something truthy (or throws nothing and returns it), or time runs out.
export async function waitFor(
  label,
  fn,
  { timeout = 15000, every = 150 } = {},
) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(every);
  }
  const why = last instanceof Error ? ` (${last.message})` : '';
  throw new Error(`Timed out waiting for ${label}${why}`);
}

const portFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });

async function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// ---- a connection to one page of the app ------------------------------------------------
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    // A page that has died accepts the connection request and never answers it.
    const timer = setTimeout(
      () => reject(new Error('The page did not answer (it may have crashed).')),
      5000,
    );
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Could not connect to the app.'));
    };
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return {
    send,
    // Run JavaScript in the page and bring back its (JSON-able) result.
    async ev(expression) {
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.result?.exceptionDetails) {
        throw new Error(
          r.result.exceptionDetails.exception?.description ??
            r.result.exceptionDetails.text ??
            'evaluation failed',
        );
      }
      return r.result?.result?.value;
    },
    close: () => ws.close(),
  };
}

// ---- the app ------------------------------------------------------------------------------
// options: { profile (folder, made if missing), env (extra settings), keep (leave the folder) }
export async function startApp({ profile, env = {}, log } = {}) {
  if (!(await portFree(5173))) {
    throw new Error(
      'Port 5173 is in use: close the Cleave development copy (npm start) that is running, then try again.',
    );
  }
  const folder =
    profile ?? fs.mkdtempSync(path.join(os.tmpdir(), 'cleave-e2e-'));
  fs.mkdirSync(folder, { recursive: true });
  const port = await freePort();
  const logFile = log ?? path.join(os.tmpdir(), 'cleave-e2e-app.log');
  const out = fs.openSync(logFile, 'w');

  const child = spawn(
    'cmd.exe',
    [
      '/c',
      'npm.cmd',
      'start',
      '--',
      '--',
      `--user-data-dir=${folder}`,
      `--remote-debugging-port=${port}`,
    ],
    {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', out, out],
      windowsHide: true,
    },
  );

  const targets = async () =>
    (await (
      await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(3000),
      })
    ).json()) ?? [];
  const connections = new Map();
  const on = async (target) => {
    if (!connections.has(target.id)) {
      connections.set(target.id, await connect(target.webSocketDebuggerUrl));
    }
    return connections.get(target.id);
  };

  // The app's own window page (the interface), not a tab's page.
  const uiTarget = async () => {
    const found = (await targets()).find(
      (t) => t.type === 'page' && /^http:\/\/localhost:\d+\/$/.test(t.url),
    );
    if (!found) throw new Error('the app window is not there yet');
    return found;
  };

  const app = {
    folder,
    port,
    logFile,
    child,
    targets,
    // Run JavaScript in the app's own window.
    async ev(expression) {
      return (await on(await uiTarget())).ev(expression);
    },
    // Run JavaScript in a web page tab, found by (part of) its address.
    async pageEv(urlPart, expression) {
      const target = (await targets()).find(
        (t) => t.type === 'page' && t.url.includes(urlPart),
      );
      if (!target) throw new Error(`no page with "${urlPart}" in its address`);
      return (await on(target)).ev(expression);
    },
    // Send a debugging command to the app's own window and bring back the answer (for example
    // DOM.setFileInputFiles, to give a file input a real file from this computer).
    async uiSend(method, params = {}) {
      const answer = await (await on(await uiTarget())).send(method, params);
      if (answer.error) throw new Error(`${method}: ${answer.error.message}`);
      return answer.result;
    },
    // Send a debugging command to a page (found by part of its address), for example Page.crash.
    // The connection to a page that dies cannot be used again, so all of them are dropped afterwards.
    async pageSend(urlPart, method, params = {}) {
      const target = (await targets()).find(
        (t) => t.type === 'page' && t.url.includes(urlPart),
      );
      if (!target) throw new Error(`no page with "${urlPart}" in its address`);
      const connection = await on(target);
      connection.send(method, params);
    },
    dropConnections() {
      for (const c of connections.values()) c.close();
      connections.clear();
    },
    // Call the app's own interface functions (the same ones its screens use).
    api: (name, ...args) =>
      app
        .ev(
          `Promise.resolve(window.browserApi.${name}(...${JSON.stringify(args)})).then((r) => JSON.stringify(r === undefined ? null : r))`,
        )
        .then((text) => (text === undefined ? null : JSON.parse(text))),
    // The app's state: tabs, Spaces, chats, and so on.
    async state() {
      const text = await app.ev(`(async () => {
        const api = window.browserApi;
        const s = await new Promise((res) => { const off = api.onState((x) => { off && off(); res(x); }); api.uiReady(); });
        return JSON.stringify(s);
      })()`);
      return JSON.parse(text);
    },
    // A close button that is already warmed up: PowerShell takes about a second to start, so a test
    // that must close in the same moment as something else gets the closer first, then calls it.
    // (It sends the same close request as the window's own close button.)
    async prepareClose() {
      const script = `$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '*${folder.replace(/'/g, "''")}*' -and $_.CommandLine -notlike '*--type=*' } | Select-Object -First 1; $proc = Get-Process -Id $p.ProcessId; [Console]::Out.WriteLine('ready'); while (($l = [Console]::In.ReadLine()) -ne $null) { if ($l -eq 'close') { [void]$proc.CloseMainWindow(); break } }`;
      const helper = spawn('powershell', ['-NoProfile', '-Command', script], {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      });
      await new Promise((resolve, reject) => {
        helper.stdout.once('data', resolve);
        helper.once('error', reject);
        setTimeout(
          () => reject(new Error('the close helper did not start')),
          20000,
        );
      });
      return () => helper.stdin.write('close\n');
    },
    // Close the app's window the way you do with the close button, so it saves everything and quits
    // properly (stop() is a hard kill, like a crash). Then clear away what is left of the dev server.
    async quit() {
      // The app's main process is the one started with this throwaway folder that is not a helper.
      const script = `$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '*${folder.replace(/'/g, "''")}*' -and $_.CommandLine -notlike '*--type=*' } | Select-Object -First 1; if ($p) { [void](Get-Process -Id $p.ProcessId).CloseMainWindow() }`;
      spawnSync('powershell', ['-NoProfile', '-Command', script], {
        stdio: 'ignore',
      });
      await waitFor('the app to quit', async () => !(await isUp(port)), {
        timeout: 20000,
      }).catch(() => undefined);
      await app.stop();
      // Closing must be clean: no error dialog in the main process ("Object has been destroyed" once
      // appeared when the app was closed).
      const text = fs.readFileSync(logFile, 'utf8');
      const bad =
        /Uncaught Exception|Object has been destroyed|UnhandledPromiseRejection/.exec(
          text,
        );
      if (bad) {
        const at = text.indexOf(bad[0]);
        throw new Error(
          `The app reported an error while closing:
${text.slice(Math.max(0, at - 200), at + 600)}`,
        );
      }
    },
    // Stop the app (and the dev server under it).
    async stop() {
      for (const c of connections.values()) c.close();
      connections.clear();
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
      // After a graceful quit the dev server's parent is already gone, so the line above cannot reach
      // it: stop anything still running with this run's throwaway folder in its command line.
      const sweep = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${folder.replace(/'/g, "''")}*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`;
      spawnSync('powershell', ['-NoProfile', '-Command', sweep], {
        stdio: 'ignore',
      });
      await waitFor('the app to close', async () => !(await isUp(port)), {
        timeout: 20000,
      }).catch(() => undefined);
      await sleep(1500);
      fs.closeSync(out);
    },
  };

  try {
    await waitFor(
      'the app window',
      async () => {
        const t = await uiTarget();
        const c = await on(t);
        return c.ev('typeof window.browserApi === "object"');
      },
      { timeout: 120000, every: 1000 },
    );
    // The development server sometimes serves a page that loads but never draws (it is rebuilding its
    // libraries just as the app starts). A person would press reload; so does this, a few times.
    for (let attempt = 0; attempt < 4; attempt++) {
      const drawn = await waitFor(
        'the app page to draw',
        async () =>
          (await (
            await on(await uiTarget())
          ).ev('document.getElementById("root")?.children.length ?? 0')) > 0,
        { timeout: attempt === 3 ? 30000 : 10000, every: 500 },
      ).then(
        () => true,
        () => false,
      );
      if (drawn) break;
      if (attempt === 3) throw new Error('The app page never drew.');
      await (
        await on(await uiTarget())
      )
        .ev('location.reload()')
        .catch(() => undefined);
    }
  } catch (error) {
    // Never leave a half-started app running.
    await app.stop();
    removeFolder(folder);
    throw error;
  }
  return app;
}

async function isUp(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    return true;
  } catch {
    return false;
  }
}

export function removeFolder(folder) {
  fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
}
