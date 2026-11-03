import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { workloads } from './workloads.mjs';
import { normalizeHTML } from './normalize.mjs';
import { createHash } from 'node:crypto';

const [engine, workload, baseline] = process.argv.slice(2);
const source = workloads[workload];
let run;
if (engine === 'MiniText' || engine === 'MiniText baseline') {
  const module = await import(engine === 'MiniText' ? '../dist/index.js' : pathToFileURL(resolve(baseline)).href);
  const instance = module.createMiniText();
  run = () => {
    const result = instance.render(source);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.artifact.html;
  };
} else if (engine === 'marked') {
  const { Marked } = await import('marked');
  const instance = new Marked({ gfm: false });
  run = () => instance.parse(source);
} else if (engine === 'markdown-it') {
  const { default: MarkdownIt } = await import('markdown-it');
  const instance = new MarkdownIt('commonmark', { html: false });
  run = () => instance.render(source);
} else throw new Error(`Unknown engine: ${engine}`);
let sink = 0;
function consume(html) {
  // Force string materialization; measuring only rope.length understates HTML cost.
  sink = (sink + html.length + html.charCodeAt(html.length >>> 1)) | 0;
}
// Marked omits the formatting newline before a nested list; ignore that
// serializer-only difference in these controlled shared-profile workloads.
const outputSHA256 = createHash('sha256').update(normalizeHTML(run()).replace(/\n(?=<(?:ul|ol)(?: |>))/g, '')).digest('hex');
const warmStart = performance.now();
do { consume(run()); } while (performance.now() - warmStart < 150);
const calibration = performance.now();
for (let i = 0; i < 10; i++) consume(run());
const batch = Math.max(1, Math.min(10_000, Math.ceil(10 / ((performance.now() - calibration) / 10))));
const samples = [];
for (let sample = 0; sample < 21; sample++) {
  const start = performance.now();
  for (let i = 0; i < batch; i++) consume(run());
  samples.push((performance.now() - start) / batch);
}
console.log(JSON.stringify({ engine, workload, inputBytes: Buffer.byteLength(source), outputSHA256, batch, samples, sink }));
