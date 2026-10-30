import type { Document, Extension, Inline, Node, Options, Output } from '../model/types.ts';
import { Budget, bytes, InputError } from '../limits.ts';
import { escapeHTML, safeURL } from '../security.ts';

const allowedTags = new Set(['p', 'span', 'div', 'section', 'aside', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'em', 'strong', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'hr', 'br', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'input', 'sup', 'sub', 'mark']);
const attributes: Readonly<Record<string, readonly string[]>> = { a: ['href'], img: ['src', 'alt', 'loading'], ol: ['start'], th: ['scope', 'colspan', 'rowspan'], td: ['colspan', 'rowspan'], input: ['type', 'checked', 'disabled'] };
const voidTags = new Set(['hr', 'br', 'img', 'input']);

export function emitHTML(document: Document, options: Options, budget: Budget, extensions: readonly Extension[]): string {
  const chunks: string[] = [];
  let size = 0;
  function write(value: string): void {
    size += bytes(value);
    if (size > budget.limits.maxOutputBytes) throw new InputError('MAX_OUTPUT_BYTES', 'Output byte limit exceeded');
    chunks.push(value);
  }
  function text(value: string): void {
    // Prevent escaping a huge value before applying the output budget.
    if (value.length > budget.limits.maxOutputBytes - size) throw new InputError('MAX_OUTPUT_BYTES', 'Output byte limit exceeded');
    write(escapeHTML(value));
  }
  function output(value: Output, depth: number): void {
    budget.check(depth); budget.tick();
    if (typeof value === 'string') { text(value); return; }
    if (!allowedTags.has(value.tag)) throw new TypeError(`Unsupported output tag: ${value.tag}`);
    if (value.tag === 'img' && !options.images) {
      const alt = value.attrs?.alt; if (typeof alt === 'string') text(alt); return;
    }
    let tag = `<${value.tag}`;
    for (const [key, raw] of Object.entries(value.attrs ?? {})) {
      budget.tick();
      if (!['id', 'class', 'title', 'role', 'aria-label', 'aria-hidden', 'aria-describedby'].includes(key) && !attributes[value.tag]?.includes(key)) throw new TypeError(`Unsupported output attribute: ${key}`);
      if (raw === false) continue;
      let attr = String(raw);
      if (key === 'href' || key === 'src') { const safe = safeURL(attr, key === 'src'); if (safe === undefined) continue; attr = safe; }
      if (value.tag === 'input' && key === 'type' && attr !== 'checkbox') throw new TypeError('Only checkbox inputs are supported');
      tag += ` ${key}="${escapeHTML(attr)}"`;
    }
    // Extension checkboxes are display-only, never interactive form controls.
    if (value.tag === 'input' && !value.attrs?.disabled) tag += ' disabled="true"';
    write(tag + '>');
    for (const child of value.children ?? []) output(child, depth + 1);
    if (!voidTags.has(value.tag)) write(`</${value.tag}>`);
  }
  function toOutput(node: Node, depth: number): Output {
    budget.check(depth); budget.tick();
    if (node.type === 'text') return node.value;
    if (node.type === 'extension') {
      const handler = extensions.find(e => e.name === node.name)?.render;
      return handler ? handler(node, node.children.map(n => toOutput(n, depth + 1))) : node.fallback;
    }
    switch (node.type) {
      case 'code': return { tag: 'code', children: [node.value] };
      case 'hardBreak': return { tag: 'br' };
      case 'softBreak': return '\n';
      case 'image': return options.images && safeURL(node.url, true) !== undefined ? { tag: 'img', attrs: { src: node.url, alt: node.alt, loading: 'lazy', ...(node.title === undefined ? {} : { title: node.title }) } } : node.alt;
      case 'link': return safeURL(node.url) === undefined ? { tag: 'span', children: node.children.map(n => toOutput(n, depth + 1)) } : { tag: 'a', attrs: { href: node.url, ...(node.title === undefined ? {} : { title: node.title }) }, children: node.children.map(n => toOutput(n, depth + 1)) };
      case 'emphasis': case 'strong': return { tag: node.type === 'strong' ? 'strong' : 'em', children: node.children.map(n => toOutput(n, depth + 1)) };
      default: return ''; // Block extensions should use their block children directly in their renderer.
    }
  }
  function visit(node: Node, depth: number, tight = false): void {
    budget.check(depth); budget.tick();
    const children = (nodes: readonly Node[]) => { for (const child of nodes) visit(child, depth + 1); };
    switch (node.type) {
      case 'document': children(node.children); break;
      case 'text': text(node.value); break;
      case 'code': write('<code>'); text(node.value); write('</code>'); break;
      case 'softBreak': write('\n'); break;
      case 'hardBreak': write('<br>\n'); break;
      case 'paragraph': if (!tight) write('<p>'); children(node.children); if (!tight) write('</p>\n'); break;
      case 'heading': write(`<h${node.level}>`); children(node.children); write(`</h${node.level}>\n`); break;
      case 'emphasis': case 'strong': {
        const tag = node.type === 'strong' ? 'strong' : 'em'; write(`<${tag}>`); children(node.children); write(`</${tag}>`); break;
      }
      case 'thematicBreak': write('<hr>\n'); break;
      case 'codeBlock': write('<pre><code'); if (node.language) { write(' class="language-'); text(node.language); write('"'); } write('>'); text(node.value); write('</code></pre>\n'); break;
      case 'blockquote': write('<blockquote>\n'); children(node.children); write('</blockquote>\n'); break;
      case 'list': {
        const tag = node.ordered ? 'ol' : 'ul';
        write(`<${tag}${node.ordered && node.start !== 1 ? ` start="${node.start}"` : ''}>\n`);
        for (const item of node.children) {
          write('<li>');
          for (let i = 0; i < item.children.length; i++) {
            const child = item.children[i]!;
            if (i && item.children[i - 1]!.type === 'paragraph' && node.tight) write('\n');
            visit(child, depth + 2, node.tight);
          }
          write('</li>\n');
        }
        write(`</${tag}>\n`); break;
      }
      case 'listItem': children(node.children); break;
      case 'link': {
        const url = safeURL(node.url);
        if (url !== undefined) { write('<a href="'); text(url); write('"'); if (node.title !== undefined) { write(' title="'); text(node.title); write('"'); } write('>'); }
        children(node.children); if (url !== undefined) write('</a>'); break;
      }
      case 'image': {
        const url = options.images ? safeURL(node.url, true) : undefined;
        if (url === undefined) { text(node.alt); break; }
        write('<img src="'); text(url); write('" alt="'); text(node.alt); write('" loading="lazy"');
        if (node.title !== undefined) { write(' title="'); text(node.title); write('"'); }
        write('>'); break;
      }
      case 'extension': output(toOutput(node, depth + 1), depth + 1); if (node.kind === 'block') write('\n'); break;
    }
  }
  visit(document, 0);
  return chunks.join('');
}
