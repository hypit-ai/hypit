import { canonicalStringify, isDigest } from "@narratage/protocol";
import { sourceFrontendPackageAbi } from "@narratage/source";

import type { AuthorFrontend } from "./source.js";

export type AuthorFrontendHostFacet = {
  readonly abi: typeof sourceFrontendPackageAbi;
  readonly offers: readonly [string];
  readonly identity: {
    readonly kind: "author";
    readonly implementationDigest: string;
  };
  readonly implementation: AuthorFrontend;
};

export function createAuthorFrontendHostFacet(frontend: AuthorFrontend): AuthorFrontendHostFacet {
  if (frontend.id.trim().length === 0 || !isDigest(frontend.implementationDigest)) {
    throw new Error("Author Frontend Host facet has an invalid implementation identity");
  }
  return {
    abi: sourceFrontendPackageAbi,
    offers: [frontend.id],
    identity: {
      kind: "author",
      implementationDigest: frontend.implementationDigest,
    },
    implementation: frontend,
  };
}

export function authorFrontendsFromHostFacets(facets: readonly unknown[]): readonly AuthorFrontend[] {
  const values: AuthorFrontend[] = [];
  for (const opaque of facets) {
    if (opaque === null || typeof opaque !== "object" || Array.isArray(opaque)) continue;
    const candidate = opaque as { readonly abi?: unknown; readonly identity?: unknown };
    if (candidate.abi !== sourceFrontendPackageAbi
      || candidate.identity === null || typeof candidate.identity !== "object" || Array.isArray(candidate.identity)
      || (candidate.identity as { readonly kind?: unknown }).kind !== "author") continue;
    const facet = opaque as AuthorFrontendHostFacet;
    const frontend = facet.implementation;
    const expected = createAuthorFrontendHostFacet(frontend);
    if (canonicalStringify(facet.offers) !== canonicalStringify(expected.offers)
      || canonicalStringify(facet.identity) !== canonicalStringify(expected.identity)) {
      throw new Error(`Author Frontend Host facet ${frontend.id} differs from its locked identity`);
    }
    values.push(frontend);
  }
  return values;
}

export function installAuthorFrontendHostFacets(
  facets: readonly unknown[],
  registry: { register(frontend: AuthorFrontend): void },
): void {
  for (const frontend of authorFrontendsFromHostFacets(facets)) registry.register(frontend);
}
