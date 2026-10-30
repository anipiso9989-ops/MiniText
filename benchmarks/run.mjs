import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { environment, median } from './shared.mjs';
const engines = ['MiniText', 'MiniText parse', 'MiniText AST render', 'marked', 'markdown-it', 'micromark'];
const raw = [];
// Each run starts in a fresh process; process launch time is outside importMs.
for (const repeat of [1, 100]) for (let trial = 0; trial < 5; trial++) {
  // Rotate execution order to reduce fixed-order bias.
  const order = [...engines.slice(trial % engines.length), ...engines.slice(0, trial % engines.length)];
  for (const engine of order) raw.push({ trial, ...JSON.parse(execFileSync(process.execPath, ['--expose-gc', 'benchmarks/worker.mjs', engine, String(repeat)], { encoding: 'utf8' })) });
}
const rows = [];
for (const inputBytes of [...new Set(raw.map(r => r.inputBytes))]) for (const engine of engines) {
  const runs = raw.filter(r => r.engine === engine && r.inputBytes === inputBytes);
  const row = { engine, inputBytes, trials: runs.length };
  for (const field of ['importMs', 'initMs', 'firstRenderMs', 'warmMedianMs', 'warmP95Ms', 'meanMs', 'initializedHeapBytes', 'retainedBytesPerArtifact', 'releasedHeapDeltaBytes']) row[field] = median(runs.map(r => r[field]));
  row.mebibytesPerSecond = inputBytes / 1048576 / (row.meanMs / 1000); rows.push(row);
}
const report = { environment: await environment(), methodology: 'Five isolated Node --expose-gc processes per engine and fixture size, rotated order, 30 warmups, 300 small / 15 large timed iterations, median across trials. Import excludes process launch. Retention holds 20 artifacts after explicit GC; MiniText render retains both AST and HTML, competitors retain HTML only. GC heap deltas are noisy, not peak RSS or allocation counts. No browser throughput claim. MiniText uses a smaller grammar, so results are workload-specific and not equivalent-compliance rankings.', rows, raw };
await mkdir('benchmarks/results', { recursive: true });
await writeFile('benchmarks/results/performance.json', JSON.stringify(report, null, 2) + '\n');
console.table(rows.map(({ engine, inputBytes, importMs, initMs, warmMedianMs, mebibytesPerSecond, retainedBytesPerArtifact }) => ({ engine, inputBytes, importMs, initMs, warmMedianMs, mebibytesPerSecond, retainedBytesPerArtifact })));
