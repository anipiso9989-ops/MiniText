import type { Document, Options, Result } from './types.ts';
import { attempt, Budget, bytes, InputError } from '../limits.ts';

const fields: Readonly<Record<string, readonly string[]>> = {
  document: ['children'], text: ['value'], code: ['value'], softBreak: [], hardBreak: [],
  paragraph: ['children'], heading: ['level', 'children'], codeBlock: ['value', 'language'],
  emphasis: ['children'], strong: ['children'], link: ['url', 'title', 'children'], image: ['url', 'title', 'alt'],
  thematicBreak: [], blockquote: ['children'], list: ['ordered', 'start', 'tight', 'children'], listItem: ['children'],
  extension: ['name', 'kind', 'data', 'fallback', 'children'],
};
const blockTypes = new Set(['paragraph', 'heading', 'codeBlock', 'blockquote', 'list', 'thematicBreak']);
const inlineTypes = new Set(['text', 'code', 'softBreak', 'hardBreak', 'emphasis', 'strong', 'link', 'image']);

/** Validates without cloning. Treat accepted trees as immutable values. */
export function validateDocument(value: unknown, options: Options = {}): Result<Document> {
  return attempt(() => { inspectDocument(value, new Budget(options)); return value as Document; });
}
export function inspectDocument(value: unknown, budget: Budget): asserts value is Document {
  const ancestors = new Set<object>();
  let inputBytes = 0;
  function invalid(message: string): never { throw new InputError('INVALID_AST', message); }
  function string(value: unknown): asserts value is string {
    if (typeof value !== 'string') invalid('Expected a string');
    inputBytes += bytes(value as string);
    if (inputBytes > budget.limits.maxInputBytes) throw new InputError('MAX_INPUT_BYTES', 'AST text byte limit exceeded');
  }
  function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid('Expected a plain object');
    if (ancestors.has(value as object)) invalid('Document contains a cycle');
    return value as Record<string, unknown>;
  }
  function json(value: unknown, depth: number): void {
    budget.check(depth); budget.node(value);
    if (typeof value === 'string') { string(value); return; }
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
    if (Array.isArray(value)) {
      if (ancestors.has(value)) invalid('JSON contains a cycle');
      ancestors.add(value); for (const child of value) json(child, depth + 1); ancestors.delete(value); return;
    }
    const obj = object(value); ancestors.add(obj);
    for (const key of Object.keys(obj)) { string(key); json(obj[key], depth + 1); }
    ancestors.delete(obj);
  }
  function visit(value: unknown, expected: 'document' | 'block' | 'inline' | 'listItem', depth: number, inLink = false): void {
    budget.check(depth); budget.node(value);
    const n = object(value), type = n.type;
    if (typeof type !== 'string' || !Object.hasOwn(fields, type)) invalid('Unknown node type');
    if (type === 'extension') {
      if ((expected !== 'block' && expected !== 'inline') || n.kind !== expected) invalid('Extension has the wrong content kind');
    } else if (expected === 'block' ? !blockTypes.has(type as string) : expected === 'inline' ? !inlineTypes.has(type as string) : type !== expected) invalid('Node is not valid in this position');
    for (const key of Object.keys(n)) { budget.tick(); if (key !== 'type' && !fields[type as string]!.includes(key)) invalid(`Unexpected node field: ${key}`); }
    ancestors.add(n);
    if (type === 'text' || type === 'code' || type === 'codeBlock') string(n.value);
    if (type === 'codeBlock' && n.language !== undefined) string(n.language);
    if (type === 'heading' && (!Number.isInteger(n.level) || Number(n.level) < 1 || Number(n.level) > 6)) invalid('Heading level must be 1–6');
    if (type === 'list' && (typeof n.ordered !== 'boolean' || typeof n.tight !== 'boolean' || !Number.isSafeInteger(n.start) || Number(n.start) < 0 || Number(n.start) > 999_999_999)) invalid('Invalid list attributes');
    if (type === 'link' || type === 'image') { string(n.url); if (n.title !== undefined) string(n.title); }
    if (type === 'image') string(n.alt);
    if (type === 'link' && inLink) invalid('Links cannot contain links');
    if (type === 'extension') { string(n.name); string(n.fallback); json(n.data, depth + 1); }
    if (fields[type as string]!.includes('children')) {
      if (!Array.isArray(n.children)) invalid('Expected children array');
      const next = type === 'document' || type === 'blockquote' || type === 'listItem' ? 'block' : type === 'list' ? 'listItem' : type === 'extension' ? n.kind as 'block' | 'inline' : 'inline';
      for (const child of n.children as unknown[]) visit(child, next, depth + 1, inLink || type === 'link');
    }
    ancestors.delete(n);
  }
  visit(value, 'document', 0);
}
