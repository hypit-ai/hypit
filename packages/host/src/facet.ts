import type { CanonicalValue } from "@svml/protocol";

/**
 * One executable package facet understood by an exact Host ABI.
 *
 * Package loading binds the ABI and canonical identity without interpreting the implementation.
 * Only the selected Host may validate and install the opaque implementation value.
 */
export type HostFacet = {
  readonly abi: string;
  readonly identity: CanonicalValue;
  readonly implementation: unknown;
};
