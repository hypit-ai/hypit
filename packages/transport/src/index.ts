import type { CanonicalValue } from "@svml/protocol";

/** One canonical JSON exchange; it owns no capability routing or operation semantics. */
export interface JsonInvoker {
  invoke(request: CanonicalValue, options?: { readonly signal?: AbortSignal }): Promise<CanonicalValue>;
}
