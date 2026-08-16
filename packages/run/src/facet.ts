import type { GraphFragment } from "@narratage/elaborator";
import type { HostFacet } from "@narratage/host";

import type {
  RunFragmentPackage,
} from "./types.js";

export const runFragmentHostAbi = "narratage.run-fragment-host@1";

export type RunFragmentHostFacet = HostFacet & {
  readonly abi: typeof runFragmentHostAbi;
  readonly offers: readonly string[];
  readonly implementation: RunFragmentPackage;
};

function validateFragments(fragments: Readonly<Record<string, GraphFragment>>): void {
  for (const [name, fragment] of Object.entries(fragments)) {
    if (name.trim().length === 0 || fragment.id.trim().length === 0) {
      throw new Error("Run Fragment Host facet has an invalid export");
    }
  }
}

/** Package helper: expose inert Run Fragments through the exact Run Host ABI. */
export function createRunFragmentHostFacet(item: RunFragmentPackage): RunFragmentHostFacet {
  if (item.name.trim().length === 0) throw new Error("Run Fragment Host facet package name is empty");
  validateFragments(item.fragments);
  return {
    abi: runFragmentHostAbi,
    offers: [item.name],
    implementation: item,
  };
}

/**
 * Install only facets addressed to this Host ABI. Package loading itself never interprets or
 * activates the executable Fragment objects.
 */
export function installRunFragmentHostFacets(
  facets: readonly HostFacet[],
  registry: { register(item: RunFragmentPackage): void },
): void {
  for (const opaque of facets) {
    if (opaque.abi !== runFragmentHostAbi) continue;
    if (opaque.implementation === null || typeof opaque.implementation !== "object"
      || Array.isArray(opaque.implementation)) {
      throw new Error("Run Fragment Host facet has an invalid implementation");
    }
    const facet = opaque as RunFragmentHostFacet;
    if (typeof facet.implementation.name !== "string"
      || facet.implementation.fragments === null
      || typeof facet.implementation.fragments !== "object"
      || Array.isArray(facet.implementation.fragments)) {
      throw new Error("Run Fragment Host facet has an invalid package implementation");
    }
    validateFragments(facet.implementation.fragments);
    registry.register(facet.implementation);
  }
}
