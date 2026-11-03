import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, render, createMiniText } from '../src/index.ts';
import { bytes } from '../src/limits.ts';
import { safeURL, escapeHTML } from '../src/security.ts';
import type { Options } from '../src/index.ts';

test('UTF-8 byte counts agree with the platform, including lone surrogates', () => {
  for (const value of ['', 'ASCII\0<&', 'café', '世界', '😀', '\ud800', '\udc00', 'a\ud800b\udc00😀']) {
    assert.equal(bytes(value), Buffer.byteLength(value));
  }
});

test('short and long HTML escaping paths preserve text and encode every delimiter', () => {
  const value = '&<>"\'\0café😀';
  const expected = '&amp;&lt;&gt;&quot;&#39;\ufffdcafé😀';
  for (const repeat of [1, 20, 1000]) assert.equal(escapeHTML(value.repeat(repeat)), expected.repeat(repeat));
});

test('URL fast path preserves URI encoding and malformed-percent behavior', () => {
  const suffixes = ['plain/path', '%20%2f%2520', '%', '%2', '%zz', 'space here', 'café😀', '\ud800', ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32))];
  for (const suffix of suffixes) {
    if (suffix === '\\') continue; // Deliberately blocked by the URL policy.
    const value = '/path/' + suffix;
    const wellFormed = new TextDecoder().decode(new TextEncoder().encode(value.trim()));
    const expected = encodeURI(wellFormed).replace(/%25([\da-f]{2})/gi, '%$1');
    assert.equal(safeURL(value), expected);
  }
});

const suite = JSON.parse(readFileSync(new URL('../benchmarks/fixtures/commonmark-0.31.2.json', import.meta.url), 'utf8')) as { markdown: string }[];
test('internal tree checks and full validation agree on every official example', () => {
  for (const { markdown } of suite) {
    assert.deepEqual(render(markdown, { images: true }), render(markdown, { images: true, extensions: [{ name: 'force-full-validation' }] }));
  }
});

test('fast paths preserve input, node, nesting, work, and output limits', () => {
  const sources = ['plain &amp; café 😀', '**a *b* c**', '<https://example.com>', '[x](u "t") ![alt](v "t")', '```ts\nx\n```', '3. a\n4. b', '> > quote', 'a  \nb', 'a\tb\n\tcode'];
  for (const source of sources) for (const key of ['maxInputBytes', 'maxNodes', 'maxDepth', 'maxWork', 'maxOutputBytes'] as const) {
    for (const value of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]) {
      const options: Options = { limits: { [key]: value } };
      assert.deepEqual(render(source, options), render(source, { ...options, extensions: [{ name: 'force-full-validation' }] }), `${key}=${value}: ${source}`);
    }
  }
});

test('inline hooks still see ordinary characters, including after nested parsing', () => {
  const text = createMiniText({ extensions: [{ name: 'replace', inline: ({ source, index }) => source[index] === 'a' ? { length: 1, node: { type: 'text', value: 'A' } } : undefined }] });
  const result = text.render('a **a** a'); assert.ok(result.ok);
  assert.equal(result.artifact.html, '<p>A <strong>A</strong> A</p>\n');
});

test('extension nodes, transforms and caller-owned trees retain structural validation', () => {
  const bad = { type: 'paragraph', children: [{ type: 'heading', level: 1, children: [] }] };
  // Deliberately model untyped, malformed plugin output.
  const options = { extensions: [{ name: 'invalid', block: () => ({ lines: 1, node: bad }) }] } as unknown as Options;
  assert.equal(parse('x', options).ok, false);
  const transformed = { extensions: [{ name: 'invalid', transform: () => ({ type: 'document', children: [bad] }) }] } as unknown as Options;
  assert.equal(parse('x', transformed).ok, false);
  const parsed = parse('safe'); assert.ok(parsed.ok);
  const corrupted = { ...parsed.artifact, hidden: true };
  assert.equal(render(corrupted).ok, false);
});
