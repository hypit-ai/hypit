import type { GraphFragment } from "@hypit/author";
import type { Facet } from "@hypit/facet";

import type {
  RunFragmentPackage,
} from "./types.js";

export const runFragmentFacetAbi = "hypit.run-fragment@1";

export type RunFragmentFacet = Facet & {
  readonly abi: typeof runFragmentFacetAbi;
  readonly address: string;
  readonly implementation: RunFragmentPackage;
};

function validateFragments(fragments: Readonly<Record<string, GraphFragment>>): void {
  for (const [name, fragment] of Object.entries(fragments)) {
    if (name.trim().length === 0 || fragment.format !== "hypit.fragment@1") {
      throw new Error("Run Fragment facet has an invalid export");
    }
  }
}

/** Package helper: expose inert Run Fragments through the exact Run Fragment ABI. */
export function createRunFragmentFacet(item: RunFragmentPackage): RunFragmentFacet {
  if (item.name.trim().length === 0) throw new Error("Run Fragment facet package name is empty");
  validateFragments(item.fragments);
  return {
    abi: runFragmentFacetAbi,
    address: item.name,
    implementation: item,
  };
}

/**
 * Install only facets addressed to this Facet ABI. Package loading itself never interprets or
 * activates the executable Fragment objects.
 */
export function installRunFragmentFacets(
  facets: readonly Facet[],
  registry: { register(item: RunFragmentPackage): void },
): void {
  for (const opaque of facets) {
    if (opaque.abi !== runFragmentFacetAbi) continue;
    if (opaque.implementation === null || typeof opaque.implementation !== "object"
      || Array.isArray(opaque.implementation)) {
      throw new Error("Run Fragment facet has an invalid implementation");
    }
    const facet = opaque as RunFragmentFacet;
    if (typeof facet.implementation.name !== "string"
      || facet.implementation.fragments === null
      || typeof facet.implementation.fragments !== "object"
      || Array.isArray(facet.implementation.fragments)) {
      throw new Error("Run Fragment facet has an invalid package implementation");
    }
    validateFragments(facet.implementation.fragments);
    if (facet.address !== facet.implementation.name) {
      throw new Error("Run Fragment facet address does not match its implementation");
    }
    registry.register(facet.implementation);
  }
}
