import type { Block, Document, Extension, Heading, ListItem } from '../model/types.ts';
import { Budget } from '../limits.ts';
import { unescape } from '../security.ts';
import { parseInline } from './inline.ts';

const blank = (s: string) => /^\s*$/.test(s);
const fence = (s: string) => /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(s);
const heading = (s: string) => /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(s);
const quote = (s: string) => /^ {0,3}>[ \t]?(.*)$/.exec(s);
const thematic = (s: string) => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s);
const marker = (s: string) => /^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/.exec(s);

export function parseDocument(source: string, budget: Budget, extensions: readonly Extension[]): Document {
  budget.input(source);
  const normalized = source.replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd');
  const lines = normalized.split('\n');
  // Expand indentation tabs only, preserving code and inline text tabs.
  for (let i = 0; i < lines.length; i++) {
    lines[i] = lines[i]!.replace(/^[ \t]+/, indent => {
      let width = 0;
      for (const ch of indent) width += ch === '\t' ? 4 - width % 4 : 1;
      return ' '.repeat(width);
    });
  }
  return budget.node({ type: 'document', children: parseBlocks(lines, budget, extensions, 1, normalized.endsWith('\n')) });
}

export function parseBlocks(lines: readonly string[], budget: Budget, extensions: readonly Extension[], depth: number, endWithLF = true): Block[] {
  budget.check(depth);
  const nodes: Block[] = [];
  const inline = (s: string) => parseInline(s, budget, extensions, depth + 1);
  const blocks = (s: readonly string[]) => parseBlocks(s, budget, extensions, depth + 1);
  function interrupts(line: string): boolean {
    const m = marker(line);
    const f = fence(line);
    return !!(heading(line) || quote(line) || (f && !(f[2]![0] === '`' && f[3]!.includes('`'))) || thematic(line) || (m && m[4] && (!/\d/.test(m[2]![0]!) || Number.parseInt(m[2]!) === 1)));
  }
  for (let i = 0; i < lines.length;) {
    budget.tick(lines[i]!.length + 1);
    const line = lines[i]!;
    if (blank(line)) { i++; continue; }
    let matched = false;
    for (const extension of extensions) {
      const match = extension.block?.({ lines, index: i, inline, blocks, tick: n => budget.tick(n), node: n => budget.node(n) });
      if (!match) continue;
      if (!Number.isInteger(match.lines) || match.lines < 1 || match.lines > lines.length - i)
        throw new TypeError(`Extension ${extension.name} returned an invalid block length`);
      nodes.push(budget.node(match.node)); i += match.lines; matched = true; break;
    }
    if (matched) continue;
    const f = fence(line);
    if (f && !(f[2]![0] === '`' && f[3]!.includes('`'))) {
      const indent = f[1]!.length, mark = f[2]!, content: string[] = [];
      let closed = false;
      i++;
      for (; i < lines.length; i++) {
        budget.tick(lines[i]!.length + 1);
        const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(lines[i]!);
        if (close && close[1]![0] === mark[0] && close[1]!.length >= mark.length) { i++; closed = true; break; }
        const leading = /^ */.exec(lines[i]!)![0].length;
        content.push(lines[i]!.slice(Math.min(indent, leading)));
      }
      // split() contributes a terminal empty line when input ends with LF.
      const terminalLF = !closed && content.at(-1) === '';
      if (terminalLF) content.pop();
      const language = unescape(f[3]!.trim()).split(/\s+/)[0];
      nodes.push(budget.node({ type: 'codeBlock', value: content.length ? content.join('\n') + (closed || terminalLF || endWithLF ? '\n' : '') : '', ...(language ? { language } : {}) }));
      continue;
    }
    const h = heading(line);
    if (h) {
      let value = (h[2] ?? '').trim();
      let hashes = value.length;
      while (value[hashes - 1] === '#') hashes--;
      if (hashes < value.length && (hashes === 0 || value[hashes - 1] === ' ' || value[hashes - 1] === '\t')) value = value.slice(0, hashes).trimEnd();
      nodes.push(budget.node({ type: 'heading', level: h[1]!.length as Heading['level'], children: inline(value) })); i++; continue;
    }
    if (thematic(line)) { nodes.push(budget.node({ type: 'thematicBreak' })); i++; continue; }
    if (quote(line)) {
      const content: string[] = [];
      while (i < lines.length) {
        const q = quote(lines[i]!); if (!q) break;
        content.push(q[1]!); i++; budget.tick();
      }
      nodes.push(budget.node({ type: 'blockquote', children: blocks(content) })); continue;
    }
    const first = marker(line);
    if (first) {
      const ordered = /\d/.test(first[2]![0]!);
      const delimiter = ordered ? first[2]!.at(-1)! : first[2]!;
      const items: ListItem[] = [];
      let tight = true;
      while (i < lines.length) {
        const m = marker(lines[i]!);
        if (!m || /\d/.test(m[2]![0]!) !== ordered || (ordered ? m[2]!.at(-1) : m[2]) !== delimiter || thematic(lines[i]!)) break;
        const spaces = m[3]?.length ?? 1;
        const padding = spaces > 4 ? 1 : spaces;
        const indent = m[1]!.length + m[2]!.length + padding;
        const content = [(spaces > 4 ? ' '.repeat(spaces - 1) : '') + (m[4] ?? '')];
        i++;
        let separated = false;
        for (; i < lines.length;) {
          budget.tick(); const next = lines[i]!;
          if (blank(next)) {
            // A terminal blank does not make a list loose.
            let after = i + 1;
            while (after < lines.length && blank(lines[after]!)) { budget.tick(); after++; }
            if (after >= lines.length) { i = after; break; }
            const nextMarker = marker(lines[after]!);
            const sibling = nextMarker && nextMarker[1]!.length === m[1]!.length && /\d/.test(nextMarker[2]![0]!) === ordered && (ordered ? nextMarker[2]!.at(-1) : nextMarker[2]) === delimiter;
            if (sibling) { tight = false; i = after; break; }
            if (lines[after]!.startsWith(' '.repeat(indent))) { separated = true; content.push(''); i = after; continue; }
            i = after; break;
          }
          if (next.startsWith(' '.repeat(indent))) { content.push(next.slice(indent)); i++; continue; }
          // This profile deliberately requires indented list continuations.
          break;
        }
        if (separated) tight = false;
        let item: ListItem | undefined;
        for (const extension of extensions) {
          item = extension.listItem?.({ lines: content, index: 0, inline, blocks, tick: n => budget.tick(n), node: n => budget.node(n) });
          if (item) break;
        }
        items.push(budget.node(item ?? { type: 'listItem', children: blocks(content) }));
      }
      nodes.push(budget.node({ type: 'list', ordered, start: ordered ? Number.parseInt(first[2]!) : 1, tight, children: items })); continue;
    }
    if (line.startsWith('    ')) {
      const content: string[] = [];
      while (i < lines.length && (lines[i]!.startsWith('    ') || blank(lines[i]!))) {
        content.push(lines[i]!.slice(4)); i++; budget.tick();
      }
      while (content.at(-1) === '') content.pop();
      nodes.push(budget.node({ type: 'codeBlock', value: content.join('\n') + '\n' })); continue;
    }
    const content = [line.trimStart()]; i++;
    let level: 1 | 2 | undefined;
    while (i < lines.length && !blank(lines[i]!)) {
      budget.tick(lines[i]!.length + 1);
      const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[i]!);
      if (setext) { level = setext[1]![0] === '=' ? 1 : 2; i++; break; }
      if (interrupts(lines[i]!)) break;
      content.push(lines[i]!.trimStart()); i++;
    }
    const children = inline(content.join('\n').trimEnd());
    nodes.push(budget.node(level ? { type: 'heading', level, children } : { type: 'paragraph', children }));
  }
  return nodes;
}
