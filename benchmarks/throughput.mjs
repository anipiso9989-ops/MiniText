import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { environment, median } from './shared.mjs';
import { workloads } from './workloads.mjs';

const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
const engines = [...(baseline ? ['MiniText baseline'] : []), 'MiniText', 'marked', 'markdown-it'];
const metadata = await environment();
const raw = [];
for (const workload of Object.keys(workloads)) for (let trial = 0; trial < 5; trial++) {
  const offset = trial % engines.length;
  for (const engine of [...engines.slice(offset), ...engines.slice(0, offset)]) {
    raw.push({ trial, ...JSON.parse(execFileSync(process.execPath, ['benchmarks/throughput-worker.mjs', engine, workload, ...(baseline ? [baseline] : [])], { encoding: 'utf8' })) });
  }
}
const rows = [];
for (const workload of Object.keys(workloads)) {
  const runs = raw.filter(run => run.workload === workload);
  assert.equal(new Set(runs.map(run => run.outputSHA256)).size, 1, `${workload}: normalized HTML must agree across engines`);
  for (const engine of engines) {
    const trials = runs.filter(run => run.engine === engine).map(run => median(run.samples));
    const ms = median(trials);
    rows.push({ workload, engine, inputBytes: runs[0].inputBytes, medianMs: ms, minTrialMs: Math.min(...trials), maxTrialMs: Math.max(...trials), mebibytesPerSecond: runs[0].inputBytes / 1048576 / (ms / 1000) });
  }
  console.log(`${workload}: ${rows.filter(row => row.workload === workload).map(row => `${row.engine} ${row.medianMs.toFixed(4)} ms`).join('; ')}`);
}
const comparisons = rows.filter(row => row.engine === 'MiniText').map(row => ({ workload: row.workload, versus: Object.fromEntries(rows.filter(other => other.workload === row.workload && other.engine !== 'MiniText').map(other => [other.engine, { speedup: other.medianMs / row.medianMs, latencyReductionPercent: (1 - row.medianMs / other.medianMs) * 100 }])) }));
const summary = Object.fromEntries(engines.filter(engine => engine !== 'MiniText').map(engine => {
  const ratios = comparisons.map(row => row.versus[engine].speedup);
  const geometricMeanSpeedup = Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length);
  return [engine, { workloadsWon: ratios.filter(ratio => ratio > 1).length, workloads: ratios.length, geometricMeanSpeedup, throughputIncreasePercent: (geometricMeanSpeedup - 1) * 100, latencyReductionPercent: (1 - 1 / geometricMeanSpeedup) * 100 }];
}));
const report = { environment: metadata, ...(baseline ? { baselineEnvironment: JSON.parse(await readFile('benchmarks/results/performance-baseline.json', 'utf8')).environment } : {}), methodology: 'Seven deterministic shared-profile workloads. Five fresh Node processes per engine/workload, rotated order, 150 ms warmup, calibrated batches targeting 10 ms, 21 samples per process. Medians across trial medians. HTML strings are materialized and normalized output hashes must agree across all trials and engines (including removal of formatting newlines before nested lists). Summary is an equally weighted geometric mean of per-workload speed ratios, not a pooled latency. MiniText still returns AST plus HTML; competitors return HTML. No cache, optional features, equal-compliance or universal-speed claim. Baseline is optional and points to an untouched build of the original source.', rows, comparisons, summary, raw };
await mkdir('benchmarks/results', { recursive: true });
await writeFile('benchmarks/results/throughput.json', JSON.stringify(report, null, 2) + '\n');
