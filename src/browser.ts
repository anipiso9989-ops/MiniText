import { render } from './index.ts';
import type { Document, HtmlArtifact, Options, Result } from './model/types.ts';

export interface BrowserOptions extends Options {
  /** Optional Trusted Types integration. Must only assign the supplied safe HTML. */
  readonly setHTML?: (template: HTMLTemplateElement, html: string) => void;
}
export interface View {
  update(input: string | Document): Result<HtmlArtifact>;
  dispose(): void;
}
/** Owns the host's children. No DOM globals are read until mount is called. */
export function mount(host: Element, input: string | Document, options: BrowserOptions = {}): Result<View> {
  let disposed = false, lastHTML: string | undefined;
  let owned: ChildNode[] = [];
  const config: BrowserOptions = { ...options, ...(options.limits ? { limits: { ...options.limits } } : {}), extensions: [...(options.extensions ?? [])].map(extension => ({ ...extension })) };
  const view: View = {
    update(next) {
      if (disposed) throw new Error('MiniText view has been disposed');
      const result = render(next, config);
      if (!result.ok || result.artifact.html === lastHTML) return result;
      const template = host.ownerDocument.createElement('template');
      if (config.setHTML) config.setHTML(template, result.artifact.html);
      else template.innerHTML = result.artifact.html;
      const children = Array.from(template.content.childNodes);
      // Reuse unchanged prefix/suffix blocks, including focus-bearing descendants.
      let start = 0, end = 0;
      while (start < owned.length && start < children.length && owned[start]!.isEqualNode(children[start]!)) { children[start] = owned[start]!; start++; }
      while (end < owned.length - start && end < children.length - start && owned[owned.length - 1 - end]!.isEqualNode(children[children.length - 1 - end]!)) {
        children[children.length - 1 - end] = owned[owned.length - 1 - end]!; end++;
      }
      const keep = new Set(children);
      for (const node of Array.from(host.childNodes)) if (!keep.has(node)) host.removeChild(node);
      for (let i = 0; i < children.length; i++) {
        if (host.childNodes[i] !== children[i]) host.insertBefore(children[i]!, host.childNodes[i] ?? null);
      }
      owned = children; lastHTML = result.artifact.html;
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const node of owned) if (node.parentNode === host) host.removeChild(node);
      owned = []; lastHTML = undefined;
    },
  };
  const result = view.update(input);
  return result.ok ? { ok: true, artifact: view, diagnostics: result.diagnostics } : result;
}
