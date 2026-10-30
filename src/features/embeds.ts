import type { Document, Extension, ExtensionNode, Json, Node, Options, Result } from '../model/types.ts';
import { attempt, InputError } from '../limits.ts';
import { validateDocument } from '../model/validate.ts';

export interface EmbedDescriptor {
  readonly version: 1;
  readonly id: string;
  readonly engine: string;
  readonly input: Json;
  readonly options?: Readonly<Record<string, Json>>;
  readonly fallbackText: string;
}
function descriptor(value: unknown): asserts value is EmbedDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('INVALID_EMBED', 'Expected an embed descriptor');
  const data = value as Partial<EmbedDescriptor>;
  if (data.version !== 1 || typeof data.id !== 'string' || !/^[a-z\d][\w.-]{0,127}$/i.test(data.id) || typeof data.engine !== 'string' || !/^[a-z][\w.-]{0,63}$/i.test(data.engine) || typeof data.fallbackText !== 'string' || !Object.hasOwn(data, 'input') || (data.options !== undefined && (!data.options || typeof data.options !== 'object' || Array.isArray(data.options)))) throw new InputError('INVALID_EMBED', 'Invalid version, ID, engine, input, options or fallback text');
}
/** Structured data only. No engine lookup, module loading, URL requests or evaluation. */
export function embed(value: EmbedDescriptor): ExtensionNode {
  descriptor(value);
  const node: ExtensionNode = { type: 'extension', kind: 'block', name: 'embeds', data: value as unknown as Json, fallback: value.fallbackText, children: [] };
  const result = validateDocument({ type: 'document', children: [node] });
  if (!result.ok) throw new InputError(result.diagnostics[0]!.code, result.diagnostics[0]!.message);
  return node;
}
export const embeds: Extension = Object.freeze<Extension>({
  name: 'embeds',
  validate(node) {
    descriptor(node.data);
    if (node.kind !== 'block' || node.children.length) throw new InputError('INVALID_EMBED', 'Embeds must be block leaves');
  },
  render(node) {
    descriptor(node.data);
    return { tag: 'figure', attrs: { class: 'mini-text-embed' }, children: [{ tag: 'figcaption', children: [node.data.fallbackText] }] };
  },
});
export function collectEmbeds(document: Document, options: Options = {}): Result<readonly EmbedDescriptor[]> {
  return attempt(() => {
    const valid = validateDocument(document, options);
    if (!valid.ok) throw new InputError(valid.diagnostics[0]!.code, valid.diagnostics[0]!.message);
    const found: EmbedDescriptor[] = [], ids = new Set<string>();
    function visit(node: Node): void {
      if (node.type === 'extension' && node.name === 'embeds') {
        descriptor(node.data);
        if (ids.has(node.data.id)) throw new InputError('DUPLICATE_EMBED_ID', `Duplicate embed ID: ${node.data.id}`);
        ids.add(node.data.id); found.push(node.data);
      }
      if ('children' in node) node.children.forEach(visit);
    }
    visit(document); return found;
  });
}
