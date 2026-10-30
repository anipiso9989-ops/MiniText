import { render, defaultLimits, validateDocument } from './index.ts';
import type { Limits, Options } from './model/types.ts';

export interface RenderContext {
  readonly idPrefix: string;
  readonly limits: Limits;
  readonly signal?: AbortSignal;
}
/** Standalone protocol-v1 adapter; MiniRender is not a runtime dependency. */
export const textEngine = Object.freeze({
  protocolVersion: 1,
  name: 'text',
  inputs: ['text/markdown', 'application/vnd.mini.document+json'] as const,
  artifacts: ['text/html', 'application/vnd.mini.document+json'] as const,
  environments: ['browser', 'server', 'worker'] as const,
  render(input: unknown, options: Options, context: RenderContext) {
    const limits = { ...defaultLimits };
    for (const key of Object.keys(limits) as (keyof Limits)[]) {
      // Host and child budgets intersect; an adapter cannot relax host policy.
      (limits as Record<keyof Limits, number>)[key] = Math.min(options.limits?.[key] ?? defaultLimits[key], context.limits[key]);
    }
    const signal = options.signal && context.signal ? AbortSignal.any([options.signal, context.signal]) : options.signal ?? context.signal;
    const config: Options = { ...options, limits, ...(signal ? { signal } : {}) };
    if (typeof input === 'string') return render(input, config);
    const valid = validateDocument(input, config);
    return valid.ok ? render(valid.artifact, config) : valid;
  },
});
