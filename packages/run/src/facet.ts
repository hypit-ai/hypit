import type { GraphFragment } from "@narratage/elaborator";
import type { HostFacet } from "@narratage/host";
import { canonicalStringify, isDigest } from "@narratage/protocol";

import type {
  RunFragmentPackage,
} from "./types.js";

export const runFragmentHostAbi = "svml.run-fragment-host@1";

export type RunFragmentHostFacetIdentity = {
  readonly contract: "svml.run-fragment-host-facet@1";
  readonly package: string;
  readonly exports: readonly {
    readonly name: string;
    readonly fragment: string;
  }[];
};

export type RunFragmentHostFacet = HostFacet & {
  readonly abi: typeof runFragmentHostAbi;
  readonly identity: RunFragmentHostFacetIdentity;
  readonly implementation: RunFragmentPackage;
};

function normalizedExports(fragments: Readonly<Record<string, GraphFragment>>): RunFragmentHostFacetIdentity["exports"] {
  return Object.entries(fragments)
    .map(([name, fragment]) => {
      if (name.trim().length === 0 || !isDigest(fragment.id)) {
        throw new Error("Run Fragment Host facet has an invalid export identity");
      }
      return { name, fragment: fragment.id };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Package helper: expose inert Run Fragments through the exact Run Host ABI. */
export function createRunFragmentHostFacet(item: RunFragmentPackage): RunFragmentHostFacet {
  if (item.name.trim().length === 0) throw new Error("Run Fragment Host facet package name is empty");
  return {
    abi: runFragmentHostAbi,
    identity: {
      contract: "svml.run-fragment-host-facet@1",
      package: item.name,
      exports: normalizedExports(item.fragments),
    },
    implementation: item,
  };
}

function sameIdentity(facet: RunFragmentHostFacet): boolean {
  const expected: RunFragmentHostFacetIdentity = {
    contract: "svml.run-fragment-host-facet@1",
    package: facet.implementation.name,
    exports: normalizedExports(facet.implementation.fragments),
  };
  return canonicalStringify(facet.identity) === canonicalStringify(expected);
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
    if (opaque.identity === null || typeof opaque.identity !== "object" || Array.isArray(opaque.identity)
      || opaque.implementation === null || typeof opaque.implementation !== "object"
      || Array.isArray(opaque.implementation)) {
      throw new Error("Run Fragment Host facet has an invalid identity or implementation");
    }
    const facet = opaque as RunFragmentHostFacet;
    if (facet.identity.contract !== "svml.run-fragment-host-facet@1") {
      throw new Error("Run Fragment Host facet has an unsupported identity");
    }
    if (typeof facet.identity.package !== "string"
      || !Array.isArray(facet.identity.exports)
      || typeof facet.implementation.name !== "string"
      || facet.implementation.fragments === null
      || typeof facet.implementation.fragments !== "object"
      || Array.isArray(facet.implementation.fragments)) {
      throw new Error("Run Fragment Host facet has an invalid package implementation");
    }
    if (!sameIdentity(facet)) {
      throw new Error(`Run Fragment Host facet ${facet.identity.package} differs from its locked identity`);
    }
    registry.register(facet.implementation);
  }
}
