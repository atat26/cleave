// Runs the scenarios in docs/pipeline/scenarios.md against the REAL app, through its debug port, so the
// owner's own OpenRouter key is used inside the app and never seen here.
//
// Before running:
//   1. node tests/pipeline/serve.mjs                         (the fixture pages, on this machine)
//   2. start the app:  $env:AIB_TRACE='1'; npm.cmd start -- -- --remote-debugging-port=9333
//      (AIB_TRACE=1 makes the app write one line of sizes per model call; never what was said)
//   3. keep the app window open (not minimised)
//   4. node tests/pipeline/run.mjs --repeat 3
//
// Only FREE models are used: every model is checked against OpenRouter's own price list first
// ("openrouter/free" is accepted as the free router), and a run that reports any cost stops
// everything at once. The app's default model is changed for the runs and put back at the end.
//
// Options: --model id  --fallback id,id  --repeat n  --only s1,s3  --port 9333  --list
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE } from './fixtures.mjs';
import { SCENARIOS, TODO } from './scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- arguments ----------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--')
    ? args[i + 1]
    : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const PORT = Number(opt('port', '9333'));
const REPEAT = Number(opt('repeat', '3'));
const ONLY = opt('only') ? opt('only').split(',') : null;

if (flag('list')) {
  for (const s of SCENARIOS)
    console.log(
      `${s.id}\t${s.title}\t(${s.turns.length} turn${s.turns.length === 1 ? '' : 's'})`,
    );
  for (const [id, why] of Object.entries(TODO))
    console.log(`${id}\tTODO: ${why}`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the app, through its debug port ------------------------------------------------
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => /^http:\/\/localhost:\d+\/$/.test(t.url));
  if (!page)
    throw new Error(
      `The app's main page was not found on port ${PORT}. Is it running with --remote-debugging-port=${PORT}?`,
    );
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Could not connect to the app.'));
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) pending.get(d.id)(d);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error(
        r.result.exceptionDetails.exception?.description ?? 'evaluation failed',
      );
    return r.result?.result?.value;
  };
  return { ev, close: () => ws.close() };
}

const J = JSON.stringify;
const snapshotExpr = `(async () => {
  const api = window.browserApi;
  const s = await new Promise((res) => { const off = api.onState((x) => { off && off(); res(x); }); api.uiReady(); });
  return JSON.stringify({
    tabs: s.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, loading: t.loading, spaceId: t.spaceId, closed: t.closed })),
    active: s.active,
    spaces: s.spaces.map((x) => ({ id: x.id, name: x.name })),
    activeChat: s.chats.activeId,
    chats: s.chats.conversations.map((c) => ({ id: c.id, generating: c.generating, model: c.model })),
    view: s.viewMode,
  });
})()`;

// ---- free models only ---------------------------------------------------------------
async function verifyFree(app, ids) {
  const listed = JSON.parse(
    await app.ev(
      `(async () => { const r = await window.browserApi.llmListModels(true); return JSON.stringify(r.ok ? r.models : { error: r.error }); })()`,
    ),
  );
  if (!Array.isArray(listed))
    throw new Error(`Could not read the model list: ${listed.error}`);
  const rows = [];
  for (const id of ids) {
    const m = listed.find((x) => x.id === id);
    let ok = false;
    let why;
    if (id === 'openrouter/free') {
      ok = true;
      why = 'the free router (accepted by the owner)';
    } else if (!m) why = 'not in the model list';
    else if (m.supportsTools === false) why = 'does not support tools';
    else if (m.promptPerMillion === 0 && m.completionPerMillion === 0) {
      ok = true;
      why = 'free (prompt and completion price are both 0)';
    } else
      why = `NOT free (prompt ${m.promptPerMillion}, completion ${m.completionPerMillion} per million)`;
    rows.push({ id, ok, why });
  }
  return rows;
}

// ---- trace file (sizes only), written by the app when AIB_TRACE=1 ---------------------
const traceFile = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
  'ai-browser',
  'pipeline-trace.jsonl',
);
function traceSince(at) {
  if (!fs.existsSync(traceFile)) return null;
  return fs
    .readFileSync(traceFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.at >= at);
}

// ---- one run of one scenario --------------------------------------------------------
async function runOnce(app, scenario, model) {
  const started = Date.now();
  const before = JSON.parse(await app.ev(snapshotExpr));
  const created = { tabs: [], chat: null };
  const result = {
    scenario: scenario.id,
    model,
    turns: [],
    asks: [],
    calls: [],
    error: null,
  };
  try {
    // Fixture pages become tabs (in no Space).
    const tabIds = [];
    for (const url of scenario.tabs) {
      await app.ev(`window.browserApi.newTab(null); 0`);
      await sleep(1200);
      let snap = JSON.parse(await app.ev(snapshotExpr));
      const id = snap.active.id;
      created.tabs.push(id);
      await app.ev(`window.browserApi.navigate(${J(url)}); 0`);
      for (let i = 0; i < 40; i++) {
        await sleep(400);
        snap = JSON.parse(await app.ev(snapshotExpr));
        const tab = snap.tabs.find((t) => t.id === id);
        if (tab && tab.url.startsWith(url) && !tab.loading && tab.title) break;
      }
      tabIds.push(id);
    }
    await app.ev(`window.browserApi.setViewMode('both'); 0`);
    await app.ev(`window.browserApi.newChat(); 0`);
    await sleep(900);
    const chat = JSON.parse(await app.ev(snapshotExpr)).activeChat;
    created.chat = chat;
    for (const index of scenario.link ?? []) {
      await app.ev(
        `window.browserApi.chatLink(${chat}, 'tab', ${tabIds[index]}); 0`,
      );
      await sleep(250);
    }

    for (const prompt of scenario.turns) {
      const turnStart = Date.now();
      const sent = await app.ev(
        `window.browserApi.chatSend(${chat}, ${J(prompt)}, []).then((r) => JSON.stringify(r))`,
      );
      if (!JSON.parse(sent).ok) throw new Error(`Could not send: ${sent}`);
      const answered = new Set();
      let last;
      for (let i = 0; i < 600; i++) {
        await sleep(700);
        const raw = await app.ev(
          `window.browserApi.chatMessages(${chat}).then((m) => JSON.stringify(m))`,
        );
        const messages = JSON.parse(raw);
        const reply = [...messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        last = reply;
        if (reply) {
          for (const part of reply.parts) {
            if (
              part.type === 'tool' &&
              part.status === 'waiting' &&
              !answered.has(`${reply.id}:${part.id}`)
            ) {
              answered.add(`${reply.id}:${part.id}`);
              const decision = scenario.approve({
                name: part.name,
                ask: part.ask,
                risky: part.risky,
                arguments: part.arguments,
              });
              result.asks.push({
                name: part.name,
                ask: part.ask,
                risky: part.risky,
                arguments: part.arguments,
                decision,
                asked: true,
              });
              await app.ev(
                `window.browserApi.chatDecide(${chat}, ${reply.id}, ${part.id}, ${J(decision)}); 0`,
              );
            }
          }
        }
        const snap = JSON.parse(await app.ev(snapshotExpr));
        const generating = snap.chats.find((c) => c.id === chat)?.generating;
        if (!generating && reply && reply.status !== 'streaming') break;
      }
      if (!last) throw new Error('No reply arrived.');
      const calls = last.parts
        .filter((p) => p.type === 'tool')
        .map((p) => ({
          name: p.name,
          arguments: p.arguments,
          status: p.status,
          ask: p.ask,
          risky: p.risky,
          outcome: p.outcome,
          label: p.label,
          detailsChars: p.details.length,
        }));
      const answer =
        last.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n\n') ||
        last.content ||
        '';
      result.turns.push({
        prompt,
        answer,
        calls,
        status: last.status,
        errorKind: last.errorKind ?? null,
        tokens: last.usage?.totalTokens ?? null,
        cost: last.usage?.cost ?? null,
        ms: Date.now() - turnStart,
      });
      result.calls.push(...calls);
      if (last.status === 'error') {
        result.error = last.errorKind ?? 'unknown';
        break;
      }
    }
  } catch (error) {
    result.error = String(error?.message ?? error);
  } finally {
    // Put everything back: stop and delete the chat, close the test tabs.
    try {
      if (created.chat !== null) {
        await app.ev(`window.browserApi.chatStop(${created.chat}); 0`);
        await sleep(400);
        await app.ev(`window.browserApi.deleteChat(${created.chat}); 0`);
        await sleep(400);
      }
      for (const id of created.tabs) {
        await app.ev(`window.browserApi.removeTab(${id}); 0`);
        await sleep(300);
      }
      if (before.activeChat !== null)
        await app.ev(`window.browserApi.selectChat(${before.activeChat}); 0`);
      if (before.active?.kind === 'tab')
        await app.ev(`window.browserApi.selectTab(${before.active.id}); 0`);
      await app.ev(`window.browserApi.setViewMode(${J(before.view)}); 0`);
    } catch {
      // Cleaning up is best effort; a leftover test tab or chat is easy to close.
    }
  }
  const costs = result.turns.map((t) => t.cost).filter((c) => c !== null);
  result.cost = costs.length ? costs.reduce((a, b) => a + b, 0) : null;
  const tokens = result.turns.map((t) => t.tokens).filter((t) => t !== null);
  result.tokens = tokens.length ? tokens.reduce((a, b) => a + b, 0) : null;
  result.ms = Date.now() - started;
  const trace = traceSince(started);
  result.trace = trace === null ? null : summariseTrace(trace);
  return result;
}

function summariseTrace(entries) {
  const sum = (f) => entries.reduce((a, e) => a + (f(e) ?? 0), 0);
  return {
    requests: entries.length,
    promptTokens: sum((e) => e.usage?.promptTokens),
    completionTokens: sum((e) => e.usage?.completionTokens),
    toolDefsChars: entries[0]?.toolDefs.chars ?? 0,
    toolDefsCount: entries[0]?.toolDefs.count ?? 0,
    toolResultChars:
      sum((e) => e.toolResultChars) &&
      Math.max(...entries.map((e) => e.toolResultChars)),
    imageChars: Math.max(0, ...entries.map((e) => e.images.chars)),
    rounds: Math.max(0, ...entries.map((e) => e.rounds)),
    firstRequestChars: entries[0]
      ? entries[0].systemChars +
        entries[0].userChars +
        entries[0].assistantChars
      : 0,
  };
}

// ---- main ---------------------------------------------------------------------------
const app = await connect();
const startModel = JSON.parse(
  await app.ev(
    `window.browserApi.llmStatus().then((s) => JSON.stringify({ model: s.model, hasKey: s.hasKey }))`,
  ),
);
if (!startModel.hasKey)
  throw new Error('No OpenRouter key is saved in the app.');

const wanted = [
  opt('model') ?? startModel.model,
  ...(opt('fallback') ? opt('fallback').split(',') : []),
  'openrouter/free',
].filter(Boolean);
const chainIds = [...new Set(wanted)];
const verdicts = await verifyFree(app, chainIds);
console.log('Models (free only):');
for (const v of verdicts)
  console.log(`  ${v.ok ? 'OK ' : 'NO '} ${v.id}: ${v.why}`);
const chain = verdicts.filter((v) => v.ok).map((v) => v.id);
if (chain.length === 0)
  throw new Error('None of the models is verified free, so nothing was run.');

const scenarios = SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.id));
const outDir = path.join(here, 'results');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const all = [];
let modelIndex = 0;

try {
  for (const scenario of scenarios) {
    for (let n = 1; n <= REPEAT; n++) {
      let result;
      for (let attempt = 0; attempt < chain.length; attempt++) {
        const model = chain[(modelIndex + attempt) % chain.length];
        await app.ev(
          `window.browserApi.llmSetModel(${J(model)}).then(() => 0)`,
        );
        result = await runOnce(app, scenario, model);
        // A paid answer is never expected: stop everything.
        if (result.cost !== null && result.cost > 0)
          throw new Error(
            `Stopping: ${model} reported a cost of ${result.cost}.`,
          );
        const limited =
          ['rate-limit', 'provider', 'timeout'].includes(result.error ?? '') ||
          /rate/i.test(result.error ?? '');
        if (!limited) {
          modelIndex = (modelIndex + attempt) % chain.length;
          break;
        }
        console.log(
          `  (${model} was limited: ${result.error}; trying the next free model)`,
        );
        await sleep(4000);
      }
      const checks = result.error
        ? []
        : scenario.checks({
            calls: result.calls,
            asks: result.asks,
            turns: result.turns,
            tokens: result.tokens,
          });
      result.checks = checks;
      result.pass = !result.error && checks.every((c) => c.ok !== false);
      all.push(result);
      const marks = checks
        .map((c) => (c.ok === true ? '+' : c.ok === false ? 'X' : '?'))
        .join('');
      console.log(
        `${scenario.id} #${n} ${result.pass ? 'PASS' : 'FAIL'} [${marks}] ${result.model} ${result.tokens ?? '?'} tok, ${result.trace?.requests ?? '?'} requests, ${(result.ms / 1000).toFixed(0)}s${result.error ? `  ERROR: ${result.error}` : ''}`,
      );
      for (const c of checks.filter((c) => c.ok === false))
        console.log(`      X ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    }
  }
} finally {
  // Put the owner's model back, whatever happened.
  try {
    await app.ev(
      `window.browserApi.llmSetModel(${J(startModel.model)}).then(() => 0)`,
    );
  } catch {
    console.log(
      `WARNING: could not restore the default model (${startModel.model}). Set it again in Settings.`,
    );
  }
  const file = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(
    file,
    J({ at: stamp, models: verdicts, runs: all }, null, 2),
  );
  console.log(`\nSaved ${file}`);
  app.close();
}

// A short table per scenario.
console.log('\nScenario summary (passes out of runs):');
for (const scenario of scenarios) {
  const runs = all.filter((r) => r.scenario === scenario.id);
  const passed = runs.filter((r) => r.pass).length;
  const tokens = runs.map((r) => r.tokens).filter((t) => t !== null);
  const avg = tokens.length
    ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)
    : null;
  console.log(
    `  ${scenario.id}  ${passed}/${runs.length}  avg ${avg ?? '?'} tokens (budget ${scenario.budgetTokens})  ${scenario.title}`,
  );
}
process.exit(0);
