import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { render, validateDocument } from '../src/index.ts';
import type { Document } from '../src/index.ts';

const urls = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///a', '//evil.com/x', '\\evil.com', 'java\nscript:x', 'java\tscript:x', '\u0000javascript:x'];
for (const url of urls) test(`blocks unsafe AST URL ${JSON.stringify(url)}`, () => {
  const doc: Document = { type: 'document', children: [{ type: 'paragraph', children: [{ type: 'link', url, children: [{ type: 'text', value: 'label' }] }, { type: 'image', url, alt: 'image' }] }] };
  const result = render(doc, { images: true }); assert.ok(result.ok);
  assert.equal(result.artifact.html, '<p>labelimage</p>\n');
});
test('raw source, code, languages, titles, image alt and text cannot inject markup', () => {
  const doc: Document = { type: 'document', children: [
    { type: 'codeBlock', language: '\" onmouseover=\"x', value: '</code><script>x</script>' },
    { type: 'paragraph', children: [{ type: 'image', url: 'https://a.test/\"x', title: '\" onerror=\"x', alt: '\"><script>x</script>' }, { type: 'link', url: 'https://a.test/\"', title: '\" onclick=\"x', children: [{ type: 'text', value: '<img src=x onerror=x>' }] }] },
  ] };
  const result = render(doc, { images: true }); assert.ok(result.ok);
  const window = new Window(); window.document.body.innerHTML = result.artifact.html;
  assert.equal(window.document.querySelectorAll('script, [onerror], [onclick], [onmouseover]').length, 0);
  assert.equal(window.document.querySelector('img')?.getAttribute('alt'), '\"><script>x</script>');
  window.close();
});
test('entity obfuscation is decoded before URL checks', () => {
  for (const source of ['[x](javascript&#58;evil)', '[x](java&#x73;cript:evil)', '[x](javascript:evil)', '<javascript:evil>']) {
    const result = render(source); assert.ok(result.ok); assert.ok(!result.artifact.html.includes('href='));
  }
});
test('images make no external requests by default', () => {
  const result = render('![description](https://example.com/img)'); assert.ok(result.ok);
  assert.equal(result.artifact.html, '<p>description</p>\n');
});
test('extension output shares the HTML and URL policy', () => {
  const doc: Document = { type: 'document', children: [{ type: 'extension', kind: 'block', name: 'test', data: null, fallback: '', children: [] }] };
  const result = render(doc, { extensions: [{ name: 'test', render: () => ({ tag: 'a', attrs: { href: 'javascript:x' }, children: ['<script>x</script>'] }) }] });
  assert.ok(result.ok); assert.equal(result.artifact.html, '<a>&lt;script&gt;x&lt;/script&gt;</a>\n');
  assert.throws(() => render(doc, { extensions: [{ name: 'test', render: () => ({ tag: 'script' }) }] }), TypeError);
  assert.throws(() => render(doc, { extensions: [{ name: 'test', render: () => ({ tag: 'span', attrs: { onclick: 'x' } }) }] }), TypeError);
});
test('AST JSON data is bounded, finite and cycle-free', () => {
  const node = { type: 'extension', kind: 'block', name: 'x', data: {} as Record<string, unknown>, fallback: '', children: [] };
  const doc = { type: 'document', children: [node] };
  node.data.self = node.data; assert.equal(validateDocument(doc).ok, false);
  node.data = { n: NaN }; assert.equal(validateDocument(doc).ok, false);
  node.data = { text: 'a'.repeat(500) }; assert.equal(validateDocument(doc, { limits: { maxInputBytes: 100 } }).ok, false);
});
test('bounded deterministic fuzz produces parseable inert HTML or diagnostics', () => {
  let seed = 7331;
  const alphabet = '<>![]()_*`\\\n \t&;"\'ab09';
  const window = new Window();
  for (let run = 0; run < 400; run++) {
    let source = '';
    for (let i = 0; i < 150; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; source += alphabet[seed % alphabet.length]; }
    const result = render(source, { limits: { maxWork: 100_000 } });
    if (!result.ok) { assert.ok(result.diagnostics.length); continue; }
    window.document.body.innerHTML = result.artifact.html;
    assert.equal(window.document.querySelectorAll('script, iframe, object, embed, style, [onclick], [onerror]').length, 0);
    assert.deepEqual(render(source), render(source));
  }
  window.close();
});
