import type { CanonicalValue } from "@narratage/protocol";

/**
 * One executable package facet understood by an exact Host ABI.
 *
 * Package loading binds the ABI and canonical identity without interpreting the implementation.
 * Only the selected Host may validate and install the opaque implementation value.
 */
export type HostFacet = {
  readonly abi: string;
  /** Logical names this exact facet offers through its opaque Host ABI. */
  readonly offers?: readonly string[];
  /** ABI-owned inert declaration, present only when the ABI has facts beyond its offers. */
  readonly identity?: CanonicalValue;
  readonly implementation: unknown;
};
