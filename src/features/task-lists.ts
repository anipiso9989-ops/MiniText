import type { Extension } from '../model/types.ts';
import { InputError } from '../limits.ts';

/** Recognizes raw item source, so escaped task markers remain ordinary text. */
export const taskLists: Extension = Object.freeze<Extension>({
  name: 'task-lists',
  validate(node) {
    if (node.kind !== 'inline' || typeof node.data !== 'boolean' || node.children.length) throw new InputError('INVALID_TASK', 'Invalid task marker');
  },
  listItem({ lines, blocks }) {
    const match = /^\[([ xX])\][ \t]+(.*)$/.exec(lines[0] ?? '');
    if (!match) return;
    const checked = match[1]!.toLowerCase() === 'x';
    const children = blocks([match[2]!, ...lines.slice(1)]);
    const first = children[0];
    const mark = { type: 'extension', kind: 'inline', name: 'task-lists', data: checked, fallback: checked ? '[x] ' : '[ ] ', children: [] } as const;
    if (first?.type === 'paragraph') children[0] = { ...first, children: [mark, { type: 'text', value: ' ' }, ...first.children] };
    else children.unshift({ type: 'paragraph', children: [mark] });
    return { type: 'listItem', children };
  },
  render(node) {
    return { tag: 'input', attrs: { type: 'checkbox', checked: node.data === true, disabled: true, 'aria-label': node.data === true ? 'Completed task' : 'Incomplete task' } };
  },
});
