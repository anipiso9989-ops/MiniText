# MiniText · `@mini/text`

An independent TypeScript Markdown and rich-document engine. A small document AST connects parsing, transforms, safe HTML output and optional features. Zero runtime dependencies; no framework, browser global, registry, CSS injection or retained document cache in the root module.

**Status:** working 0.1 implementation with a defined Markdown profile, not full CommonMark or GFM compliance. See the [syntax profile](docs/syntax-profile.md) and the complete [compatibility audit](benchmarks/results/conformance.json). This repository is not yet published to npm.

## Build and use

Requires Node 22.18+ for development and server use; browser output targets ES2022.

```sh
npm ci
npm run check
npm pack
```

Install the generated tarball in a consumer, then:

```ts
import { createMiniText } from '@mini/text';

const text = createMiniText();
const result = text.render('# Hello, **Ani**');
if (result.ok) {
  console.log(result.artifact.html);
  // <h1>Hello, <strong>Ani</strong></h1>\n
  console.log(result.artifact.document); // serializable document AST
} else {
  console.error(result.diagnostics);
}
```

`parse(source, options)` returns `Result<Document>`. `render(sourceOrDocument, options)` returns `Result<{html, document}>`. `validateDocument(unknown, options)` validates imported structured data without cloning it. Every result has diagnostics. Resource limits, cancellation and malformed ASTs return failure results. Invalid configuration and plugin programming errors throw.

```ts
import { parse, render } from '@mini/text';

const parsed = parse('One **document**, many outputs.');
if (parsed.ok) {
  const output = render(parsed.artifact);
  // AST input is validated; transforms are not applied a second time.
}
```

## Optional features and lazy loading

```ts
import { createMiniText } from '@mini/text';

// The application chooses when these chunks load.
const [{ tables }, { taskLists }, { strikethrough }] = await Promise.all([
  import('@mini/text/tables'),
  import('@mini/text/task-lists'),
  import('@mini/text/strikethrough'),
]);
const text = createMiniText({ extensions: [tables, taskLists, strikethrough] });
const result = text.render('Name | Status\n--- | ---\nAni | ~~waiting~~ ready');
```

For table alignment classes, explicitly import `@mini/text/styles.css` or supply equivalent CSS. No style is injected automatically. Feature instances can be shared because bundled extensions have no mutable state. Configuration and extension order belong to the caller.

| Entry | Purpose |
| --- | --- |
| `@mini/text` | Markdown, AST validation, safe HTML, instance configuration, protocol result types |
| `@mini/text/tables` | Pipe-table profile with semantic column headers |
| `@mini/text/task-lists` | List task markers and labeled, disabled checkboxes |
| `@mini/text/strikethrough` | Explicit two-tilde inline syntax |
| `@mini/text/rich-text` | JSON, text edits, marks, child splices, outline, bounded undo/redo |
| `@mini/text/embeds` | Versioned structured embed descriptors and inert fallback rendering |
| `@mini/text/browser` | Mounted view, updates, unchanged block reuse, disposal |
| `@mini/text/integration` | Optional MiniRender protocol-v1 adapter with intersected budgets |

## Rich documents

```ts
import { parse } from '@mini/text';
import { applyMark, replaceText, createHistory, toJSON } from '@mini/text/rich-text';

const parsed = parse('Hello world\n\nKeep this block.');
if (parsed.ok) {
  const history = createHistory(parsed.artifact, 50);
  const edited = replaceText(history.document, [0, 0], 6, 11, 'Ani');
  if (edited.ok) history.commit(edited.artifact);
  const marked = applyMark(history.document, [0, 0], 6, 9, 'strong');
  if (marked.ok) history.commit(marked.artifact);
  const saved = toJSON(history.document);
  history.undo();
}
```

Paths are child indices from the document root. Edits copy changed ancestors and share untouched subtrees. Nodes are readonly by convention; do not mutate accepted trees or shared extension data. Text offsets use UTF-16; edits reject offsets inside surrogate pairs. These are headless rich-text operations, not a WYSIWYG editor, HTML importer or collaboration system.

## Browser mounting

```ts
import { mount } from '@mini/text/browser';

const mounted = mount(document.querySelector('article')!, '# Initial');
if (mounted.ok) {
  mounted.artifact.update('# Updated');
  mounted.artifact.dispose();
}
```

The view owns the host's children. Failed renders preserve the previous DOM. Updates parse the full input and reuse equal prefix/suffix DOM blocks; this is not incremental Markdown parsing or hydration. Do not modify the host while it is mounted. Disposing releases owned node references and retained HTML. See [CSP and Trusted Types](docs/security.md) for a custom sink.

## Security and limits

Raw HTML is escaped. Text and attributes are encoded. URL schemes are restricted. Images are text alternatives unless `images: true` is selected; enabling images permits external image requests. Plugins are trusted application code and return structured output, not raw HTML. No eval, executable expressions, inline event handlers, SVG or iframes are emitted.

```ts
const controller = new AbortController();
const text = createMiniText({
  limits: { maxInputBytes: 200_000, maxNodes: 20_000, maxDepth: 32, maxOutputBytes: 800_000, maxWork: 2_000_000 },
  signal: controller.signal,
});
```

See [security](docs/security.md), [API and extensions](docs/api.md), [architecture](docs/architecture.md), and [research and tradeoffs](docs/research.md). The [approved ecosystem reference](docs/architecture-reference.md) supplies the architectural boundaries; it is not a claim that every ecosystem capability is implemented here.

## Validation and measurements

```sh
npm run check            # types, unit/security/fuzz/spec regressions, build, consumer smoke
npm run test:coverage    # instrumented source coverage
npm run size             # minified/gzip/Brotli, competitors, lazy chunk assertions
npm run bench            # isolated server import/init/render/retained-heap trials
npm run conformance      # all 652 CommonMark examples; records every mismatch
npx playwright install chromium
npm run test:browser     # real Chromium, semantics, focus, CSP + Trusted Types
```

Committed [raw reports](benchmarks/results) include environment, pinned dependency versions and a source hash. [Measurement notes](docs/benchmarks.md) explain scope and limitations. Competitors support broader grammars and produce different artifacts; no universal speed, memory or compliance advantage is claimed.

MIT for the implementation. The official CommonMark fixture has its own [CC BY-SA 4.0 notice](benchmarks/fixtures/README.md).
