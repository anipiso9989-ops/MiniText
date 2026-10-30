import type { Diagnostic, Document, Extension, HtmlArtifact, Options, Result } from './model/types.ts';
import { attempt, Budget } from './limits.ts';
import { parseDocument } from './parse/block.ts';
import { inspectDocument } from './model/validate.ts';
import { emitHTML } from './backends/html.ts';

export type * from './model/types.ts';
export { defaultLimits } from './limits.ts';
export { InputError } from './limits.ts';
export { validateDocument } from './model/validate.ts';

function extensionsFor(options: Options): readonly Extension[] {
  const extensions = options.extensions ?? [];
  const names = new Set<string>();
  for (const extension of extensions) {
    if (!extension.name || names.has(extension.name)) throw new TypeError(`Invalid or duplicate extension: ${extension.name}`);
    names.add(extension.name);
  }
  return extensions;
}
function parsed(source: string, options: Options, extensions: readonly Extension[]): Document {
  if (typeof source !== 'string') throw new TypeError('Markdown source must be a string');
  let document = parseDocument(source, new Budget(options), extensions);
  inspectDocument(document, new Budget(options));
  for (const extension of extensions) {
    if (extension.transform) { document = extension.transform(document); inspectDocument(document, new Budget(options)); }
  }
  return document;
}
/** Parse and transform source into the shared immutable-by-convention document AST. */
export function parse(source: string, options: Options = {}): Result<Document> {
  return attempt(() => parsed(source, options, extensionsFor(options)));
}
/** AST input is validated, but is not transformed a second time. */
export function render(input: string | Document, options: Options = {}): Result<HtmlArtifact> {
  const diagnostics: Diagnostic[] = [];
  return attempt(() => {
    const extensions = extensionsFor(options);
    const document = typeof input === 'string' ? parsed(input, options, extensions) : input;
    if (typeof input !== 'string') inspectDocument(document, new Budget(options));
    const html = emitHTML(document, options, new Budget(options), extensions);
    return { html, document };
  }, diagnostics);
}
/** Instance-local configuration; no registry, cache, eager feature imports, or startup work. */
export function createMiniText(options: Options = {}) {
  const config: Options = { ...options, ...(options.limits ? { limits: { ...options.limits } } : {}), extensions: Object.freeze([...(options.extensions ?? [])].map(e => Object.freeze({ ...e }))) };
  extensionsFor(config);
  return Object.freeze({ parse: (source: string) => parse(source, config), render: (input: string | Document) => render(input, config) });
}
