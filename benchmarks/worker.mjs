import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const [engine, repeats = '1'] = process.argv.slice(2);
const fixture = readFileSync('benchmarks/fixtures/article.md', 'utf8').repeat(Number(repeats));
global.gc(); const beforeImport = process.memoryUsage().heapUsed;
const start = performance.now();
const module = await import(({ MiniText: '../dist/index.js', 'MiniText parse': '../dist/index.js', 'MiniText AST render': '../dist/index.js', marked: 'marked', 'markdown-it': 'markdown-it', micromark: 'micromark' })[engine]);
const importMs = performance.now() - start;
const initStart = performance.now();
let run;
if (engine === 'MiniText') { const instance = module.createMiniText(); run = source => { const result = instance.render(source); if (!result.ok) throw new Error(JSON.stringify(result.diagnostics)); return result.artifact; }; }
if (engine === 'MiniText parse') run = source => { const result = module.parse(source); if (!result.ok) throw new Error(JSON.stringify(result.diagnostics)); return result.artifact; };
if (engine === 'MiniText AST render') { const ast = module.parse(fixture); if (!ast.ok) throw new Error('parse failed'); run = () => { const result = module.render(ast.artifact); if (!result.ok) throw new Error(JSON.stringify(result.diagnostics)); return result.artifact; }; }
if (engine === 'marked') { const instance = new module.Marked({ gfm: false }); run = source => instance.parse(source); }
if (engine === 'markdown-it') { const instance = new module.default('commonmark', { html: false }); run = source => instance.render(source); }
if (engine === 'micromark') run = source => module.micromark(source);
const initMs = performance.now() - initStart;
global.gc(); const initializedHeapBytes = process.memoryUsage().heapUsed - beforeImport;
const first = performance.now(); let value = run(fixture); const firstRenderMs = performance.now() - first;
let sink = 0;
function consume(value) { sink ^= (typeof value === 'string' ? value.length : value.html?.length ?? value.children.length); }
consume(value); value = null;
for (let i = 0; i < 30; i++) consume(run(fixture));
const samples = [];
const iterations = Number(repeats) === 1 ? 300 : 15;
for (let i = 0; i < iterations; i++) { const t = performance.now(); consume(run(fixture)); samples.push(performance.now() - t); }
samples.sort((a, b) => a - b);
global.gc(); const beforeRetain = process.memoryUsage().heapUsed;
const held = Array.from({ length: 20 }, () => run(fixture));
global.gc(); const retained = process.memoryUsage().heapUsed - beforeRetain; consume(held[0]);
held.length = 0; global.gc();
const releasedHeapDeltaBytes = process.memoryUsage().heapUsed - beforeRetain;
console.log(JSON.stringify({ engine, inputBytes: Buffer.byteLength(fixture), importMs, initMs, firstRenderMs, warmMedianMs: samples[Math.floor(samples.length / 2)], warmP95Ms: samples[Math.floor(samples.length * .95)], meanMs: samples.reduce((a, b) => a + b, 0) / samples.length, initializedHeapBytes, retainedBytesPerArtifact: retained / 20, releasedHeapDeltaBytes, iterations, sink }));
