import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, render, validateDocument, createMiniText } from '../src/index.ts';
import type { Document, Options } from '../src/index.ts';
// @ts-expect-error Development-only oracle has no bundled declarations.
import MarkdownIt from 'markdown-it';

export function html(source: string | Document, options: Options = {}): string {
  const result = render(source, options);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.ok ? result.artifact.html : '';
}
const oracle = new MarkdownIt('commonmark', { html: false });
const normalize = (value: string) => value.replace(/\s*\/>/g, '>').replace(/>\n</g, '><').trim();
const cases = [
  '', 'hello', 'hello\nworld', 'a\r\nb\rc', '# Heading', '###### six', '####### seven', '#', '# a ###', '## a#', '#no-space',
  'a\n===', 'a\n---', 'first\nsecond\n---', '---', '* * *', '___', 'a\n\n---',
  '**strong**', '*em*', '_em_', '__strong__', '***both***', 'a_b_c', 'a*b*c', '*a **b** c*', '**a *b* c**',
  '*a* and *b*', '**a**b**c**', 'a***b***c', '*a\n b*', '\\*literal\\*', '&amp; &lt; &gt; &quot; &#65; &#x41;',
  'a😀_b_ c', '😀*a*😀', 'a🙶_b_ c',
  '`code`', '``a ` b``', '` a `', '`  `', '`a\nb`', '`unclosed', 'a  \nb', 'a\\\nb',
  '```ts\nx < y\n```', '~~~\nx\n~~~~', '```\n\n```', '```\nx\n', '```\nx', '```\nx\n\n', '   ```\n   a\n ```',
  '    code\n    next', '    a\n\n    b', '> quote', '> a\n>\n> b', '> > nested',
  '- a\n- b', '3. a\n4. b', '- a\n\n- b', '- a\n  - nested\n  - next', '- a\n\n  b',
  '[x](https://example.com)', '[x](u "title")', '[a *b*](../a)', '[x](a(b)c)', '[x](<a>)', '[x]()',
  '<https://example.com>', '<a@b.com>', '[unclosed', '<script>alert(1)</script>', '<b>x</b>', 'a\0b',
];
for (const source of cases) test(`profile: ${JSON.stringify(source)}`, () => {
  assert.equal(normalize(html(source)), normalize(oracle.render(source)));
});

test('AST is serializable and rendering does not mutate it', () => {
  const result = parse('# Hello **world**'); assert.ok(result.ok);
  const copy = JSON.parse(JSON.stringify(result.artifact)) as Document;
  assert.deepEqual(copy, result.artifact);
  assert.equal(html(copy), '<h1>Hello <strong>world</strong></h1>\n');
  assert.deepEqual(copy, result.artifact);
});
test('instances isolate extension and limit configuration', () => {
  const options: { limits: { maxInputBytes: number } } = { limits: { maxInputBytes: 2 } };
  const a = createMiniText(options), b = createMiniText(); options.limits.maxInputBytes = 100;
  assert.equal(a.render('long').ok, false); assert.equal(b.render('long').ok, true);
});
test('invalid options and programming failures throw', () => {
  assert.throws(() => render('x', { limits: { maxNodes: 0 } }), TypeError);
  assert.throws(() => render('x', { limits: { maxDepth: 257 } }), TypeError);
  assert.throws(() => parse('x', { extensions: [{ name: 'x' }, { name: 'x' }] }), TypeError);
  assert.throws(() => parse('x', { extensions: [{ name: 'x', inline: () => ({ length: 0, node: { type: 'text', value: 'a' } }) }] }), TypeError);
  assert.throws(() => parse('x', { extensions: [{ name: 'x', transform: () => { throw new Error('plugin bug'); } }] }), /plugin bug/);
});
test('unknown extension nodes keep escaped fallback text', () => {
  const doc: Document = { type: 'document', children: [{ type: 'extension', kind: 'block', name: 'absent', data: null, fallback: '<safe>', children: [] }] };
  assert.equal(html(doc), '&lt;safe&gt;\n');
});
test('pre-aborted work returns diagnostics', () => {
  const result = render('x', { signal: AbortSignal.abort() });
  assert.ok(!result.ok); assert.equal(result.diagnostics[0]?.code, 'CANCELLED');
});
test('all resource limits return diagnostics', () => {
  for (const [source, limits, code] of [
    ['éé', { maxInputBytes: 3 }, 'MAX_INPUT_BYTES'],
    ['a **b**', { maxNodes: 2 }, 'MAX_NODES'],
    ['> > > a', { maxDepth: 2 }, 'MAX_DEPTH'],
    ['<<<', { maxOutputBytes: 8 }, 'MAX_OUTPUT_BYTES'],
    ['[[[[[[[[[', { maxWork: 10 }, 'MAX_WORK'],
  ] as const) {
    const result = render(source, { limits }); assert.ok(!result.ok); assert.equal(result.diagnostics.at(-1)?.code, code);
  }
});
test('AST validation rejects invalid content models and cycles', () => {
  const invalid: unknown[] = [null, {}, { type: 'document', children: [{ type: 'heading', level: 7, children: [] }] },
    { type: 'document', children: [{ type: 'text', value: 'x' }] },
    { type: 'document', children: [{ type: 'paragraph', children: [{ type: 'paragraph', children: [] }] }] },
    { type: 'document', children: [{ type: 'paragraph', children: [{ type: 'link', url: 'a', children: [{ type: 'link', url: 'b', children: [] }] }] }] },
    { type: 'document', children: [], hidden: 'unknown data' },
    { type: 'document', children: [{ type: 'list', ordered: true, tight: true, start: Infinity, children: [] }] }];
  const cycle = { type: 'document', children: [] as unknown[] }; cycle.children.push(cycle); invalid.push(cycle);
  for (const value of invalid) assert.equal(validateDocument(value).ok, false);
});
