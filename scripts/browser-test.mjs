import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { environment } from '../benchmarks/shared.mjs';

const bundle = await build({ stdin: { contents: "import {mount} from './dist/browser.js'; import {tables} from './dist/features/tables.js'; import {taskLists} from './dist/features/task-lists.js'; globalThis.MiniText={mount,tables,taskLists}", resolveDir: process.cwd() }, bundle: true, platform: 'browser', target: 'es2022', format: 'iife', write: false });
const server = createServer((request, response) => {
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; trusted-types mini-text; require-trusted-types-for 'script'");
  response.setHeader('Content-Type', request.url === '/test.js' ? 'text/javascript' : 'text/html');
  response.end(request.url === '/test.js' ? bundle.outputFiles[0].text : '<!doctype html><html lang="en"><title>MiniText browser test</title><main id="host"></main><script src="/test.js" defer></script></html>');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.MINITEXT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.MINITEXT_CHROMIUM_EXECUTABLE } : {}), args: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const violations = [], requests = [];
  page.on('pageerror', error => violations.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'load' });
  const state = await page.evaluate(() => {
    const { mount, tables, taskLists } = globalThis.MiniText;
    const policy = trustedTypes.createPolicy('mini-text', { createHTML: value => value });
    const host = document.querySelector('#host');
    const setHTML = (template, html) => { template.innerHTML = policy.createHTML(html); };
    const mounted = mount(host, '[stay](/link)\n\nold\n\nsuffix', { setHTML, limits: { maxInputBytes: 100 } });
    if (!mounted.ok) throw new Error('Mount failed');
    const link = host.querySelector('a'), suffix = host.lastElementChild; link.focus();
    mounted.artifact.update('[stay](/link)\n\nchanged\n\nsuffix');
    const reused = link === host.querySelector('a') && suffix === host.lastElementChild && document.activeElement === link;
    const original = host.innerHTML;
    const failed = mounted.artifact.update('x'.repeat(101));
    const atomic = !failed.ok && original === host.innerHTML;
    mounted.artifact.dispose(); const disposed = host.childNodes.length === 0;
    const rich = mount(host, '# Title\n\na | b\n--- | ---\nx | y\n\n- [x] done\n\n<script>globalThis.attacked=true</script>\n\n![alt](https://invalid.example/image)', { setHTML, extensions: [tables, taskLists] });
    if (!rich.ok) throw new Error('Rich mount failed');
    return { reused, atomic, disposed, heading: host.querySelector('h1')?.textContent, headers: host.querySelectorAll('th[scope="col"]').length, labeledCheckbox: !!host.querySelector('input[disabled][aria-label]'), inert: !host.querySelector('script,img') && !globalThis.attacked };
  });
  assert.deepEqual(state, { reused: true, atomic: true, disposed: true, heading: 'Title', headers: 2, labeledCheckbox: true, inert: true });
  const semantics = await page.locator('#host').ariaSnapshot();
  assert.match(semantics, /heading "Title"/); assert.match(semantics, /columnheader/);
  assert.equal(violations.length, 0, violations.join('\n'));
  assert.ok(requests.every(url => url.startsWith(`http://127.0.0.1:${server.address().port}/`)), 'No external resources should be requested');
  await mkdir('benchmarks/results', { recursive: true });
  await writeFile('benchmarks/results/browser.json', JSON.stringify({ environment: await environment(), browser: browser.version(), checks: state, semantics, csp: "default-src 'none'; script-src 'self'; trusted-types mini-text; require-trusted-types-for 'script'", note: 'Real Chromium correctness and accessibility-tree smoke test under CSP + Trusted Types; no browser performance comparison.' }, null, 2) + '\n');
  console.log('Chromium DOM reuse, focus, atomic updates, disposal, semantic output, CSP and Trusted Types verified.');
} finally { await browser?.close(); server.close(); }
