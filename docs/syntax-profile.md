# MiniText Markdown 0.1 profile

The core follows a documented subset of CommonMark 0.31.2. It is intentionally not a conformant implementation of the complete specification. Unsupported constructs may appear as ordinary text or interact with supported syntax; this is not an opaque passthrough mode for arbitrary excluded syntax.

| Construct | Supported behavior | Boundary |
| --- | --- | --- |
| Paragraphs | Blank-separated blocks, soft breaks | No HTML block mode |
| Headings | ATX 1–6, optional closing hashes, Setext | No automatic IDs; no lazy container continuation |
| Thematic breaks | CommonMark stars, dashes, underscores | Precedence tested against all official examples |
| Code blocks | Backtick/tilde fences, first info word as language, four-space indented code | No highlighter or executable code |
| Quotes | Nested explicit `>` markers | Every content line must carry its quote marker |
| Lists | Bullets, ordered 0–999999999 with `.` or `)`, indented continuations, nested items, tight/loose output | Complex lazy/empty-item/indentation edge cases differ; see audit |
| Indentation | Leading tabs expand at four-column stops | Tabs immediately after quote/list markers are outside this profile |
| Emphasis | Flanking delimiter runs, underscore intraword rule, rule of three, nested emphasis/strong | Raw HTML is not a protected token region |
| Code spans | Matching backtick-run length, newline-to-space normalization, boundary-space rule | Raw HTML is not parsed ahead of code spans |
| Links | Inline destinations, balanced parentheses up to 32 levels, angle destinations, quoted or parenthesized titles | No reference/collapsed/shortcut links; no raw-HTML precedence |
| Images | Inline image destinations and plain-text alt projection | External images disabled by default; no reference images |
| Autolinks | Angle URI/email syntax | Output still obeys the URL allowlist |
| Escapes/entities | ASCII punctuation escapes, numeric refs including HTML C1 replacements, `amp`, `lt`, `gt`, `quot`, `apos`, `nbsp` | Other named entities remain literal; names are case-sensitive |
| Breaks | Soft LF, two trailing spaces or backslash for hard breaks | HTML attributes are ordinary escaped source |
| Raw HTML | Escaped text | No HTML parsing, trust toggle or sanitization bypass |

CRLF/CR normalize to LF. NUL source characters become U+FFFD. Resource-limit failures are explicit, rather than partially truncated output. HTML serialization uses semantic tags, `<br>`/`<hr>`/`<img>` void syntax, encoded attributes and deterministic line endings. Safe URL normalization percent-encodes Unicode, spaces and reserved characters without re-encoding existing percent escapes.

## Optional syntax profiles

`tables` recognizes a pipe-bearing header and matching `:?-{3,}:?` separator cells. It supports balanced code spans and escaped pipes within cells, pads short body rows and discards excess body cells. A table must start at a block boundary. Alignment uses explicit CSS classes. This is a pipe-table profile, not a claim of complete GFM table conformance.

`taskLists` recognizes `[ ]`, `[x]` and `[X]` followed by whitespace at the beginning of raw list-item content. Escaped markers and ordinary paragraph markers remain text. Checkboxes are labeled and disabled; this renderer is not a task editing UI.

`strikethrough` recognizes exact two-tilde boundaries around nonblank content without leading/trailing whitespace. Single/triple tildes and nested strikethrough are outside its profile. Other supported inline syntax can appear inside the delimiters.

Embeds are authored as typed AST descriptors. There is deliberately no source-scanning embed syntax or automatic code-fence engine discovery.

## Compatibility evidence

The committed conformance report runs every official CommonMark example and records every mismatch. Its normalization removes void slashes, inter-tag formatting newlines, boundary whitespace, quote-reference spelling differences and MiniText's explicit lazy-image attribute. It does not normalize away escaped HTML, missing reference links, URL restrictions or structural differences.

The matching example IDs are also a regression-test baseline. That baseline records demonstrated behavior, including examples incidentally compatible outside the named profile. It does not broaden the profile or turn documented mismatches into full compliance. The profile, official example corpus, purpose-written tests and security/fuzz tests should be read together.
