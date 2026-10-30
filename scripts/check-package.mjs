import { readFile, access, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Script } from 'node:vm';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0, 'Runtime must remain dependency-free');
// A fresh process evaluates every JS subpath with browser globals forbidden.
for (const name of ['window', 'document', 'navigator']) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`Unexpected global access: ${name}`); } });
for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (typeof target === 'string') await access(target);
  else { await access(target.types); await import(subpath === '.' ? pkg.name : pkg.name + subpath.slice(1)); }
}
const bundled = await build({ stdin: { contents: "import {render} from './dist/index.js'; globalThis.result=render('# Browser')", resolveDir: process.cwd() }, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false });
const context = {};
new Script(bundled.outputFiles[0].text).runInNewContext(context, { timeout: 1000 });
assert.equal(context.result.artifact.html, '<h1>Browser</h1>\n');
const consumer = 'scripts/.consumer-check.ts';
await writeFile(consumer, `import {createMiniText, type Document} from '@mini/text';
import {tables} from '@mini/text/tables';
import {replaceText} from '@mini/text/rich-text';
import {mount} from '@mini/text/browser';
const result = createMiniText({extensions:[tables]}).parse('text');
if (result.ok) { const doc: Document = result.artifact; replaceText(doc,[0,0],0,1,'x'); }
void mount;
`);
try { execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--skipLibCheck', '--module', 'nodenext', '--target', 'es2022', consumer], { stdio: 'inherit' }); }
finally { await unlink(consumer); }
console.log('Package exports, declarations, zero runtime dependencies, server imports and browser bundle verified.');
