import type { Document, Inline, Node, Options, Result } from '../model/types.ts';
import { validateDocument, inspectDocument } from '../model/validate.ts';
import { attempt, Budget, bytes, InputError } from '../limits.ts';
import { inlineText } from '../parse/inline.ts';

export type Path = readonly number[];
export function fromJSON(source: string, options: Options = {}): Result<Document> {
  return attempt(() => {
    const budget = new Budget(options); budget.input(source);
    let value: unknown;
    try { value = JSON.parse(source); }
    catch { throw new InputError('INVALID_JSON', 'Invalid document JSON'); }
    inspectDocument(value, budget); return value;
  });
}
export function toJSON(document: Document, options: Options = {}): Result<string> {
  return attempt(() => {
    const budget = new Budget(options); inspectDocument(document, budget);
    const source = JSON.stringify(document);
    if (bytes(source) > budget.limits.maxOutputBytes) throw new InputError('MAX_OUTPUT_BYTES', 'JSON output byte limit exceeded');
    return source;
  });
}
function at(document: Document, path: Path): Node {
  let node: Node = document;
  for (const index of path) {
    if (!Number.isSafeInteger(index) || index < 0 || !('children' in node) || !node.children[index]) throw new InputError('INVALID_PATH', 'Node path does not exist');
    node = node.children[index]!;
  }
  return node;
}
function update(document: Document, path: Path, transform: (node: Node) => Node): Document {
  const descend = (node: Node, index: number): Node => {
    if (index === path.length) return transform(node);
    if (!('children' in node)) throw new InputError('INVALID_PATH', 'Node has no children');
    const children: Node[] = [...node.children];
    children[path[index]!] = descend(children[path[index]!]!, index + 1);
    return { ...node, children } as Node;
  };
  return descend(document, 0) as Document;
}
/** Copies ancestors on the changed path and shares all untouched subtrees. */
export function spliceChildren(document: Document, path: Path, index: number, remove: number, insert: readonly Node[], options: Options = {}): Result<Document> {
  return attempt(() => {
    const budget = new Budget(options); inspectDocument(document, budget);
    const parent = at(document, path);
    if (!('children' in parent) || !Number.isSafeInteger(index) || !Number.isSafeInteger(remove) || index < 0 || remove < 0 || index + remove > parent.children.length) throw new InputError('INVALID_RANGE', 'Invalid child range');
    if (insert.length > budget.limits.maxNodes) throw new InputError('MAX_NODES', 'Inserted node limit exceeded');
    const result = update(document, path, node => ({ ...node, children: [...parent.children.slice(0, index), ...insert, ...parent.children.slice(index + remove)] } as Node));
    inspectDocument(result, new Budget(options)); return result;
  });
}
function range(node: Node, from: number, to: number): asserts node is Extract<Inline, { type: 'text' }> {
  if (node.type !== 'text' || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to > node.value.length) throw new InputError('INVALID_RANGE', 'Expected a text node and UTF-16 character range');
  // Never split a surrogate pair, even though JavaScript offsets are UTF-16.
  for (const offset of [from, to]) if (offset > 0 && offset < node.value.length && /[\ud800-\udbff]/.test(node.value[offset - 1]!) && /[\udc00-\udfff]/.test(node.value[offset]!)) throw new InputError('INVALID_RANGE', 'Range splits a Unicode surrogate pair');
}
export function replaceText(document: Document, path: Path, from: number, to: number, text: string, options: Options = {}): Result<Document> {
  return attempt(() => {
    const budget = new Budget(options); inspectDocument(document, budget); budget.input(text);
    const node = at(document, path); range(node, from, to);
    const result = update(document, path, () => ({ type: 'text', value: node.value.slice(0, from) + text + node.value.slice(to) }));
    inspectDocument(result, new Budget(options)); return result;
  });
}
export function applyMark(document: Document, path: Path, from: number, to: number, mark: 'emphasis' | 'strong', options: Options = {}): Result<Document> {
  return attempt(() => {
    inspectDocument(document, new Budget(options));
    if (mark !== 'emphasis' && mark !== 'strong') throw new TypeError('Unknown text mark');
    const node = at(document, path); range(node, from, to);
    if (from === to) return document;
    const replacement: Inline[] = [];
    if (from) replacement.push({ type: 'text', value: node.value.slice(0, from) });
    replacement.push({ type: mark, children: [{ type: 'text', value: node.value.slice(from, to) }] });
    if (to < node.value.length) replacement.push({ type: 'text', value: node.value.slice(to) });
    const result = spliceChildren(document, path.slice(0, -1), path.at(-1)!, 1, replacement, options);
    if (!result.ok) throw new InputError(result.diagnostics[0]!.code, result.diagnostics[0]!.message);
    return result.artifact;
  });
}
export interface OutlineEntry { readonly level: number; readonly text: string; readonly path: Path }
export function outline(document: Document, options: Options = {}): Result<readonly OutlineEntry[]> {
  return attempt(() => {
    inspectDocument(document, new Budget(options));
    const entries: OutlineEntry[] = [];
    function visit(node: Node, path: Path): void {
      if (node.type === 'heading') entries.push({ level: node.level, text: inlineText(node.children), path });
      if ('children' in node) node.children.forEach((child, i) => visit(child, [...path, i]));
    }
    visit(document, []); return entries;
  });
}
/** A caller-owned, bounded history. Drop it (or clear it) to release retained versions. */
export function createHistory(initial: Document, capacity = 100, options: Options = {}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new TypeError('History capacity must be a positive integer');
  const valid = validateDocument(initial, options);
  if (!valid.ok) throw new TypeError(valid.diagnostics[0]!.message);
  let current = initial;
  const past: Document[] = [], future: Document[] = [];
  return Object.freeze({
    get document() { return current; },
    commit(next: Document): Result<Document> {
      const result = validateDocument(next, options);
      if (!result.ok || next === current) return result;
      past.push(current); if (past.length > capacity) past.shift();
      current = next; future.length = 0; return result;
    },
    undo(): Document { if (past.length) { future.push(current); current = past.pop()!; } return current; },
    redo(): Document { if (future.length) { past.push(current); current = future.pop()!; } return current; },
    clear(): void { past.length = 0; future.length = 0; },
  });
}
