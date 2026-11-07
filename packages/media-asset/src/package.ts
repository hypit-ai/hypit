import type { Facet } from "@hypit/facet";
import { isTypeRef, typeIdentity } from "@hypit/protocol";

import type {
  ResolvedMediaAsset,
  ResolvedMediaRepresentation,
} from "./types.js";

export const mediaRepresentationFacetAbi = "hypit.media-representation@1";

export type MediaRepresentationOpenContext = {
  readonly asset: ResolvedMediaAsset;
  readonly representation: ResolvedMediaRepresentation;
  /** The Host exposes bytes without revealing ResourceStore or filesystem policy. */
  readonly read: (resource: import("@hypit/protocol").BlobRef) => Promise<Uint8Array>;
};

export type MediaRepresentationOwner = {
  readonly type: import("@hypit/protocol").TypeRef;
  readonly open: (context: MediaRepresentationOpenContext) => unknown | Promise<unknown>;
};

export type MediaRepresentationPackage = {
  readonly representations: readonly MediaRepresentationOwner[];
};

export type MediaRepresentationFacet = Facet & {
  readonly abi: typeof mediaRepresentationFacetAbi;
  readonly implementation: MediaRepresentationPackage;
};

export type MediaRepresentationHost = {
  readonly open: (
    asset: ResolvedMediaAsset,
    representation: string,
    read: MediaRepresentationOpenContext["read"],
  ) => Promise<unknown>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertOwner(value: MediaRepresentationOwner): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Media Representation owner must be an object.");
  assert(isTypeRef(value.type), "Media Representation owner Type is invalid.");
  assert(typeof value.open === "function", `Media Representation owner ${typeIdentity(value.type)} is not callable.`);
}

function assertPackage(value: MediaRepresentationPackage): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.representations), "Media Representation package is invalid.");
  const types = new Set<string>();
  for (const owner of value.representations) {
    assertOwner(owner);
    const key = typeIdentity(owner.type);
    assert(!types.has(key), `Media Representation package repeats ${key}.`);
    types.add(key);
  }
}

export function createMediaRepresentationFacet(
  value: MediaRepresentationPackage,
): MediaRepresentationFacet {
  assertPackage(value);
  return { abi: mediaRepresentationFacetAbi, implementation: value };
}

export function mediaRepresentationPackagesFromFacets(
  facets: readonly Facet[],
): readonly MediaRepresentationPackage[] {
  return facets.flatMap((facet) => facet.abi === mediaRepresentationFacetAbi
    ? [(facet as MediaRepresentationFacet).implementation]
    : []);
}

export function createMediaRepresentationHost(
  packages: readonly MediaRepresentationPackage[],
): MediaRepresentationHost {
  const owners = new Map<string, MediaRepresentationOwner>();
  for (const value of packages) {
    assertPackage(value);
    for (const owner of value.representations) {
      const key = typeIdentity(owner.type);
      assert(!owners.has(key), `Media Representation Host has multiple owners for ${key}.`);
      owners.set(key, owner);
    }
  }
  return {
    open: async (asset, representationId, read) => {
      const representation = asset.representations.find((candidate) => candidate.id === representationId);
      if (representation === undefined) {
        throw new Error(`Media Asset ${asset.id} has no Representation ${representationId}.`);
      }
      const key = typeIdentity(representation.type);
      const owner = owners.get(key);
      if (owner === undefined) throw new Error(`Media Representation ${key} is not installed.`);
      return await owner.open({ asset, representation, read });
    },
  };
}

export function createMediaRepresentationHostFromFacets(
  facets: readonly Facet[],
): MediaRepresentationHost {
  return createMediaRepresentationHost(mediaRepresentationPackagesFromFacets(facets));
}
