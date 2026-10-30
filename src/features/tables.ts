import type { Extension, ExtensionNode, Json } from '../model/types.ts';
import { InputError } from '../limits.ts';

function cells(source: string): string[] {
  const line = source.trim();
  const parts: string[] = [];
  let value = '', ticks = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '\\' && i + 1 < line.length) { value += ch + line[++i]; continue; }
    if (ch === '`') {
      let run = 1; while (line[i + run] === '`') run++;
      if (!ticks) ticks = run; else if (run === ticks) ticks = 0;
      value += '`'.repeat(run); i += run - 1; continue;
    }
    if (ch === '|' && !ticks) { parts.push(value.trim()); value = ''; } else value += ch;
  }
  parts.push(value.trim());
  if (line.startsWith('|')) parts.shift();
  if (line.endsWith('|') && parts.at(-1) === '') parts.pop();
  return parts;
}
function node(role: string, children: ExtensionNode['children'], data: Readonly<Record<string, Json>> = {}): ExtensionNode {
  return { type: 'extension', kind: 'block', name: 'tables', content: role === 'cell' ? 'inline' : 'block', data: { role, ...data }, fallback: '', children };
}
export const tables: Extension = Object.freeze<Extension>({
  name: 'tables',
  validate(n) {
    const data = n.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || n.kind !== 'block') throw new InputError('INVALID_TABLE', 'Invalid table node');
    const d = data as Readonly<Record<string, Json>>;
    if (!['table', 'row', 'cell'].includes(String(d.role))) throw new InputError('INVALID_TABLE', 'Invalid table role');
    if (d.role === 'cell') {
      if (n.content !== 'inline' || typeof d.header !== 'boolean' || !['', 'left', 'center', 'right'].includes(String(d.align))) throw new InputError('INVALID_TABLE', 'Invalid table cell');
    } else {
      const role = d.role === 'table' ? 'row' : 'cell';
      if (n.content !== 'block' || !n.children.length || n.children.some(child => child.type !== 'extension' || child.name !== 'tables' || !child.data || typeof child.data !== 'object' || Array.isArray(child.data) || (child.data as Readonly<Record<string, Json>>).role !== role)) throw new InputError('INVALID_TABLE', 'Invalid table children');
    }
  },
  block({ lines, index, inline, tick, node: account }) {
    const header = lines[index]!, delimiter = lines[index + 1];
    if (!delimiter || !header.includes('|') || !delimiter.includes('|')) return;
    tick(header.length + delimiter.length);
    const headings = cells(header), separators = cells(delimiter);
    if (!headings.length || headings.length !== separators.length || separators.some(s => !/^:?-{3,}:?$/.test(s))) return;
    const aligns = separators.map(s => s.startsWith(':') ? s.endsWith(':') ? 'center' : 'left' : s.endsWith(':') ? 'right' : '');
    const row = (values: readonly string[], head: boolean) => account(node('row', headings.map((_h, i) => account(node('cell', inline(values[i] ?? ''), { header: head, align: aligns[i]! }))), {}));
    const rows = [row(headings, true)];
    let i = index + 2;
    while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) { tick(lines[i]!.length); rows.push(row(cells(lines[i]!), false)); i++; }
    return { lines: i - index, node: { ...node('table', rows), fallback: [header, ...lines.slice(index + 2, i)].join('\n') } };
  },
  render(n, children) {
    const data = n.data as Readonly<Record<string, Json>>;
    if (data.role === 'table') return { tag: 'table', children: [{ tag: 'thead', children: children.slice(0, 1) }, { tag: 'tbody', children: children.slice(1) }] };
    if (data.role === 'row') return { tag: 'tr', children };
    const align = ['left', 'center', 'right'].includes(String(data.align)) ? String(data.align) : '';
    return { tag: data.header ? 'th' : 'td', attrs: { ...(data.header ? { scope: 'col' } : {}), ...(align ? { class: `mini-text-align-${align}` } : {}) }, children };
  },
});
