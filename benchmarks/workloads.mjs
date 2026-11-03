import { readFileSync } from 'node:fs';

const article = readFileSync(new URL('./fixtures/article.md', import.meta.url), 'utf8');
// Deterministic shared-profile inputs; no optional features or retained parse cache.
export const workloads = {
  'article-small': article,
  'article-large': article.repeat(100),
  prose: ('Ordinary prose gives the reader a clear explanation. Every sentence adds useful context and keeps the document easy to follow.\n\n').repeat(160),
  inline: ('A **strong** idea with *emphasis*, `code`, and a [guide](/guide "Guide"). Escape \\*stars\\* and decode &amp; safely.\n\n').repeat(120),
  lists: ('## Tasks\n\n- First item\n- Second **item**\n  - Nested item\n\n> A quoted paragraph.\n>\n> Another paragraph.\n\n').repeat(100),
  code: ('```js\nfunction compare(a, b) {\n  return a < b && b > 0;\n}\n```\n\n').repeat(200),
  unicode: ('## 世界 🌍\n\nCafé naïve — Ελληνικά, 日本語, العربية and **Unicode 😀**.\n\n').repeat(160),
};
