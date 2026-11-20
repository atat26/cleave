// Usage: node cache_report.mjs label=file.json [label=file.json ...]
// For each label and scenario: runs, prompt tokens, cached share, output tokens, and "effective units":
// the uncached prompt tokens, plus a tenth of the cached ones, plus four times the output tokens
// (DeepSeek-style prices: cached input about a tenth, output about four times input). Only an
// estimate of money, but the same for every condition.
import fs from 'node:fs';
const groups = {};
for (const arg of process.argv.slice(2)) {
  const [label, file] = arg.split('=');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const run of data.runs) {
    if (!run.trace) continue;
    const key = `${label}|${run.scenario}`;
    (groups[key] ??= []).push(run);
  }
}
const sum = (a, f) => a.reduce((n, x) => n + (f(x) ?? 0), 0);
const rows = [];
for (const [key, runs] of Object.entries(groups)) {
  const [label, scenario] = key.split('|');
  const prompt = sum(runs, (r) => r.trace.promptTokens);
  const cached = sum(runs, (r) => r.trace.cachedTokens);
  const out = sum(runs, (r) => r.trace.completionTokens);
  const units = prompt - cached + 0.1 * cached + 4 * out;
  rows.push({
    label,
    scenario,
    runs: runs.length,
    pass: runs.filter((r) => r.pass).length,
    promptPerRun: Math.round(prompt / runs.length),
    cachedShare: Math.round((100 * cached) / prompt),
    outPerRun: Math.round(out / runs.length),
    unitsPerRun: Math.round(units / runs.length),
  });
}
rows.sort(
  (a, b) =>
    a.scenario.localeCompare(b.scenario) || a.label.localeCompare(b.label),
);
console.log(
  'scenario  condition  runs(pass)  prompt/run  cached%  output/run  effective units/run',
);
for (const r of rows)
  console.log(
    `${r.scenario.padEnd(9)} ${r.label.padEnd(10)} ${String(r.runs).padStart(2)}(${r.pass})      ${String(r.promptPerRun).padStart(8)}   ${String(r.cachedShare).padStart(4)}%   ${String(r.outPerRun).padStart(8)}   ${String(r.unitsPerRun).padStart(8)}`,
  );
