import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { render } from '../dist/index.js';
import { normalizeHTML } from './normalize.mjs';
import { environment } from './shared.mjs';
const suite = JSON.parse(await readFile('benchmarks/fixtures/commonmark-0.31.2.json', 'utf8'));
const sections = {}, matched = [], mismatches = [];
for (const example of suite) {
  const result = render(example.markdown, { images: true });
  const actual = result.ok ? result.artifact.html : JSON.stringify(result.diagnostics);
  const pass = result.ok && normalizeHTML(actual) === normalizeHTML(example.html);
  sections[example.section] ??= { matched: 0, total: 0 };
  sections[example.section].total++;
  if (pass) { sections[example.section].matched++; matched.push(example.example); }
  else mismatches.push({ example: example.example, section: example.section, source: example.markdown, expected: example.html, actual });
}
const report = { environment: await environment(), specification: 'CommonMark 0.31.2', methodology: 'All 652 official examples, images explicitly enabled. Normalize void-tag slashes, inter-tag newlines, boundary whitespace, quote character references, and the explicit loading="lazy" image policy. Raw HTML remains escaped; URL allowlist and profile exclusions intentionally differ. A matched count is not a full-compliance claim.', matched: matched.length, total: suite.length, sections, mismatches };
await mkdir('benchmarks/results', { recursive: true });
await writeFile('benchmarks/results/conformance.json', JSON.stringify(report, null, 2) + '\n');
if (process.argv.includes('--record-baseline')) await writeFile('tests/commonmark-baseline.json', JSON.stringify(matched) + '\n');
console.log(`${matched.length}/${suite.length} examples matched; ${mismatches.length} recorded differences.`);
console.table(sections);
