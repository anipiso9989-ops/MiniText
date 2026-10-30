# Projects selection

<a id="note-110e5274-42ea-4de2-ae8e-e39b49c0e68b"></a>

## The Mini Ecosystem — Architecture Reference


**Design principle**: Minimal size. Maximum capability. Extreme performance.

**Architecture status:** Proposed system design. This reference describes structure, boundaries, interfaces, and capabilities; it does not describe an implementation sequence.

## 1. System topology

The Mini Ecosystem consists of six independent TypeScript rendering engines, an optional shared contract package, and a separate composition layer.

| Product | Package | Architectural responsibility |
|---|---|---|
| MiniCode | `@mini/code` | Source tokenization, syntax highlighting, annotations, and code presentation |
| MiniText | `@mini/text` | Markdown parsing, document ASTs, extensions, and structured document rendering |
| MiniMath | `@mini/math` | Mathematical parsing, expression layout, visual markup, and MathML |
| MiniDiagram | `@mini/diagram` | Diagram parsing, graph models, layout, routing, and SVG output |
| MiniChart | `@mini/chart` | Data models, scales, chart geometry, backends, and interaction |
| MiniTable | `@mini/table` | Row models, sorting, filtering, selection, editing, and table/grid presentation |
| MiniRender | `@mini/render` | Engine discovery, composition, embedding, lazy loading, and lifecycle orchestration |
| MiniCore | `@mini/core` | Shared TypeScript contracts and narrowly scoped optional utilities |

The six engines are standalone products. Each has its own parsing or data-processing model, rendering pipeline, public API, and output artifacts. MiniRender sits above them as an integration layer, not as a prerequisite for their operation.

**Dependency topology**

```text
Application / Framework Adapters
              |
        MiniRender (optional)
              |
    Engine integration adapters
       /   /   |   \   \   \
    Code Text Math Diagram Chart Table

MiniCore: shared type contracts and optional utility subpaths
```

Engines have no runtime dependency on other Mini engines or on MiniRender. MiniRender has no mandatory runtime dependency on any specific engine. Integrations are explicit and application-selected. MiniCore has no universal scene graph, rendering scheduler, or domain-specific algorithms.

Shared declarations can be consumed through type-only imports. Small runtime helpers are exposed through independent subpaths; shared security utilities have a single maintained implementation. The architecture has no global engine registry or implicit registration side effects.

## 2. Repository and module boundaries

The ecosystem is organized as a pnpm/TypeScript workspace, separating distributable packages, framework adapters, development applications, consumer tests, and benchmarks.

```text
mini/
  packages/
    core/
    code/
    text/
    math/
    diagram/
    chart/
    table/
    render/
  adapters/
    react/
    vue/
    svelte/
  apps/
    docs/
    playground/
  tests/
    consumers/
    integration/
    security/
  benchmarks/
    fixtures/
    browser/
    server/
    bundles/
  tooling/
    build/
    release/
  pnpm-workspace.yaml
  pnpm-lock.yaml
  package.json
  tsconfig.base.json
```

An engine has a compact domain-oriented internal layout. Directories exist only where the domain uses them.

```text
packages/<engine>/
  src/
    index.ts
    parse/          # where source parsing applies
    model/
    layout/         # where geometry or layout applies
    backends/
    features/
    browser/
    integration.ts
  tests/
  package.json
  tsconfig.json
```

Published packages expose an ESM root entry point and TypeScript declarations. Optional subpath exports distinguish browser mounting, individual features, backend implementations, integration adapters, and style assets. Internal implementation files remain outside the public export map.

```text
@mini/<engine>                Base, server-safe API
@mini/<engine>/browser        Browser mounting and interaction
@mini/<engine>/<feature>      Optional domain feature
@mini/<engine>/integration    MiniRender protocol adapter
@mini/<engine>/styles.css     Explicit style asset, where applicable
```

Core imports do not access browser globals at module evaluation. Optional features are isolated into separately importable or dynamically loadable modules. CSS assets are represented explicitly rather than injected as hidden import-time behavior. Framework adapters depend on engine APIs but engines remain framework-agnostic.

## 3. Shared rendering contract

The shared API model has two complementary layers:

1. **Pure rendering:** typed input and options produce an artifact plus diagnostics, without requiring a DOM.
2. **Mounted rendering:** a browser view manages interactive state, updates, events, and disposal.

Illustrative protocol types:

```ts
export interface Diagnostic {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly range?: readonly [start: number, end: number];
}

export interface RenderLimits {
  readonly maxInputBytes: number;
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxOutputBytes: number;
}

export interface RenderContext {
  readonly idPrefix: string;
  readonly limits: RenderLimits;
  readonly signal?: AbortSignal;
}

export type RenderResult<A> =
  | { readonly ok: true; readonly artifact: A; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export interface Engine<I, O, A> {
  render(input: I, options: Readonly<O>, context: RenderContext): RenderResult<A>;
}

export interface View<I> {
  update(input: I): void;
  dispose(): void;
}
```

These interfaces represent an architectural protocol, not frozen public API signatures. Each engine can expose a simpler user-facing convenience API above this contract.

Pure rendering is deterministic for a fixed input, configuration, resource set, and geometry context. Loaded synchronous rendering and asynchronous activities such as module loading, font preparation, and worker execution are distinct operations. Input errors are represented through diagnostics; programming failures are separate from input validation. Cancellation and stale-result handling are part of mounted and orchestrated lifecycle semantics.

**Artifacts retain their domain shape:**

| Engine | Artifact families |
|---|---|
| MiniCode | Token trees, highlighted HTML, annotation metadata |
| MiniText | Document AST, safe HTML, structural metadata, embed descriptors |
| MiniMath | Mathematical box layout, visual markup, MathML, metrics |
| MiniDiagram | SVG, graph geometry, node/edge metadata |
| MiniChart | SVG or backend-specific drawing representation, chart metadata |
| MiniTable | Processed row model, semantic HTML, grid state |

HTML, SVG, Canvas commands, MathML, and data models are not compressed into a single universal artifact type. Cross-engine compatibility is expressed through declared capabilities and explicit conversions.

## 4. Engine-specific pipelines

The general internal flow is:

**Input validation → parsing/normalization → domain model → transformation/layout → artifact emission → optional browser mounting**

| Engine | Domain pipeline | Base capability surface | Extension surface |
|---|---|---|---|
| MiniCode | Source → grammar → token model → decorations → HTML | Plain text and modular syntax highlighting | Stateful grammars, formatting, diff views, interactive code |
| MiniText | Markdown → block/inline AST → transforms → safe HTML | Defined CommonMark-compatible Markdown profile | Tables, embedded content, rich-document schema, editing |
| MiniMath | TeX-like input → math AST → macro expansion → layout boxes → markup | Defined mathematical notation subset | Advanced notation, line breaking, typed visualizations |
| MiniDiagram | Diagram syntax → AST → graph → measurements → layout/routing → SVG | Flowcharts | Mind maps, workflows, complex routing, editing |
| MiniChart | Typed data → validation → domains/scales → geometry → backend | SVG line, bar, and scatter plots | Area, pie, Canvas, decimation, streaming, complex interaction |
| MiniTable | Rows → filter/sort → pagination/windowing → table/grid view | Static and paginated semantic tables | Virtualization, editing, selection, server-managed data |

### MiniCode — `@mini/code`

MiniCode centers on a language-neutral token model. Language grammars, themes, annotations, and interactive presentations are separate capabilities. The highlighting pipeline is distinct from formatting, which has language-specific syntactic requirements. Source text remains inert data and is never executed by the highlighting engine. Shiki and Prism are design references, not mandatory shared runtime dependencies.

### MiniText — `@mini/text`

MiniText centers on a document AST with independent block, inline, transform, and output stages. A documented CommonMark-compatible syntax profile defines the core Markdown behavior. Embedded content appears as structured nodes rather than discovered markup strings. Raw HTML parsing and safe output are separate concerns; the default HTML artifact is safe, with richer markup governed by explicit sanitization integrations.

### MiniMath — `@mini/math`

MiniMath uses a mathematical AST, controlled macro expansion, expression layout boxes, font/glyph metrics, and separate visual and semantic outputs. MathML is part of the accessibility representation. Mathematical visualizations receive typed models rather than executable expressions. KaTeX supplies an architectural and compatibility reference, while MiniMath's public interface remains independent of any particular renderer implementation.

### MiniDiagram — `@mini/diagram`

MiniDiagram uses a diagram AST and graph model with distinct node measurement, layout, edge routing, and SVG emission. Geometry includes dimensions, connection points, and label metrics. Flowcharts, mind maps, and workflow features share foundational graph abstractions but can have specialized layouts. Pele is a candidate technical foundation and provenance reference, not an assumed built-in dependency.

### MiniChart — `@mini/chart`

MiniChart separates typed data and scales from geometry, backend drawing, and interaction. SVG is the deterministic, inspectable static rendering path. Canvas and WebGL are independent backends with workload-specific capabilities. Interaction state, animation, and incremental data updates sit above the geometry model. Accessible data representations are independent of the visible drawing backend.

### MiniTable — `@mini/table`

MiniTable has a headless data-processing layer separate from semantic HTML and interactive grid views. Stable row identifiers connect data updates with selection and editing state. Client-managed and server-managed filtering, sorting, and pagination have distinct state ownership. Virtualized rendering is a view capability; the semantic table and nonvirtual representation remain available independently.

## 5. MiniRender composition architecture

MiniRender is an optional orchestration engine with responsibilities limited to engine resolution, embedding, resource preparation, scheduling, nested lifecycle management, event routing, and composition diagnostics. Domain-specific parsers, table algorithms, mathematical layout, diagram layout, and chart scales remain inside their respective engines.

Applications supply engine integration adapters through an explicit loader map. Each adapter declares a protocol version, supported input and artifact types, environment capabilities, and optional measurement or mounting functions. Engine code enters the application bundle only through selected imports and loaded chunks.

**Structured embed descriptor:**

```ts
export interface EmbedDescriptor {
  readonly version: 1;
  readonly id: string;
  readonly engine: string;
  readonly input: unknown;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly fallbackText: string;
}
```

At the integration boundary, `unknown` denotes data requiring runtime validation by the selected adapter. Application-authored embeds can also have a typed builder representation.

| Composition concern | Architectural model |
|---|---|
| Discovery | Explicit embed nodes in the host's data model |
| Resolution | Application-supplied adapter loader map and deduplicated loads |
| Compatibility | Versioned integration protocol and declared artifact capabilities |
| Geometry | Width constraints, intrinsic dimensions, and optional baseline metrics |
| Nested content | Bounded recursion, child limits, and reference-cycle detection |
| Failure isolation | Local fallback artifacts and structured diagnostics |
| Lifecycle | Parent-owned child disposal and cancellation propagation |
| Updates | Stable embed IDs and compatible child instance reuse |
| Security | Effective host/child policy intersection |
| Events | Namespaced typed events with explicit routing |

Cross-engine composition depends on host and child capabilities. SVG charts can exist within HTML documents; code tokens can appear in table cells; math inside diagram labels requires an SVG-compatible artifact and baseline metrics. HTML-only content is not automatically equivalent to Canvas drawing operations. SVG `foreignObject` is an optional compatibility technique, not the universal embedding mechanism.

Geometry-sensitive composition uses a bounded measurement/layout relationship: host constraints determine child measurement, and resulting dimensions inform host layout. Responsive child updates operate within declared constraints, limiting circular reflow. Resource loads and rendering generations are tracked so obsolete asynchronous results do not replace newer output.

## 6. Runtime and rendering backends

| Environment | Architecture surface |
|---|---|
| Browser | Pure rendering, HTML/SVG output, optional DOM or Canvas mounting |
| Node/server | Parsing, domain layout, HTML/SVG serialization, static artifacts |
| SSR/SSG | Deterministic artifacts with stable IDs and explicit geometry |
| Web Worker | Serializable parsing/layout jobs and compatible drawing operations |
| Streaming | Completed structural block/embed units, cancellation, backpressure |

Environment-specific dependencies are isolated behind adapters. Browser measurement providers can supply font and text metrics; server rendering uses declared dimensions and deterministic metrics. Hydration is a separate capability with version, option, ID, state, and font-metric compatibility requirements; static SSR and subsequent mounting do not depend on it.

Worker boundaries carry versioned serializable messages, not functions or live engine instances. Worker termination is distinct from cooperative cancellation.

Native artifacts include HTML, SVG, MathML, and JSON where the relevant engine supports them. Raster image export, PDF generation, font embedding, and other conversions are optional adapters. Backends have explicit capability matrices rather than an assumption of universal feature parity.

## 7. Security and accessibility architecture

Rendering operates across explicit trust boundaries: source input, parsed model, plugins, serialized data, output artifacts, and browser mounting. Text and attributes use context-specific encoding. URL protocols and SVG attributes are validated. Raw markup, external resources, and expression evaluation are disabled by default; richer content has explicit policy and sanitizer integrations.

Parser, expansion, nesting, output, and resource limits are carried in rendering context. Regex grammars, math macros, nested embeds, and large graph/data models are governed by domain-specific extensions of those limits. Plugins are trusted application code rather than a security sandbox. Rendering behavior is compatible with restrictive content-security policies, without reliance on dynamic code evaluation or inline event handlers.

Accessibility is represented at the semantic-model and artifact layers, not exclusively as a browser view enhancement.

| Engine | Accessibility representation |
|---|---|
| MiniCode | Selectable source and non-color-only annotation descriptions |
| MiniText | Semantic document structure, headings, links, and lists |
| MiniMath | MathML and readable mathematical fallback |
| MiniDiagram | Title, description, and textual node/relationship representation |
| MiniChart | Chart summary, data alternative, and keyboard interaction model |
| MiniTable | Native table semantics; explicit grid behavior for interactive mode |

Canvas and WebGL visual output are paired with a semantic representation. Virtualized grids retain an accessible nonvirtual or paginated path.

## 8. Runtime footprint and state architecture

The distributable surface has a small base and separately resolved optional features. Heavy grammars, uncommon syntax extensions, specialized layouts, interaction layers, raster/PDF exporters, and advanced backends are isolated from unrelated imports. Tree-shaking removes unused exports from bundled modules; lazy loading defers optional modules until they are requested.

Engine instances own their mutable state and bounded caches. Cache identities incorporate relevant input, options, engine versions, font resources, and viewport characteristics. Process-global caches are not a dependency of correctness and do not retain application content by default.

Incremental rendering is domain-specific:

| Engine | Reuse granularity |
|---|---|
| MiniCode | Unchanged tokens or source regions where grammar state permits |
| MiniText | Unchanged document blocks and subtrees |
| MiniMath | Validated expression subtrees and layout measurements |
| MiniDiagram | Stable graph nodes, edges, and geometry where dependencies permit |
| MiniChart | Unchanged scales, series, or geometry regions |
| MiniTable | Stable keyed rows, derived row models, and visible windows |

Whole-layout invalidation remains part of each engine's correctness model when dependencies cross incremental boundaries. Memory ownership, disposal, resource loading, and output generation are explicit parts of the engine and view lifecycle.

## 9. Relationship to existing ecosystems

External libraries are technical references rather than automatic dependencies or guarantees of compatibility:

- **MiniDiagram:** Pele and established graph-layout techniques.
- **MiniText:** CommonMark and structured-document systems.
- **MiniMath:** KaTeX and mathematical typesetting systems.
- **MiniCode:** Shiki, Prism, and language grammar ecosystems.
- **MiniChart:** Chart.js, Recharts, and visualization scale/geometry systems.
- **MiniTable:** TanStack Table, DataTables, and headless data-grid systems.

The architectural distinction of Mini is an independent, domain-specific core per engine plus an optional, capability-based composition layer. Each package has its own useful standalone surface; MiniRender connects only the packages an application chooses to use.
