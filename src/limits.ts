import type { Diagnostic, Limits, Options, Result } from './model/types.ts';

export const defaultLimits: Limits = Object.freeze({
  maxInputBytes: 1_000_000, maxNodes: 100_000, maxDepth: 64,
  maxOutputBytes: 4_000_000, maxWork: 8_000_000,
});
export class InputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = 'InputError'; }
}
/** No shared encoder buffer or retained document state. */
export function bytes(text: string): number {
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 128) size++;
    else if (c < 2048) size += 2;
    else if (c >= 0xd800 && c <= 0xdbff && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { size += 4; i++; }
    else size += 3;
  }
  return size;
}
export class Budget {
  readonly limits: Limits;
  readonly options: Options;
  private nodes = 0;
  private work = 0;
  constructor(options: Options) {
    this.options = options;
    this.limits = { ...defaultLimits, ...options.limits };
    for (const [key, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`Invalid limit: ${key}`);
    }
    if (this.limits.maxDepth > 256) throw new TypeError('maxDepth must be at most 256');
    this.check();
  }
  check(depth = 0): void {
    if (this.options.signal?.aborted) throw new InputError('CANCELLED', 'Rendering was cancelled');
    if (depth > this.limits.maxDepth) throw new InputError('MAX_DEPTH', 'Document nesting limit exceeded');
  }
  tick(amount = 1): void {
    this.work += amount;
    if (this.work > this.limits.maxWork) throw new InputError('MAX_WORK', 'Parser work limit exceeded');
    this.check();
  }
  node<T>(node: T): T {
    if (++this.nodes > this.limits.maxNodes) throw new InputError('MAX_NODES', 'Document node limit exceeded');
    this.tick();
    return node;
  }
  input(source: string): void {
    // Cheap rejection before UTF-8 counting or normalization allocations.
    if (source.length > this.limits.maxInputBytes || bytes(source) > this.limits.maxInputBytes)
      throw new InputError('MAX_INPUT_BYTES', 'Input byte limit exceeded');
  }
}
export function attempt<T>(run: () => T, diagnostics: Diagnostic[] = []): Result<T> {
  try { return { ok: true, artifact: run(), diagnostics }; }
  catch (error) {
    if (!(error instanceof InputError)) throw error;
    return { ok: false, diagnostics: [...diagnostics, { code: error.code, severity: 'error', message: error.message }] };
  }
}
