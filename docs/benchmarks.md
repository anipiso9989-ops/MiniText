# Recorded measurements

Recorded 2026-10-30T22:02:40.307Z on v24.22.1, AMD EPYC 9V74 80-Core Processor, linux 6.18.57 x64.

Source SHA-256: `4c08c695536ee7dbbbf89539406f27ad0c4f78e8219ec7c1b6621e018ebf0256`. Raw reports include all trials, exact versions and methodology. These results describe this environment and workload, not universal rankings.

## Bundle size

esbuild browser/ES2022 ESM, minification and tree shaking, gzip level 9 and Brotli defaults. Feature modules are excluded from root graphs; the lazy-import check verifies a separate tables chunk and no optional features in the initial static graph.

| Entry | Minified bytes | gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| MiniText render | 19,459 | 7,565 | 6,898 |
| MiniText parse | 14,280 | 5,873 | 5,348 |
| MiniText root (all exports) | 19,861 | 7,717 | 7,029 |
| MiniText browser | 20,429 | 7,980 | 7,265 |
| MiniText tables (feature alone) | 2,355 | 1,128 | 1,011 |
| MiniText strikethrough (feature alone) | 950 | 578 | 493 |
| MiniText task lists (feature alone) | 850 | 553 | 461 |
| MiniText rich text (feature alone) | 7,756 | 3,075 | 2,766 |
| MiniText embeds (feature alone) | 5,917 | 2,462 | 2,205 |
| marked | 47,745 | 14,305 | 13,083 |
| markdown-it | 149,703 | 53,196 | 44,496 |
| micromark | 53,795 | 15,742 | 14,018 |

Feature-alone figures exclude the core and share helpers when composed; compressed sizes are not additive. Marked, markdown-it and micromark support broader grammars. Size differences therefore do not establish equivalent-capability superiority.

## Server rendering

One original 542-byte article and a 100-times repeated 54,200-byte workload. Five fresh processes per engine/size, rotated order, 30 warmups, then 300 small or 15 large timed iterations. Rows show medians of per-process warm medians. Import excludes process launch; initialization excludes first render.

| Engine | 542 bytes, ms | 54,200 bytes, ms | Small import, ms | Small initialization, ms |
| --- | ---: | ---: | ---: | ---: |
| MiniText | 0.0836 | 6.3339 | 4.399 | 0.1048 |
| marked | 0.0581 | 5.0643 | 11.360 | 0.1645 |
| markdown-it | 0.0578 | 2.6855 | 30.838 | 2.3622 |
| micromark | 0.5777 | 61.5865 | 31.783 | 0.0016 |

MiniText is slower than marked and markdown-it on these warm render workloads. Its result retains both an AST and HTML; the compared calls return HTML. Marked is configured with GFM disabled; markdown-it uses its CommonMark preset with HTML disabled; micromark uses safe defaults. No input contains optional syntax, raw HTML, reference links or unsafe URLs. This is a shared simple workload, not equal-compliance or equal-artifact work.

MiniText parse-only and already-parsed-AST rendering are recorded separately in the raw report. The AST-render initialization column includes preparing the input AST; it is not engine-construction time. Do not add medians from separate experiments to infer a whole-pipeline latency.

## Memory ownership

The worker measures initialized heap after explicit GC and the heap difference while holding 20 artifacts, then after releasing them. These are retained-heap observations, not peak RSS, allocation counts or a leak proof. Negative small-input deltas remain visible in the raw report and indicate measurement noise.

| Engine | Observed retained bytes per 54,200-byte artifact |
| --- | ---: |
| MiniText | 814,129.6 |
| MiniText parse | 739,912.0 |
| MiniText AST render | 71,792.4 |
| marked | 366,955.2 |
| markdown-it | 519,822.4 |
| micromark | 78,230.4 |

MiniText retains more than the HTML-only calls on this fixture. The AST-render variant shares its prebuilt AST outside the measured retained-artifact difference. The implementation keeps no global content cache; history and mounted views have explicit ownership. These facts do not imply lower memory use than other parsers.

## Correctness and browser checks

598 tests pass, including 471 official-example regressions, purpose-written syntax tests, imported-AST validation, URL/markup attacks, bounded adversarial inputs, 400 deterministic fuzz cases, feature composition, rich-text editing/history and DOM lifecycle tests. Node source coverage reports 99.27% lines, 94.16% branches and 89.71% functions. The fuzz iterations occur inside one test; they are not added to the 598 test count.

The full CommonMark audit matches 471/652 examples after the documented normalization. All 181 differences are retained in `benchmarks/results/conformance.json`. No full CommonMark or GFM claim is made.

Real Chromium 153.0.8010.0 passed DOM reuse, focus preservation, atomic failures, disposal, inert output, semantic headers/checks and an accessibility-tree smoke check under CSP and Trusted Types. The standard Playwright binary download was unavailable in this environment; this local run used an externally supplied `@sparticuz/chromium` 153.0.0 binary. That fallback is not a package dependency. CI installs Playwright's pinned Chromium normally. No browser performance comparison or assistive-technology certification was performed.

## Reproduce

```sh
npm ci
npm run check
npm run test:coverage
npm run size
npm run bench
npm run conformance
npx playwright install chromium
npm run test:browser
```

All JSON reports include the source hash. Re-measure after source/compiler/dependency changes. Reports are committed snapshots; normal CI verifies correctness and bundle isolation and produces fresh report artifacts, but intentionally does not enforce noisy timing thresholds.
