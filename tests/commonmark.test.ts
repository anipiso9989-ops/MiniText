import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../src/index.ts';
// @ts-expect-error Shared development-only normalization helper.
import { normalizeHTML } from '../benchmarks/normalize.mjs';
const suite = JSON.parse(readFileSync(new URL('../benchmarks/fixtures/commonmark-0.31.2.json', import.meta.url), 'utf8')) as { example: number; section: string; markdown: string; html: string }[];
const baseline = new Set<number>(JSON.parse(readFileSync(new URL('./commonmark-baseline.json', import.meta.url), 'utf8')));
for (const example of suite) if (baseline.has(example.example)) test(`CommonMark regression ${example.example}: ${example.section}`, () => {
  const result = render(example.markdown, { images: true }); assert.ok(result.ok);
  assert.equal(normalizeHTML(result.artifact.html), normalizeHTML(example.html));
});
