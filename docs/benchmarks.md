# Recorded measurements

Recorded 2026-11-03 on v24.22.1, AMD EPYC 9V74 80-Core Processor, linux 6.18.57 x64.

Source SHA-256: `ef9ada04d6f8295f9ac9da4d00d90c543fb2d7eb0d7b74cfbdb9b8062e75fd7e`. Competitors are pinned to marked 18.1.2 and markdown-it 14.3.3. Raw reports retain the environment, individual samples and all trials. Results describe these workloads and this machine, not universal rankings.

## Rendering throughput

Seven deterministic shared-profile workloads. Five fresh Node processes per engine/workload, rotated order, 150 ms warmup, calibrated batches targeting 10 ms, 21 samples per process. Medians across trial medians. HTML strings are materialized and normalized output hashes must agree across all trials and engines (including removal of formatting newlines before nested lists). Summary is an equally weighted geometric mean of per-workload speed ratios, not a pooled latency. MiniText still returns AST plus HTML; competitors return HTML. No cache, optional features, equal-compliance or universal-speed claim. Baseline is optional and points to an untouched build of the original source.

| Workload | Input bytes | Original MiniText, ms | Optimized MiniText, ms | marked, ms | markdown-it, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| article-small | 542 | 0.0563 | 0.0219 | 0.0450 | 0.0268 |
| article-large | 54,200 | 6.4568 | 2.6330 | 5.2832 | 3.1681 |
| prose | 20,480 | 0.8698 | 0.1327 | 0.3725 | 0.2393 |
| inline | 14,040 | 1.6165 | 0.7550 | 1.4753 | 0.8617 |
| lists | 10,400 | 1.6926 | 0.7611 | 1.8165 | 0.8459 |
| code | 12,600 | 0.6663 | 0.2942 | 0.2463 | 0.2947 |
| unicode | 16,000 | 1.1813 | 0.5577 | 0.8405 | 0.6035 |

| Compared with | Geometric-mean speedup | Throughput increase | Latency reduction |
| --- | ---: | ---: | ---: |
| MiniText baseline | 2.66× | 166.0% | 62.4% |
| marked | 1.83× | 82.8% | 45.3% |
| markdown-it | 1.20× | 20.3% | 16.9% |

The summary weights each workload equally; it is not a pooled response time or a statistical confidence interval. MiniText is faster in the measured median on six of seven workloads versus marked. On the code workload, marked is faster; MiniText and markdown-it are effectively tied (less than 0.2% apart). Small wins and overlapping trial ranges should not be treated as significant. The report exposes min/max trial medians as well as every timed sample.

The original build comes from commit `b5d236d4e2176a4b127a0b423b5a8b649afdd169` (source SHA-256 `4c08c695536ee7dbbbf89539406f27ad0c4f78e8219ec7c1b6621e018ebf0256`). It was compiled before source changes and compared again in the same rotated trials as the optimized engine. `performance-baseline.json` also preserves the original import/init/retention experiment.

Marked has GFM disabled. Markdown-it uses its CommonMark preset with HTML disabled. All seven controlled inputs use the shared supported syntax; output hashes must agree after the documented serializer normalization. This establishes output equivalence on these inputs, not equal grammar coverage. MiniText continues to return an AST and HTML, enforce budgets, escape raw HTML and restrict URLs. The compared competitor calls return HTML.

## Bundle size

esbuild browser/ES2022 ESM bundles, minify+tree-shake, gzip level 9, Brotli default. Comparisons report (reference - entry) bytes and 100 * (reference - entry) / reference percent. Feature-alone rows exclude the core; compression sizes are not additive. Other libraries implement broader Markdown grammars.

| Entry | Minified bytes | gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| MiniText render | 21,283 | 8,148 | 7,396 |
| MiniText parse | 15,755 | 6,347 | 5,746 |
| MiniText root (all exports) | 21,685 | 8,292 | 7,557 |
| MiniText browser | 22,253 | 8,563 | 7,776 |
| MiniText tables (feature alone) | 2,355 | 1,128 | 1,011 |
| MiniText strikethrough (feature alone) | 950 | 578 | 493 |
| MiniText task lists (feature alone) | 850 | 553 | 462 |
| MiniText rich text (feature alone) | 7,823 | 3,101 | 2,779 |
| MiniText embeds (feature alone) | 5,984 | 2,490 | 2,242 |
| marked | 47,745 | 14,305 | 13,083 |
| markdown-it | 149,703 | 53,196 | 44,496 |
| micromark | 53,795 | 15,742 | 14,018 |

| Smaller entry / reference | Minified savings | gzip savings | Brotli savings |
| --- | ---: | ---: | ---: |
| MiniText render / marked | 26,462 B (55.4%) | 6,157 B (43.0%) | 5,687 B (43.5%) |
| MiniText render / markdown-it | 128,420 B (85.8%) | 45,048 B (84.7%) | 37,100 B (83.4%) |
| marked / markdown-it | 101,958 B (68.1%) | 38,891 B (73.1%) | 31,413 B (70.6%) |

The optimization adds 1,824 minified bytes (9.4%) and 583 gzip bytes (7.7%) over the original MiniText render bundle. These are browser bundles, not npm archive or installed-directory sizes. The all-exports row shows the full root surface; optional features remain excluded from it. Lazy-loading assertions verify that tables stay in an independent chunk. Compression sizes are not additive. Competitors support broader grammars, so these are not equivalent-capability size rankings.

## Import, initialization and retained memory

Five isolated Node --expose-gc processes per engine and fixture size, rotated order, 30 warmups, 300 small / 15 large timed iterations, median across trials. Import excludes process launch. Retention holds 20 artifacts after explicit GC; MiniText render retains both AST and HTML, competitors retain HTML only. GC heap deltas are noisy, not peak RSS or allocation counts. No browser throughput claim. MiniText uses a smaller grammar, so results are workload-specific and not equivalent-compliance rankings.

| Engine | 542 bytes, ms | 54,200 bytes, ms | Small import, ms | Small initialization, ms |
| --- | ---: | ---: | ---: | ---: |
| MiniText | 0.0390 | 2.3085 | 4.552 | 0.1006 |
| marked | 0.0547 | 4.6738 | 10.665 | 0.1406 |
| markdown-it | 0.0585 | 2.7543 | 27.479 | 2.2225 |
| micromark | 0.4842 | 66.6383 | 27.284 | 0.0014 |

This original experiment has different warmup and sampling from the seven-workload suite. It consumes output length; the newer suite also forces HTML string materialization. Keep the two experiments separate. Parse-only and already-parsed-AST rendering remain separate rows in the raw report; do not add their medians to infer whole-pipeline latency.

| Engine | Observed retained bytes per 54,200-byte artifact |
| --- | ---: |
| MiniText | 928,435.6 |
| MiniText parse | 631,180.4 |
| MiniText AST render | 288,070.8 |
| marked | 366,849.6 |
| markdown-it | 519,381.2 |
| micromark | 78,197.6 |

Retention holds 20 artifacts after explicit GC, then releases them. These are noisy retained-heap observations, not peak RSS or allocation counts. MiniText retains both AST and HTML; the AST-render variant shares its prebuilt AST. String accumulation can retain ropes and this report does not establish a memory improvement.

## Correctness and browser checks

605 tests pass. Source coverage: 99.32% lines, 94.80% branches, 90.85% functions. Tests cover syntax, all 471 established CommonMark regressions, imported ASTs, plugins/transforms, UTF-8 accounting, output escaping, URL encoding, cancellation, resource limits, feature composition, headless edits and DOM lifecycle.

The full audit still matches 471/652 CommonMark 0.31.2 examples; all 181 differences remain in `conformance.json`. Additionally, an original-build differential run compared complete HTML, AST and diagnostics across all 652 official examples, 2,000 deterministic fuzz inputs and 495 resource-limit boundaries; every result agreed. The committed fast-path tests compare internal budget checks against full validation on every official example and the same 495 limit boundaries.

Real Chromium 153.0.8010.0 passed DOM reuse, focus preservation, atomic failures, disposal, inert output, semantic headers/checks and an accessibility-tree smoke check under CSP and Trusted Types. The pinned Playwright Chromium download was truncated in this environment; the local run used an isolated `@sparticuz/chromium` 153.0.0 binary, which is not a package dependency. CI installs Playwright Chromium normally. No browser throughput or assistive-technology certification claim is made.

## Reproduce

```sh
npm ci
npm run check
npm run test:coverage
npm run size
npm run bench:throughput
npm run bench
npm run conformance
npx playwright install chromium
npm run test:browser
```

To include the original engine in the throughput suite, build its committed source without changing the working tree:

```sh
mkdir -p benchmarks/.tmp/baseline-source
git archive b5d236d4e2176a4b127a0b423b5a8b649afdd169 src tsconfig.json tsconfig.build.json | tar -x -C benchmarks/.tmp/baseline-source
npx tsc -p benchmarks/.tmp/baseline-source/tsconfig.build.json
npm run bench:throughput -- --baseline=benchmarks/.tmp/baseline-source/dist/index.js
```

Re-measure after source, compiler or dependency changes. CI checks types, correctness, package exports, size isolation and conformance on Node 22/24, generates the seven-workload report on Node 24, and uploads the reports. Timing thresholds are deliberately not CI gates; normalized-output mismatches fail the throughput script.
