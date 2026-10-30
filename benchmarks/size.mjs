import { build } from 'esbuild';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { environment } from './shared.mjs';

const entries = {
  'MiniText render': "export {render} from './dist/index.js'",
  'MiniText parse': "export {parse} from './dist/index.js'",
  'MiniText root (all exports)': "export * from './dist/index.js'",
  'MiniText browser': "export * from './dist/browser.js'",
  'MiniText tables (feature alone)': "export * from './dist/features/tables.js'",
  'MiniText strikethrough (feature alone)': "export * from './dist/features/strikethrough.js'",
  'MiniText task lists (feature alone)': "export * from './dist/features/task-lists.js'",
  'MiniText rich text (feature alone)': "export * from './dist/features/rich-text.js'",
  'MiniText embeds (feature alone)': "export * from './dist/features/embeds.js'",
  marked: "import {marked} from 'marked'; export const run = input => marked.parse(input, {gfm:false})",
  'markdown-it': "import MarkdownIt from 'markdown-it'; const md = new MarkdownIt('commonmark',{html:false}); export const run = input => md.render(input)",
  micromark: "export {micromark as run} from 'micromark'",
};
const rows = [];
for (const [name, contents] of Object.entries(entries)) {
  const result = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, treeShaking: true, write: false, metafile: true });
  const code = result.outputFiles[0].contents;
  const inputs = Object.keys(result.metafile.inputs);
  if (name.startsWith('MiniText render') || name.startsWith('MiniText root')) assert.ok(inputs.every(s => !s.includes('/features/') && !s.includes('browser.js') && !s.includes('integration.js')));
  rows.push({ name, minifiedBytes: code.length, gzipBytes: gzipSync(code, { level: 9 }).length, brotliBytes: brotliCompressSync(code).length, modules: inputs.length });
}
const lazy = await build({ stdin: { contents: "export {render} from './dist/index.js'; export const loadTables=()=>import('./dist/features/tables.js')", resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', splitting: true, minify: true, write: false, outdir: 'benchmarks/.tmp/lazy', metafile: true });
const outputs = Object.entries(lazy.metafile.outputs);
const initial = outputs.find(([name]) => name.endsWith('stdin.js'));
assert.ok(initial && Object.keys(initial[1].inputs).every(p => !p.includes('/features/')));
const feature = outputs.find(([, info]) => info.entryPoint?.endsWith('dist/features/tables.js'));
assert.ok(feature, 'Tables must split into an independent optional chunk');
assert.ok(initial[1].imports.some(entry => entry.kind === 'dynamic-import' && entry.path === feature[0]));
for (const dependency of initial[1].imports.filter(entry => entry.kind !== 'dynamic-import')) {
  const shared = lazy.metafile.outputs[dependency.path];
  assert.ok(shared && Object.keys(shared.inputs).every(p => !p.includes('/features/')), 'Initial static dependencies must exclude optional features');
}
const report = { environment: await environment(), methodology: 'esbuild browser/ES2022 ESM bundles, minify+tree-shake, gzip level 9, Brotli default. Feature-alone rows exclude the core; compression sizes are not additive. Other libraries implement broader Markdown grammars.', rows, lazyChunks: outputs.map(([file, info]) => ({ file, bytes: info.bytes, inputs: Object.keys(info.inputs) })) };
await mkdir('benchmarks/results', { recursive: true });
await writeFile('benchmarks/results/size.json', JSON.stringify(report, null, 2) + '\n');
console.table(rows);
