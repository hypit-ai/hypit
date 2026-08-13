import type { SourceRange, TypeRef } from "@narratage/protocol";

/**
 * One resolvable name. The shallow interpreter only ever needs the authored
 * value, so a Scope entry is a Record value rather than a graph reference: a
 * component output that only exists after a build simply has no entry.
 */
export type ScopeEntry = {
  readonly path: string;
  readonly type: TypeRef;
  readonly value: unknown;
  readonly range: SourceRange;
};

export class Scope {
  readonly #entries = new Map<string, ScopeEntry>();

  define(path: string, type: TypeRef, value: unknown, range: SourceRange): void {
    if (this.#entries.has(path)) throw new Error(`${path} is defined more than once.`);
    this.#entries.set(path, { path, type, value, range });
  }

  resolve(path: string): ScopeEntry | undefined {
    return this.#entries.get(path);
  }

  /** Resolve or fail with the author-facing name rather than an internal id. */
  require(path: string, label: string): ScopeEntry {
    const entry = this.#entries.get(path);
    if (entry === undefined) throw new Error(`${label} cannot resolve ${path}.`);
    return entry;
  }
}

export function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}
