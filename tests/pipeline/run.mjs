// Runs the scenarios in docs/pipeline/scenarios.md against the REAL app, through its debug port, so the
// owner's own OpenRouter key is used inside the app and never seen here.
//
// Before running:
//   1. node tests/pipeline/serve.mjs                         (the fixture pages, on this machine)
//   2. start the app:  $env:AIB_TRACE='1'; $env:AIB_TEST_SCOPE='1'; npm.cmd start -- -- --remote-debugging-port=9333
//      (AIB_TRACE=1 makes the app write one line of sizes per model call; never what was said.
//       AIB_TEST_SCOPE=1 hides the owner's real tabs, Spaces, history and chats from the assistant
//       and lets the driver remove the Spaces a test made. Runs refuse to start without it.)
//   3. keep the app window open (not minimised)
//   4. node tests/pipeline/run.mjs --repeat 3
//
// Only FREE models are used: every model is checked against OpenRouter's own price list first
// ("openrouter/free" is accepted as the free router), and a run that reports any cost stops
// everything at once. The app's default model is changed for the runs and put back at the end.
//
// The one exception, approved by the owner for occasional SMALL tests when the free models are
// restricting a test: --allow-paid <exact model id> names ONE paid model that may be used, and
// --max-cost <usd> is the most all the runs together may cost (default 0.05, never more than
// 0.50). The cost is added up from what the app reports, printed, and a run that goes over
// the cap stops everything. Without --allow-paid nothing paid ever runs.
//
// Options: --model id  --fallback id,id  --strict  --repeat n  --only s1,s3  --port 9333  --list
//          --allow-paid id  --max-cost 0.05
import { spawnSync } from 'node:child_process';
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
// One paid model at most, named in full, with a small spending cap.
const PAID_MODEL = opt('allow-paid');
const HARD_MAX_COST = 0.5;
const MAX_COST = Math.min(Number(opt('max-cost', '0.05')), HARD_MAX_COST);
if (!(MAX_COST > 0)) throw new Error('--max-cost must be a number above 0.');
if (flag('allow-paid') && !PAID_MODEL)
  throw new Error('--allow-paid needs the exact model id after it.');
let spent = 0;

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
    artifacts: s.artifacts.map((a) => ({ id: a.id, title: a.title, kind: a.kind })),
    skills: s.skills.map((k) => ({ id: k.id, name: k.name })),
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
    } else if (id === PAID_MODEL) {
      ok = true;
      why = `PAID, allowed by the owner for small tests (prompt ${m.promptPerMillion}, completion ${m.completionPerMillion} per million; cap $${MAX_COST} in all)`;
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
    // Test Spaces, each with its own fixture tabs.
    const spaceIds = [];
    for (const wanted of scenario.spaces ?? []) {
      await app.ev(`window.browserApi.newSpace(); 0`);
      await sleep(700);
      const snap = JSON.parse(await app.ev(snapshotExpr));
      const known = new Set(before.spaces.map((x) => x.id).concat(spaceIds));
      const made = snap.spaces.find((x) => !known.has(x.id));
      if (!made) throw new Error('A test Space could not be made.');
      await app.ev(
        `window.browserApi.renameSpace(${made.id}, ${J(wanted.name)}); 0`,
      );
      await sleep(400);
      spaceIds.push(made.id);
      for (const url of wanted.tabs ?? []) {
        await app.ev(`window.browserApi.newTab(${made.id}); 0`);
        await sleep(1200);
        let s2 = JSON.parse(await app.ev(snapshotExpr));
        const id = s2.active.id;
        created.tabs.push(id);
        await app.ev(`window.browserApi.navigate(${J(url)}); 0`);
        for (let i = 0; i < 40; i++) {
          await sleep(400);
          s2 = JSON.parse(await app.ev(snapshotExpr));
          const tab = s2.tabs.find((t) => t.id === id);
          if (tab && tab.url.startsWith(url) && !tab.loading && tab.title)
            break;
        }
      }
    }
    // Test artifacts (in no Space), linked to the chat below.
    const artifactIds = [];
    for (const wanted of scenario.artifacts ?? []) {
      const id = JSON.parse(
        await app.ev(
          `window.browserApi.artifactCreate(${J(wanted.kind)}, ${J(wanted.title)}, null).then((r) => JSON.stringify(r))`,
        ),
      );
      if (id === null) throw new Error('A test artifact could not be made.');
      const doc = JSON.parse(
        await app.ev(
          `window.browserApi.artifactRead(${id}).then((d) => JSON.stringify(d))`,
        ),
      );
      await app.ev(
        `window.browserApi.artifactWrite(${id}, ${J(wanted.content)}, ${doc.revision}).then(() => 0)`,
      );
      artifactIds.push(id);
    }
    // Test skills (on), for scenarios that name or use one. They are removed with the other new
    // skills afterwards.
    for (const wanted of scenario.skills ?? []) {
      const saved = JSON.parse(
        await app.ev(
          `window.browserApi.skillSave(${J(wanted)}).then((r) => JSON.stringify(r))`,
        ),
      );
      if (!saved.ok) throw new Error('A test skill could not be made.');
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
    for (const index of scenario.linkSpaces ?? []) {
      await app.ev(
        `window.browserApi.chatLink(${chat}, 'space', ${spaceIds[index]}); 0`,
      );
      await sleep(250);
    }
    for (const index of scenario.linkArtifacts ?? []) {
      await app.ev(
        `window.browserApi.chatLink(${chat}, 'artifact', ${artifactIds[index]}); 0`,
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
              // A scenario may act first, while the card is waiting (it is the one moment a step is
              // sure to be waiting, so it does not depend on timing).
              if (scenario.beforeAnswer) {
                await scenario.beforeAnswer({
                  part,
                  closeTab: async (index) => {
                    await app.ev(
                      `window.browserApi.removeTab(${tabIds[index]}); 0`,
                    );
                    await sleep(1200);
                  },
                });
              }
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
          skipped: p.skipped === true,
          blocked: p.blocked === true,
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
    // Scenario 13: ask the app to name the chat with AI, as the "name it with AI" button does (an
    // automatic naming of the first message may be running; it is waited out).
    if (scenario.naming) {
      for (let i = 0; i < 8; i++) {
        result.naming = JSON.parse(
          await app.ev(
            `window.browserApi.nameWithAi('chat', ${created.chat}).then((r) => JSON.stringify(r))`,
          ),
        );
        if (
          result.naming.ok ||
          !/Already naming/i.test(result.naming.error ?? '')
        )
          break;
        await sleep(1500);
      }
    }
    // What the run left behind, read before it is cleaned away (for the checks).
    result.after = await readAfter(app, before);
  } catch (error) {
    result.error = String(error?.message ?? error);
  } finally {
    // Put everything back: stop and delete the chat, close the test tabs, remove what was made.
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
      await removeMade(app, before, created.chat);
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
    // Prompt tokens the provider served from its cache, and in how many requests it said so at all.
    cachedTokens: sum((e) => e.usage?.cachedTokens),
    cacheReported: entries.filter((e) => e.usage?.cachedTokens != null).length,
    toolDefsChars: entries[0]?.toolDefs.chars ?? 0,
    toolDefsCount: entries[0]?.toolDefs.count ?? 0,
    toolResultChars:
      sum((e) => e.toolResultChars) &&
      Math.max(...entries.map((e) => e.toolResultChars)),
    imageChars: Math.max(0, ...entries.map((e) => e.images.chars)),
    rounds: Math.max(0, ...entries.map((e) => e.rounds)),
    // Rounds in which the model asked for several tool calls at once (batching), and the most it asked for.
    batchedRounds: entries.filter((e) => e.toolCalls.length > 1).length,
    mostCalls: Math.max(0, ...entries.map((e) => e.toolCalls.length)),
    firstRequestChars: entries[0]
      ? entries[0].systemChars +
        entries[0].userChars +
        entries[0].assistantChars
      : 0,
  };
}

// What a run made: Spaces (with their tabs), new artifacts and new skills, read for the checks.
async function readAfter(app, before) {
  const snap = JSON.parse(await app.ev(snapshotExpr));
  const knownSpaces = new Set(before.spaces.map((x) => x.id));
  const spaces = snap.spaces
    .filter((x) => !knownSpaces.has(x.id))
    .map((x) => ({
      id: x.id,
      name: x.name,
      tabs: snap.tabs
        .filter((t) => t.spaceId === x.id && !t.closed)
        .map((t) => t.title),
    }));
  const knownArtifacts = new Set(before.artifacts.map((x) => x.id));
  const artifacts = [];
  for (const a of snap.artifacts.filter(
    (x) => !knownArtifacts.has(x.id) || x.title.startsWith('Test '),
  )) {
    const doc = JSON.parse(
      await app.ev(
        `window.browserApi.artifactRead(${a.id}).then((d) => JSON.stringify(d))`,
      ),
    );
    artifacts.push({
      id: a.id,
      title: a.title,
      kind: a.kind,
      isNew: !knownArtifacts.has(a.id),
      chars: doc?.content?.length ?? 0,
      content: doc?.content ?? '',
    });
  }
  const knownSkills = new Set(before.skills.map((x) => x.id));
  const skills = [];
  for (const k of snap.skills.filter((x) => !knownSkills.has(x.id))) {
    const doc = JSON.parse(
      await app.ev(
        `window.browserApi.skillGet(${k.id}).then((d) => JSON.stringify(d))`,
      ),
    );
    skills.push({
      id: k.id,
      name: k.name,
      description: doc?.description ?? '',
      instructions: doc?.instructions ?? '',
    });
  }
  return { spaces, artifacts, skills };
}

// Remove everything a run made: Spaces (with no question), artifacts and skills, and their copies
// in Recently deleted. Anything that was there before the run is left alone.
// The app asks first, in a native dialog, before deleting for good; this answers it, but only for the
// named test item (see confirm-dialog.ps1).
function confirmDeleteForGood(title) {
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(here, 'confirm-dialog.ps1'),
      '-Titles',
      title,
      '-WaitSeconds',
      '4',
    ],
    { stdio: 'ignore' },
  );
}

async function removeMade(app, before, chatId = null) {
  await app.ev(`window.browserApi.devCleanupTestSpaces().then((n) => n)`);
  await sleep(300);
  // Tabs the assistant opened itself on the fixture server (the driver only knows the ones it made).
  const known = new Set(before.tabs.map((t) => t.id));
  const opened = JSON.parse(await app.ev(snapshotExpr)).tabs.filter(
    (t) => !known.has(t.id) && t.url.startsWith(BASE),
  );
  for (const tab of opened) {
    await app.ev(`window.browserApi.removeTab(${tab.id}); 0`);
    await sleep(300);
  }
  const snap = JSON.parse(await app.ev(snapshotExpr));
  const knownArtifacts = new Set(before.artifacts.map((x) => x.id));
  const knownSkills = new Set(before.skills.map((x) => x.id));
  const newArtifacts = snap.artifacts
    .filter((x) => !knownArtifacts.has(x.id))
    .map((x) => x.id);
  const newSkills = snap.skills
    .filter((x) => !knownSkills.has(x.id))
    .map((x) => x.id);
  for (const id of newArtifacts)
    await app.ev(`window.browserApi.artifactDelete(${id}); 0`);
  for (const id of newSkills)
    await app.ev(`window.browserApi.skillDelete(${id}); 0`);
  await sleep(500);
  const trash = JSON.parse(
    await app.ev(
      `window.browserApi.libraryDeleted().then((t) => JSON.stringify(t))`,
    ),
  );
  for (const item of trash) {
    if (
      (item.kind === 'artifact' && newArtifacts.includes(item.id)) ||
      (item.kind === 'skill' && newSkills.includes(item.id)) ||
      (item.kind === 'chat' && chatId !== null && item.id === chatId)
    ) {
      await app.ev(
        `window.browserApi.libraryDeleteForever(${J(item.kind)}, ${item.id}); 0`,
      );
      confirmDeleteForGood(item.title);
    }
  }
}

// ---- main ---------------------------------------------------------------------------
const app = await connect();
// The test scope must be on, so the assistant never sees the owner's real tabs, Spaces or history.
// (This also clears any Spaces an earlier run left.)
try {
  await app.ev(`window.browserApi.devCleanupTestSpaces().then((n) => n)`);
} catch {
  throw new Error(
    'Start the app with AIB_TEST_SCOPE=1 (and AIB_TRACE=1): without it the assistant could see your real tabs, Spaces and history, so nothing was run.',
  );
}
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
  // --strict: only the chosen model (so every number is for the same model); a rate limit is waited out.
  ...(flag('strict') ? [] : ['openrouter/free']),
].filter(Boolean);
const chainIds = [...new Set(wanted)];
const verdicts = await verifyFree(app, chainIds);
console.log(
  PAID_MODEL
    ? 'Models (free, plus one allowed paid model):'
    : 'Models (free only):',
);
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
      for (
        let attempt = 0;
        attempt < (flag('strict') ? 6 : chain.length);
        attempt++
      ) {
        const model = chain[(modelIndex + attempt) % chain.length];
        await app.ev(
          `window.browserApi.llmSetModel(${J(model)}).then(() => 0)`,
        );
        result = await runOnce(app, scenario, model);
        // A cost is only expected from the one allowed paid model, and only up to the cap.
        if (result.cost !== null && result.cost > 0) {
          if (model !== PAID_MODEL)
            throw new Error(
              `Stopping: ${model} reported a cost of ${result.cost}.`,
            );
          spent += result.cost;
          if (spent > MAX_COST)
            throw new Error(
              `Stopping: the cost so far ($${spent.toFixed(4)}) is over the cap of $${MAX_COST}.`,
            );
        }
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
        await sleep(flag('strict') ? 45000 : 4000);
      }
      const checks = result.error
        ? []
        : scenario.checks({
            calls: result.calls,
            asks: result.asks,
            turns: result.turns,
            tokens: result.tokens,
            naming: result.naming,
            after: result.after,
          });
      result.checks = checks;
      result.pass = !result.error && checks.every((c) => c.ok !== false);
      all.push(result);
      const marks = checks
        .map((c) => (c.ok === true ? '+' : c.ok === false ? 'X' : '?'))
        .join('');
      console.log(
        `${scenario.id} #${n} ${result.pass ? 'PASS' : 'FAIL'} [${marks}] ${result.model} ${result.tokens ?? '?'} tok${result.cost ? ` ($${result.cost.toFixed(4)})` : ''}, ${result.trace?.requests ?? '?'} requests (${result.trace?.batchedRounds ?? '?'} batched), cached ${result.trace?.cacheReported ? result.trace.cachedTokens + '/' + result.trace.promptTokens : 'not reported'}, ${(result.ms / 1000).toFixed(0)}s${result.error ? `  ERROR: ${result.error}` : ''}`,
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

if (PAID_MODEL)
  console.log(
    'Paid cost in all: $' + spent.toFixed(4) + ' (cap $' + MAX_COST + ')',
  );

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
