# Implementation architecture

MiniText is a standalone repository containing one distributable engine package. Creating six empty workspace packages would add structure without behavior. The package can move unchanged into `packages/text` in the proposed pnpm ecosystem workspace.

| Stage | Implementation | Boundary |
| --- | --- | --- |
| Input validation | `src/limits.ts` | UTF-8 bytes, node/depth/work budgets, cancellation |
| Block parsing | `src/parse/block.ts` | Lines → document blocks; optional block/item hooks |
| Inline parsing | `src/parse/inline.ts` | Text/code/links; linked delimiter cells for emphasis |
| Domain model | `src/model/types.ts` | Plain, readonly, JSON-compatible tagged nodes |
| Schema validation | `src/model/validate.ts` | Child kinds, attributes, cycles, feature data, limits |
| Transforms | Instance-selected extensions | Applied after parsing; every resulting tree validated |
| HTML backend | `src/backends/html.ts` | Bounded output, fixed markup, structured extension output |
| Security helpers | `src/security.ts` | One encoding/entity/URL policy implementation |
| Rich document operations | `src/features/rich-text.ts` | Path copying and caller-owned history |
| Browser mounting | `src/browser.ts` | DOM lifecycle and equality-based block reuse |
| Integration | `src/integration.ts` | Explicit versioned adapter, no engine dependency |

## State and resource ownership

Each call owns its source normalization, parser cells, AST validation sets and output chunks. No process-global cache retains application documents. `createMiniText` snapshots configuration and extension objects; it does not initialize a parser, create a DOM or populate a registry. Plugin closures remain application-owned.

Nodes have no parent pointers. Headless edits copy the modified path and share all other nodes. History intentionally retains versions up to its caller-selected capacity and provides `clear()`. Browser views retain only the latest HTML and owned DOM references. A caller may retain returned artifacts independently.

Parsing and schema validation are separate passes. This adds work, measured in the benchmark, and makes the imported-AST boundary explicit. Transforms validate after each extension. No unsafe fast path bypasses validation. Input bytes, intermediate parser nodes and failed lookahead are checked before unbounded allocation/iteration; table cells account for padded expansion as they are created.

## Modularity

The ESM export map exposes a server-safe root and explicit feature/browser/integration/style paths. Root imports do not reference optional feature modules. Browser bundling checks inspect the esbuild module graph. A dynamic tables import is tested to produce a separate chunk. JavaScript has no import-time registration or style side effects; the explicit CSS asset is marked as a side effect so bundlers preserve deliberate CSS imports.

There is no runtime dependency on MiniCore, MiniRender or another engine. Protocol types are structural TypeScript declarations. Security logic has one local implementation; it can later move to a narrow shared security subpath without introducing a mandatory engine dependency.

## Advanced capabilities implemented

Tables, task markers, strikethrough and embed fallbacks are optional extensions. Rich-document JSON, immutable text/mark/child edits, bounded history and structural outline metadata use the same AST. DOM updates preserve equal prefix/suffix blocks and focus within reused descendants. Structured embed descriptors are collected explicitly and never discovered from markup or automatically executed.

## Explicit remaining work

Full CommonMark/GFM, reference links, a complete HTML entity table, HTML import/sanitizer adapters, WYSIWYG selection/editing, collaboration, incremental source parsing, streaming, hydration and worker transports are not implemented. The pure APIs work without a DOM and can run inside a worker; this does not imply a built-in worker scheduler or transport. MiniRender owns actual engine loading, nested views, cancellation propagation and composition policy.
