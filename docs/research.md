# Design references and measured tradeoffs

Studied primary sources, 2026-10-30. These are architectural references, not copied implementations or mandatory runtime dependencies.

| Reference | Relevant design | MiniText decision and cost |
| --- | --- | --- |
| [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) | Separates block structure and inline parsing; defines delimiter/link precedence and official examples | Independent block/inline stages and delimiter cells. Ship a named subset and audit all examples rather than claim complete compatibility. |
| [markdown-it architecture](https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md) | Independent rule chains, a token stream with open/close tokens, customizable rendering | Use domain-shaped AST nodes directly because rich-document operations need them. Keep hooks instance-local. AST construction/validation has measurable cost; token streams remain a good choice for HTML-only consumers. |
| [micromark](https://github.com/micromark/micromark) | Small CommonMark tokenizer, explicit extension interfaces, safe defaults, extensive conformance/fuzz tests; warns about pathological input | Safe output defaults, expansion/work limits, deterministic fuzz tests and an official-example corpus. MiniText's smaller grammar has fewer compatibility guarantees. |
| [Marked advanced usage](https://marked.js.org/using_advanced) and [extension API](https://marked.js.org/using_pro) | A configurable lexer/parser pipeline, per-instance options and extensibility | No global registry; immutable instance configuration. Default safe generation is part of MiniText's output stage. Marked's docs explicitly require separate sanitization for untrusted HTML output. |
| [ProseMirror guide](https://prosemirror.net/docs/guide/) | Schema-constrained document values, structural sharing, explicit transformations and separate editor state/view | One validated document model and path-copying headless edits. Avoid editor/selection/collaboration state in the base. The small editing API is substantially narrower than ProseMirror. |

## Opportunities addressed

Direct AST reuse removes a required token-stream-to-document conversion for applications that need both Markdown and structured documents. Optional modules remove a required dependency on editing/UI/table/embed code for plain rendering. Safe generation avoids adding an HTML sanitizer when raw HTML is deliberately excluded. Explicit budgets expose failure modes at source, model and output boundaries. Caller-owned history and cache-free pure rendering make retained-content ownership explicit.

These are design choices with observable behavior, not universal performance improvements. The bundle report verifies module isolation and reports actual compressed bytes. The performance report measures import, initialization, first render, warm throughput and retained artifacts. The compatibility report exposes grammar differences. Smaller size partly reflects that narrower grammar.

## What measurements do not establish

The optimized render path is compared with marked and markdown-it across seven shared-profile workloads in [the measurement notes](benchmarks.md). Results vary with syntax, document size and warmup; the raw report retains every trial and all slower cases. MiniText keeps an AST and HTML; the competitors' measured calls return HTML only. Heap measurements are noisy, and small negative GC deltas remain visible. No universal speed, memory-efficiency or equivalent-compliance claim follows from these data.

Measured optimizations target schema revalidation, ordinary-text scanning, escaping, byte accounting and transient allocations while preserving the public result shape and resource limits. These paths add bundle bytes; the size report quantifies that tradeoff. Full CommonMark, a complete entity table, source positions and incremental parsing should each have independent compatibility/size/performance budgets. They should not be added merely to increase feature count. Correctness and explicit boundaries remain the baseline.
