import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { parse, render, createMiniText, defaultLimits } from '../src/index.ts';
import type { Document, Extension } from '../src/index.ts';
import { tables } from '../src/features/tables.ts';
import { strikethrough } from '../src/features/strikethrough.ts';
import { taskLists } from '../src/features/task-lists.ts';
import { embeds, embed, collectEmbeds } from '../src/features/embeds.ts';
import { fromJSON, toJSON, replaceText, applyMark, spliceChildren, createHistory, outline } from '../src/features/rich-text.ts';
import { mount } from '../src/browser.ts';
import { textEngine } from '../src/integration.ts';

function doc(source: string): Document { const result = parse(source); assert.ok(result.ok); return result.artifact; }
function html(source: string | Document, extensions: readonly Extension[] = []): string { const result = render(source, { extensions }); assert.ok(result.ok, JSON.stringify(result.diagnostics)); return result.artifact.html; }

test('features are opt-in and instance-local', () => {
  assert.equal(html('~~text~~'), '<p>~~text~~</p>\n');
  assert.equal(html('~~**text**~~', [strikethrough]), '<p><s><strong>text</strong></s></p>\n');
  assert.ok(createMiniText().render('~~text~~').ok);
});
test('strikethrough respects escaped delimiters and code spans', () => {
  assert.equal(html('~~a \\~~ b~~', [strikethrough]), '<p><s>a ~~ b</s></p>\n');
  assert.equal(html('~~a `~~` b~~', [strikethrough]), '<p><s>a <code>~~</code> b</s></p>\n');
  assert.ok(html('[~~[inner](/a)~~](/b)', [strikethrough]).includes('href="/a"'));
});
for (const source of ['~~ open', '~~ text~~', '~~text ~~', '~~~text~~~', '\\~~text~~', '`~~text~~`']) test(`literal strike syntax: ${source}`, () => {
  assert.ok(!html(source, [strikethrough]).includes('<s>'));
});
test('tables produce native column headers and explicit alignment classes', () => {
  const result = html('| Left | Center | Right |\n| :--- | :---: | ---: |\n| **a** | b | c |', [tables]);
  const window = new Window(); window.document.body.innerHTML = result;
  assert.equal(window.document.querySelectorAll('th[scope="col"]').length, 3);
  assert.equal(window.document.querySelector('tbody strong')?.textContent, 'a');
  assert.equal(window.document.querySelectorAll('td.mini-text-align-right').length, 1);
  window.close();
});
test('table cells preserve escaped pipes and code spans; short rows are padded', () => {
  const result = html('a | b\n--- | ---\nx\\|y | `z|w`\nonly |', [tables]);
  assert.ok(result.includes('<td>x|y</td><td><code>z|w</code></td>'));
  assert.ok(result.includes('<td>only</td><td></td>'));
});
test('invalid table delimiter stays ordinary Markdown', () => {
  assert.ok(!html('a | b\n-- | --', [tables]).includes('<table>'));
  assert.ok(!html('a | b\n--- | --- | ---', [tables]).includes('<table>'));
});
test('malformed imported table data returns a diagnostic', () => {
  const document: Document = { type: 'document', children: [{ type: 'extension', kind: 'block', name: 'tables', data: null, fallback: '', children: [] }] };
  const result = render(document, { extensions: [tables] }); assert.ok(!result.ok); assert.equal(result.diagnostics[0]?.code, 'INVALID_TABLE');
});
test('wide table expansion consumes node budgets before allocating all cells', () => {
  const source = Array(50).fill('x').join('|') + '\n' + Array(50).fill('---').join('|') + '\n' + 'x|\n'.repeat(50);
  const result = render(source, { extensions: [tables], limits: { maxNodes: 200 } });
  assert.ok(!result.ok); assert.equal(result.diagnostics[0]?.code, 'MAX_NODES');
});
test('task lists handle mixed and nested items and accessible display checkboxes', () => {
  const result = html('- [x] done\n- [ ] waiting\n  - [X] child\n- normal\n- \\[x] escaped', [taskLists]);
  const window = new Window(); window.document.body.innerHTML = result;
  const inputs = window.document.querySelectorAll('input');
  assert.equal(inputs.length, 3); assert.equal(inputs[0]!.checked, true); assert.equal(inputs[1]!.checked, false);
  for (const input of inputs) { assert.ok(input.disabled); assert.ok(input.getAttribute('aria-label')); }
  assert.ok(window.document.body.textContent.includes('[x] escaped')); window.close();
});
test('ordinary paragraph task markers are not checkboxes', () => {
  assert.equal(html('[x] ordinary', [taskLists]), '<p>[x] ordinary</p>\n');
});
test('extensions compose through the same AST', () => {
  const result = html('a | b\n--- | ---\n~~old~~ | **new**\n\n- [x] ~~done~~', [tables, taskLists, strikethrough]);
  assert.ok(result.includes('<td><s>old</s></td>')); assert.ok(result.includes('<s>done</s>'));
});
test('structured embeds retain typed data and inert fallback artifacts', () => {
  const item = embed({ version: 1, id: 'code-1', engine: 'code', input: { source: 'const x = 1' }, fallbackText: '<unavailable>' });
  const document: Document = { type: 'document', children: [item] };
  const result = collectEmbeds(document); assert.ok(result.ok); assert.equal(result.artifact[0]?.engine, 'code');
  assert.equal(html(document), '&lt;unavailable&gt;\n');
  assert.equal(html(document, [embeds]), '<figure class="mini-text-embed"><figcaption>&lt;unavailable&gt;</figcaption></figure>\n');
  assert.equal(collectEmbeds({ ...document, children: [item, item] }).ok, false);
});
test('malformed imported embed data gives diagnostics', () => {
  const document: Document = { type: 'document', children: [{ type: 'extension', kind: 'block', name: 'embeds', data: null, fallback: 'fallback', children: [] }] };
  const result = render(document, { extensions: [embeds] }); assert.ok(!result.ok); assert.equal(result.diagnostics[0]?.code, 'INVALID_EMBED');
});
test('rich documents round-trip and reject malformed or oversized JSON', () => {
  const original = doc('# Title\n\nA **rich** document');
  const encoded = toJSON(original); assert.ok(encoded.ok);
  const decoded = fromJSON(encoded.artifact); assert.ok(decoded.ok); assert.deepEqual(decoded.artifact, original);
  assert.equal(fromJSON('{').ok, false); assert.equal(fromJSON('{"type":"script"}').ok, false);
  assert.equal(fromJSON(encoded.artifact, { limits: { maxInputBytes: 2 } }).ok, false);
  assert.equal(toJSON(original, { limits: { maxOutputBytes: 2 } }).ok, false);
});
test('text edits preserve unchanged subtree identity and old versions', () => {
  const original = doc('Hello world\n\nUnchanged');
  const changed = replaceText(original, [0, 0], 6, 11, 'Ani'); assert.ok(changed.ok);
  assert.equal(html(changed.artifact), '<p>Hello Ani</p>\n<p>Unchanged</p>\n');
  assert.equal(changed.artifact.children[1], original.children[1]);
  assert.equal(html(original), '<p>Hello world</p>\n<p>Unchanged</p>\n');
});
test('formatting splits a text range into schema-valid inline nodes', () => {
  const original = doc('hello world');
  const result = applyMark(original, [0, 0], 0, 5, 'strong'); assert.ok(result.ok);
  assert.equal(html(result.artifact), '<p><strong>hello</strong> world</p>\n');
  assert.equal(applyMark(original, [0, 0], 0, 0, 'emphasis').ok, true);
});
test('edits reject invalid paths, ranges, content and split surrogate pairs', () => {
  const original = doc('a😀b');
  assert.equal(replaceText(original, [8], 0, 1, 'x').ok, false);
  assert.equal(replaceText(original, [0, 0], 2, 3, 'x').ok, false);
  assert.equal(replaceText(original, [0, 0], 4, 1, 'x').ok, false);
  assert.equal(spliceChildren(original, [], 0, 1, [{ type: 'text', value: 'not a block' }]).ok, false);
  assert.equal(spliceChildren(original, [], -1, 0, []).ok, false);
});
test('bounded history supports undo, redo and branch truncation', () => {
  const a = doc('a'), b = doc('b'), c = doc('c'), d = doc('d');
  const history = createHistory(a, 1);
  assert.ok(history.commit(b).ok); assert.ok(history.commit(c).ok);
  assert.equal(history.undo(), b); assert.equal(history.undo(), b); assert.equal(history.redo(), c);
  history.undo(); history.commit(d); assert.equal(history.redo(), d);
  history.clear(); assert.equal(history.undo(), d);
});
test('outline has semantic heading text and stable AST paths', () => {
  const result = outline(doc('# A *title*\n\n> ## Nested'));
  assert.ok(result.ok); assert.deepEqual(result.artifact, [{ level: 1, text: 'A title', path: [0] }, { level: 2, text: 'Nested', path: [1, 0] }]);
});
test('browser views update atomically, reuse unchanged blocks, and dispose', () => {
  const window = new Window(); const host = window.document.createElement('article'); window.document.body.append(host);
  const mounted = mount(host as unknown as Element, '[stay](/link)\n\nold\n\nsuffix', { limits: { maxInputBytes: 100 } }); assert.ok(mounted.ok);
  const link = host.querySelector('a'), suffix = host.querySelectorAll('p')[2]; link?.focus();
  assert.ok(mounted.artifact.update('[stay](/link)\n\nnew\n\nsuffix').ok);
  assert.equal(host.querySelector('a'), link); assert.equal(host.querySelectorAll('p')[2], suffix); assert.equal(window.document.activeElement, link);
  const before = host.innerHTML; assert.equal(mounted.artifact.update('x'.repeat(101)).ok, false); assert.equal(host.innerHTML, before);
  mounted.artifact.dispose(); mounted.artifact.dispose(); assert.equal(host.childNodes.length, 0);
  assert.throws(() => mounted.artifact.update('x'), /disposed/); window.close();
});
test('browser opt-in sink receives only safe generated HTML', () => {
  const window = new Window(); const host = window.document.createElement('div'); let calls = 0;
  const mounted = mount(host as unknown as Element, '<script>x</script>', { setHTML(template, safe) { calls++; assert.ok(!safe.includes('<script>')); template.innerHTML = safe; } });
  assert.ok(mounted.ok); mounted.artifact.update('<script>x</script>'); assert.equal(calls, 1); mounted.artifact.dispose(); window.close();
});
test('failed initial mounting preserves host content', () => {
  const window = new Window(); const host = window.document.createElement('div'); host.textContent = 'existing';
  assert.equal(mount(host as unknown as Element, 'x', { signal: AbortSignal.abort() }).ok, false); assert.equal(host.textContent, 'existing'); window.close();
});
test('integration adapter intersects budgets and accepts only validated inputs', () => {
  const context = { idPrefix: 'test', limits: { ...defaultLimits, maxInputBytes: 2 } };
  assert.equal(textEngine.render('long', { limits: { maxInputBytes: 10 } }, context).ok, false);
  assert.equal(textEngine.render('x', {}, context).ok, true);
  assert.equal(textEngine.render({ type: 'script' }, {}, context).ok, false);
  assert.equal(textEngine.render('x', { signal: AbortSignal.abort() }, { ...context, signal: new AbortController().signal }).ok, false);
});
