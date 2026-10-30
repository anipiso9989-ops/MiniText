# Security and accessibility

## Trust boundaries

Source Markdown and imported JSON are untrusted data. Direct JavaScript objects should be plain JSON-like values without getters or proxies. Extensions, sinks, configuration and callbacks are trusted application code. A plugin is not a security sandbox.

The root never parses or trusts raw HTML. It escapes source text and attributes and uses fixed tags for known AST nodes. Extension renderers return structured output; unknown tags/attributes throw. Scripts, event handlers, styles, SVG, iframes, forms and arbitrary markup strings are unavailable. This is safe generation, not a general-purpose HTML sanitizer. Applications accepting HTML must separately sanitize and convert it through a schema-aware integration; no HTML importer ships here.

URL destinations are entity-decoded during parsing and checked again during emission, including imported ASTs and extension output. Allowed link schemes are HTTP, HTTPS, mailto and tel; relative paths and fragments are allowed. Images allow HTTP/HTTPS/relative paths only and require `images:true`. Controls, backslashes, network-path references and other schemes are rejected. Unsafe links retain their children as inert text; disabled/unsafe images retain alt text. Unicode and spaces are percent-encoded after policy checks.

This prevents executable URI output under the stated policy. It does not decide whether an allowed HTTPS destination is trustworthy. Applications own navigation policy, content provenance and remote image permission.

## Bounds

| Limit | Default |
| --- | ---: |
| Source/AST text UTF-8 bytes | 1,000,000 |
| Nodes | 100,000 |
| Depth | 64 |
| HTML/JSON output UTF-8 bytes | 4,000,000 |
| Parser/emitter work units | 8,000,000 |

All limits must be positive safe integers; configurable depth is capped at 256. AST budgets include text, URLs, extension JSON and fallback strings; parser allocation accounting can be conservative because discarded intermediate nodes also consume budget. Node and output limits bound expansion independently of source size. Cycles and invalid child kinds are rejected. Padded table-cell expansion is charged during construction.

Failed lookahead consumes work; this matters for long unmatched bracket/backtick/angle sequences. Whitespace trimming uses explicit scans/native operations, avoiding unanchored trailing-whitespace regex backtracking. Regression tests cover adversarial shapes and malformed URL encodings.

Signals are checked at boundaries and budget checks. Synchronous JavaScript cannot process an abort event while it blocks its own event loop. Use a worker with termination when hard deadlines are needed. Arbitrary trusted plugin code can ignore budgets or run indefinitely; the engine cannot forcibly interrupt it. Limits reduce resource exposure and are not a proof of constant-time or linear-time parsing for every input.

## CSP and Trusted Types

Pure APIs have no DOM or network access and use no eval or inline handlers. Browser mounting assigns only generated HTML through a template. Under `require-trusted-types-for 'script'`, supply a narrowly scoped sink:

```js
import { mount } from '@mini/text/browser';

const policy = trustedTypes.createPolicy('mini-text', {
  createHTML: safeHTML => safeHTML,
});
const view = mount(host, markdown, {
  setHTML(template, safeHTML) {
    template.innerHTML = policy.createHTML(safeHTML);
  },
});
```

Keep that policy private and use it exclusively for MiniText's generated HTML. An identity Trusted Types policy is not itself a sanitizer. The callback is a trusted boundary. The real-browser test serves an external bundle under `default-src 'none'; script-src 'self'` plus Trusted Types enforcement; no unsafe-inline/unsafe-eval permission is required.

## Accessibility

Headings, paragraphs, lists, links, quotes and code use native semantic HTML. Enabled images always include alt text. Disabled images render their text alternatives. Tables have `thead`/`tbody` and column headers with `scope=col`. Task markers are disabled native checkboxes with state labels. Embed fallbacks use figures and captions.

The host owns page language, landmark structure, sensible heading levels, table captions when needed and destination wording. Optional plugin authors own equivalent semantics. DOM reuse preserves focus in unchanged blocks; changed blocks are replaced and selection/focus inside them is not preserved. Tests check semantics and the Chromium accessibility tree; they are not a WCAG certification or a replacement for assistive-technology testing.

Report security issues privately through GitHub's private vulnerability reporting when available; avoid posting exploit details in public issues before a fix is coordinated.
