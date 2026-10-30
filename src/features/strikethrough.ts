import type { Extension } from '../model/types.ts';
import { InputError } from '../limits.ts';

/** Two tildes, nonblank content, no leading/trailing whitespace or nesting. */
export const strikethrough: Extension = Object.freeze<Extension>({
  name: 'strikethrough',
  validate(node) {
    if (node.kind !== 'inline') throw new InputError('INVALID_STRIKETHROUGH', 'Strikethrough must be inline');
  },
  inline({ source, index, parse, tick }) {
    if (!source.startsWith('~~', index) || source[index - 1] === '~' || source[index + 2] === '~') return;
    let end = index + 2;
    for (; end < source.length; end++) {
      tick();
      if (source[end] === '\\') { end++; continue; }
      if (source[end] === '`') {
        let after = end + 1; while (source[after] === '`') after++;
        const mark = source.slice(end, after);
        let search = after;
        for (;;) {
          const found = source.indexOf(mark, search);
          tick((found < 0 ? source.length : found) - search + 1);
          if (found < 0) break;
          let finish = found + mark.length; while (source[finish] === '`') finish++;
          if (source[found - 1] !== '`' && finish === found + mark.length) { end = finish - 1; break; }
          search = finish;
        }
        continue;
      }
      if (source.startsWith('~~', end) && source[end - 1] !== '~' && source[end + 2] !== '~') break;
    }
    if (end >= source.length) return;
    const content = source.slice(index + 2, end);
    if (!content || /^\s|\s$/.test(content)) return;
    return { length: end + 2 - index, node: { type: 'extension', kind: 'inline', name: 'strikethrough', data: null, fallback: content, children: parse(content) } };
  },
  render(_node, children) { return { tag: 's', children }; },
});
