import type { HostFacet } from "@narratage/host";
import { canonicalStringify, isDigest } from "@narratage/protocol";
import { sourceFrontendPackageAbi } from "@narratage/source";

import type { RunFrontend } from "./types.js";

export type RunFrontendHostFacet = HostFacet & {
  readonly abi: typeof sourceFrontendPackageAbi;
  readonly offers: readonly [string];
  readonly identity: {
    readonly kind: "run";
    readonly implementationDigest: string;
  };
  readonly implementation: RunFrontend;
};

export function createRunFrontendHostFacet(frontend: RunFrontend): RunFrontendHostFacet {
  if (frontend.id.trim().length === 0 || !isDigest(frontend.implementationDigest)) {
    throw new Error("Run Frontend Host facet has an invalid implementation identity");
  }
  return {
    abi: sourceFrontendPackageAbi,
    offers: [frontend.id],
    identity: {
      kind: "run",
      implementationDigest: frontend.implementationDigest,
    },
    implementation: frontend,
  };
}

export function runFrontendsFromHostFacets(facets: readonly HostFacet[]): readonly RunFrontend[] {
  const values: RunFrontend[] = [];
  for (const opaque of facets) {
    if (opaque.abi !== sourceFrontendPackageAbi
      || opaque.identity === null || typeof opaque.identity !== "object" || Array.isArray(opaque.identity)
      || (opaque.identity as { readonly kind?: unknown }).kind !== "run") continue;
    const facet = opaque as RunFrontendHostFacet;
    const frontend = facet.implementation;
    const expected = createRunFrontendHostFacet(frontend);
    if (canonicalStringify(facet.offers) !== canonicalStringify(expected.offers)
      || canonicalStringify(facet.identity) !== canonicalStringify(expected.identity)) {
      throw new Error(`Run Frontend Host facet ${frontend.id} differs from its locked identity`);
    }
    values.push(frontend);
  }
  return values;
}

export function installRunFrontendHostFacets(
  facets: readonly HostFacet[],
  registry: { register(frontend: RunFrontend): void },
): void {
  for (const frontend of runFrontendsFromHostFacets(facets)) registry.register(frontend);
}
