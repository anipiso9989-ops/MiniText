# API and extension contracts

## Results

`Result<T>` is `{ok:true, artifact:T, diagnostics:Diagnostic[]}` or `{ok:false, diagnostics:Diagnostic[]}`. Diagnostics include a stable code, severity and message. This version does not attach source ranges. Typical failure codes are `MAX_INPUT_BYTES`, `MAX_NODES`, `MAX_DEPTH`, `MAX_OUTPUT_BYTES`, `MAX_WORK`, `CANCELLED`, `INVALID_AST`, `INVALID_JSON`, `INVALID_PATH` and `INVALID_RANGE`.

Malformed Markdown syntax generally becomes literal text. Schema/resource errors produce diagnostics. Invalid options, duplicate extension names, zero-progress tokenizer matches and plugin programming failures throw. Plugins may deliberately throw the exported `InputError` to report invalid feature data.

## Document shape

`Document` contains blocks. Paragraphs and headings contain inlines; blockquotes and list items contain blocks; lists contain list items. Text and code are separate leaves. Links cannot contain links. Images contain alt text rather than arbitrary markup. The AST is serializable and has no DOM references, functions, parent pointers, classes or hidden registrations.

An extension node has `{type:'extension', kind, name, data, fallback, children}`. `data` must be finite, cycle-free JSON. `kind` identifies its position. Optional `content` changes the child kind (a block table cell can contain inline content); inline nodes cannot contain blocks. Missing renderer registrations emit escaped `fallback` text. Imported values should be plain JSON objects, not proxies or objects with executable getters.

## Extension stages

An extension has a unique `name` and optional hooks:

| Hook | Contract |
| --- | --- |
| `block(context)` | Return `{lines, node}` or `undefined`; `lines` must consume at least one remaining line |
| `inline(context)` | Return `{length, node}` or `undefined`; `length` must consume at least one remaining UTF-16 unit |
| `listItem(context)` | Return a list item or `undefined`; receives extracted raw item lines before inline parsing |
| `transform(document)` | Return a document; runs once for source parsing, after earlier transforms |
| `validate(node)` | Validate registered feature data on every document validation pass |
| `render(node, children)` | Return structured `Output`; strings are always escaped text |

Tokenizer contexts expose recursive `parse`, `inline` or `blocks` helpers as appropriate. `tick(amount)` accounts for scanning and failed lookahead; `node(value)` accounts for nodes allocated inside a feature. Use these for potentially expanding syntax. Helpers share the current parser budget and nesting depth. Bundled extensions follow these rules. Arbitrary plugin code is trusted and cannot be forcibly interrupted by the engine.

Hooks run in the supplied array order; the first matching tokenizer wins. Transforms run in array order. Rendering resolves by exact extension name. No mutable global registration API exists.

```ts
import { createMiniText, type Extension } from '@mini/text';

const badge: Extension = {
  name: 'badge',
  inline({ source, index }) {
    if (!source.startsWith(':ok:', index)) return;
    return { length: 4, node: {
      type: 'extension', kind: 'inline', name: 'badge',
      data: null, fallback: 'OK', children: [],
    } };
  },
  render() { return { tag: 'strong', children: ['OK'] }; },
};
const text = createMiniText({ extensions: [badge] });
```

Output tags and attributes use a fixed allowlist in the HTML backend. Event attributes, styles, raw HTML, SVG, iframes and script tags are unavailable. `href` and `src` share the core URL policy. Output depth, work and byte budgets apply to extension output too. Invalid output tags/attributes indicate a plugin programming error. Registered plugins are responsible for their semantic schema and accessible output.

## Rich-text subpath

`fromJSON` parses bounded JSON and validates its model. `toJSON` validates and serializes. `replaceText(document,path,from,to,text)`, `applyMark(document,path,from,to,mark)` and `spliceChildren(document,parentPath,index,remove,insert)` return new documents, with unchanged subtrees shared. They reject edits that violate the schema. Marks are `emphasis` or `strong`. Positions are UTF-16 and surrogate-pair aware, not grapheme-cluster selections. `outline` returns heading levels, plain text and child-index paths.

`createHistory(document,capacity,options)` returns `document`, `commit`, `undo`, `redo` and `clear`. Commit validates, clears redo on a new branch and bounds retained past versions. History is local and not a collaborative transaction protocol. Callers must honor AST immutability.

## Embeds and composition

`embed({version:1,id,engine,input,options?,fallbackText})` creates a structured block leaf. IDs and engine names have conservative syntax limits. `collectEmbeds(document)` validates descriptors, rejects duplicate IDs and returns their data. The optional `embeds` renderer produces semantic fallback figures. No Markdown string, URL or generated HTML triggers engine execution.

The `textEngine` integration export declares protocol version 1, Markdown/document inputs and HTML/document artifacts. Its render method intersects child and host budgets and combines cancellation signals. `idPrefix` is reserved; core output creates no automatic IDs. The host controls engine loaders, effective resource policy and child lifecycle. This adapter alone does not implement MiniRender.
